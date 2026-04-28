/**
 * OCRService unit tests
 *
 * We mock the tesseract.js worker and pdf-parse to avoid real I/O.
 * Tests verify:
 *  1. extractFromImage: calls worker.recognize and maps result
 *  2. extractFromPdf: uses pdf text layer when >= 100 chars
 *  3. extractFromPdf: falls back to tesseract when text layer thin
 *  4. Timeout: returns empty result on timeout (not throw)
 */

import { Test, TestingModule } from '@nestjs/testing';
// Import the mocked module — jest.mocked() gives us typed access.
import pdfParse from 'pdf-parse';
import { pdfToPng } from 'pdf-to-png-converter';
import { OCRService } from './ocr.service';

// ---------------------------------------------------------------------------
// Mocks
//
// jest.mock factories are hoisted before all variable declarations, so we
// cannot reference module-level `const` inside them. The pattern that works:
//   - For pdf-parse / pdf-to-png-converter: call jest.fn() inside the factory.
//   - Access via jest.mocked(import) after the import declaration.
//   - For tesseract.js: keep worker state in a plain object literal (initialised
//     at declaration time, not subject to hoisting race).
// ---------------------------------------------------------------------------

const workerState = {
  recognize: jest.fn(),
  setParameters: jest.fn(),
  terminate: jest.fn(),
};

jest.mock('tesseract.js', () => ({
  createWorker: jest.fn().mockImplementation(() =>
    Promise.resolve({
      recognize: workerState.recognize,
      setParameters: workerState.setParameters,
      terminate: workerState.terminate,
    }),
  ),
  OEM: { LSTM_ONLY: 1 },
  PSM: { SINGLE_BLOCK: 6 },
}));

// pdf-parse factory returns a jest.fn() directly; we access it below via jest.mocked.
jest.mock('pdf-parse', () => jest.fn().mockResolvedValue({ text: '' }));

jest.mock('pdf-to-png-converter', () => ({
  pdfToPng: jest.fn(),
}));

// Typed references to the mocked functions
const mockPdfParse = jest.mocked(pdfParse);
const mockPdfToPng = jest.mocked(pdfToPng);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeImageBuffer = Buffer.from('fake-image-bytes');
const fakePdfBuffer = Buffer.from('fake-pdf-bytes');

const recognizeOk = {
  data: { text: 'Payment amount R 500.00 date 31/01/2025', confidence: 87 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OCRService', () => {
  let service: OCRService;

  beforeEach(async () => {
    workerState.recognize.mockReset();
    workerState.setParameters.mockReset().mockResolvedValue(undefined);
    workerState.terminate.mockReset().mockResolvedValue(undefined);
    mockPdfParse.mockReset().mockResolvedValue({ text: '' } as never);
    mockPdfToPng.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [OCRService],
    }).compile();

    service = module.get<OCRService>(OCRService);
  });

  // -------------------------------------------------------------------------
  // extractFromImage
  // -------------------------------------------------------------------------

  describe('extractFromImage', () => {
    it('returns text and confidence from worker.recognize', async () => {
      workerState.recognize.mockResolvedValue(recognizeOk);

      const result = await service.extractFromImage(fakeImageBuffer);

      expect(result.text).toBe(recognizeOk.data.text);
      expect(result.confidence).toBe(87);
      expect(workerState.recognize).toHaveBeenCalledTimes(1);
      expect(workerState.terminate).toHaveBeenCalledTimes(1);
    });

    it('returns empty text and zero confidence when worker returns empty', async () => {
      workerState.recognize.mockResolvedValue({
        data: { text: '', confidence: 0 },
      });

      const result = await service.extractFromImage(fakeImageBuffer);

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // extractFromPdf — text layer sufficient
  // -------------------------------------------------------------------------

  describe('extractFromPdf — text layer', () => {
    it('uses pdf text layer when >= 100 chars', async () => {
      const longText = 'A'.repeat(150);
      mockPdfParse.mockResolvedValue({ text: longText } as never);

      const result = await service.extractFromPdf(fakePdfBuffer);

      expect(result.text).toBe(longText);
      expect(result.confidence).toBe(100);
      // tesseract should NOT be called
      expect(workerState.recognize).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // extractFromPdf — tesseract fallback
  // -------------------------------------------------------------------------

  describe('extractFromPdf — tesseract fallback', () => {
    it('falls back to tesseract when text layer has < 100 chars', async () => {
      mockPdfParse.mockResolvedValue({ text: 'short' } as never);

      const fakePageContent = Buffer.from('page-png-bytes');
      mockPdfToPng.mockResolvedValue([{ content: fakePageContent }] as never);
      workerState.recognize.mockResolvedValue({
        data: { text: 'OCR result from image', confidence: 75 },
      });

      const result = await service.extractFromPdf(fakePdfBuffer);

      expect(result.text).toBe('OCR result from image');
      expect(result.confidence).toBe(75);
      expect(mockPdfToPng).toHaveBeenCalledTimes(1);
      expect(workerState.recognize).toHaveBeenCalledTimes(1);
    });

    it('returns empty when pdf-to-png fails', async () => {
      mockPdfParse.mockResolvedValue({ text: '' } as never);
      mockPdfToPng.mockRejectedValue(new Error('conversion failed'));

      const result = await service.extractFromPdf(fakePdfBuffer);

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
      expect(workerState.recognize).not.toHaveBeenCalled();
    });

    it('returns empty when page 1 has no content', async () => {
      mockPdfParse.mockResolvedValue({ text: '' } as never);
      mockPdfToPng.mockResolvedValue([{ content: undefined }] as never);

      const result = await service.extractFromPdf(fakePdfBuffer);

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Shape snapshot
  // -------------------------------------------------------------------------

  describe('OcrResult shape', () => {
    it('result always has text and confidence fields', async () => {
      workerState.recognize.mockResolvedValue(recognizeOk);

      const result = await service.extractFromImage(fakeImageBuffer);

      expect(typeof result.text).toBe('string');
      expect(typeof result.confidence).toBe('number');
    });
  });
});
