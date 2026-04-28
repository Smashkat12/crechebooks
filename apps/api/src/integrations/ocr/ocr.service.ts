/**
 * OCRService
 *
 * Stateless OCR extraction for proof-of-payment documents.
 *
 * - extractFromImage: runs tesseract.js worker.recognize directly
 * - extractFromPdf:   tries pdf-parse text layer first; falls back to
 *   tesseract via pdf-to-png-converter when text < 100 chars (page 1 only)
 *
 * 30-second timeout per call. On timeout: return { text: '', confidence: 0 }
 * and log a warning. Never throws on timeout.
 *
 * NOTE: TesseractOcrParser (database/parsers/tesseract-ocr-parser.ts) is bank-
 * statement specific (transaction parsing). This service is PoP-specific — raw
 * text + confidence only.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createWorker, OEM, PSM } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { pdfToPng } from 'pdf-to-png-converter';

export interface OcrResult {
  text: string;
  /** Tesseract confidence 0–100, or 100 when pdf text layer succeeds */
  confidence: number;
}

/** Minimum chars to consider pdf text-layer extraction sufficient */
const PDF_TEXT_THRESHOLD = 100;

/** Hard timeout per OCR call in ms */
const OCR_TIMEOUT_MS = 30_000;

@Injectable()
export class OCRService {
  private readonly logger = new Logger(OCRService.name);

  /**
   * Extract text from an image buffer using tesseract.js directly.
   */
  async extractFromImage(buffer: Buffer): Promise<OcrResult> {
    return this.withTimeout(
      this.runTesseractOnBuffer(buffer),
      'extractFromImage',
    );
  }

  /**
   * Extract text from a PDF buffer.
   *
   * Strategy:
   *  1. Try pdf-parse text layer. If >= 100 chars → done (confidence 100).
   *  2. Otherwise convert page 1 to PNG and run tesseract.
   */
  async extractFromPdf(buffer: Buffer): Promise<OcrResult> {
    return this.withTimeout(this.doPdfExtract(buffer), 'extractFromPdf');
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async doPdfExtract(buffer: Buffer): Promise<OcrResult> {
    // Step 1: text layer
    try {
      const parsed = await pdfParse(buffer);
      const text = parsed.text?.trim() ?? '';
      if (text.length >= PDF_TEXT_THRESHOLD) {
        this.logger.log(
          `extractFromPdf: text layer ok (${text.length} chars), skipping OCR`,
        );
        return { text, confidence: 100 };
      }
      this.logger.log(
        `extractFromPdf: text layer thin (${text.length} chars), falling back to tesseract`,
      );
    } catch (err) {
      this.logger.warn(
        `extractFromPdf: pdf-parse failed (${(err as Error).message}), falling back to tesseract`,
      );
    }

    // Step 2: tesseract on page 1 only
    let pages: Array<{ content?: Buffer }>;
    try {
      const uint8 = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.length,
      );
      pages = await pdfToPng(uint8.buffer as ArrayBuffer, {
        disableFontFace: true,
        useSystemFonts: true,
        viewportScale: 2.0,
        pagesToProcess: [1],
      });
    } catch (err) {
      this.logger.warn(
        `extractFromPdf: pdf-to-png failed (${(err as Error).message}), returning empty`,
      );
      return { text: '', confidence: 0 };
    }

    const page = pages[0];
    if (!page?.content) {
      this.logger.warn('extractFromPdf: page 1 has no content');
      return { text: '', confidence: 0 };
    }

    return this.runTesseractOnBuffer(page.content);
  }

  private async runTesseractOnBuffer(buffer: Buffer): Promise<OcrResult> {
    const worker = await createWorker(['eng'], OEM.LSTM_ONLY, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          this.logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });

      const result = await worker.recognize(
        buffer as unknown as Parameters<typeof worker.recognize>[0],
      );
      const text = result.data.text?.trim() ?? '';
      const confidence = result.data.confidence ?? 0;

      this.logger.log(
        `OCR complete: ${text.length} chars, confidence=${confidence.toFixed(1)}%`,
      );

      return { text, confidence };
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Wrap a promise with a hard 30-second timeout.
   * On timeout: log warning and return empty result — do not throw.
   */
  private async withTimeout(
    promise: Promise<OcrResult>,
    label: string,
  ): Promise<OcrResult> {
    let timer: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<OcrResult>((resolve) => {
      timer = setTimeout(() => {
        this.logger.warn(
          `OCRService.${label} timed out after ${OCR_TIMEOUT_MS}ms — returning empty`,
        );
        resolve({ text: '', confidence: 0 });
      }, OCR_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result;
    } finally {
      clearTimeout(timer!);
    }
  }
}
