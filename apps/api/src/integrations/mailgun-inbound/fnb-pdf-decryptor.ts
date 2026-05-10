/**
 * FNB PDF decryptor.
 *
 * FNB statement PDFs are AES-encrypted; the password convention varies by
 * how the customer set up online banking — most commonly the full SA ID
 * number, but also seen as date-of-birth (YYMMDD), last-6-of-ID, etc.
 *
 * The decryptor accepts either a single password or a list of candidates
 * (FNB_STATEMENT_PASSWORDS as comma-separated). It tries each via qpdf
 * and returns the first decrypted buffer; logs which candidate worked.
 *
 * The decrypted buffer is returned in memory; nothing is persisted to disk
 * beyond the temp files we clean up immediately.
 */

import { Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const logger = new Logger('FnbPdfDecryptor');

export class PdfDecryptError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PdfDecryptError';
  }
}

/**
 * Derive plausible FNB statement password candidates from a SA ID number.
 * Order matters — most common first.
 */
export function fnbPasswordCandidates(idOrPassword: string): string[] {
  const id = idOrPassword.trim();
  const candidates = new Set<string>();
  candidates.add(id); // original / full ID

  // SA ID is 13 digits; first 6 = YYMMDD birth date.
  if (/^\d{13}$/.test(id)) {
    const yy = id.slice(0, 2);
    const mm = id.slice(2, 4);
    const dd = id.slice(4, 6);
    const yyyy = Number(yy) > 30 ? `19${yy}` : `20${yy}`;
    candidates.add(id.slice(0, 6)); // YYMMDD
    candidates.add(id.slice(0, 12)); // ID minus check digit
    candidates.add(id.slice(-6)); // last 6
    candidates.add(`${dd}${mm}${yyyy}`); // DDMMYYYY
    candidates.add(`${yyyy}${mm}${dd}`); // YYYYMMDD
    candidates.add(`${dd}${mm}${yy}`); // DDMMYY
  }

  return Array.from(candidates).filter((c) => c.length > 0);
}

/**
 * Decrypt a password-protected PDF buffer using qpdf.
 * Tries each provided password in order; returns first successful decrypt.
 */
export async function decryptPdf(
  encryptedBuffer: Buffer,
  passwordOrCandidates: string | string[],
): Promise<Buffer> {
  if (!encryptedBuffer || encryptedBuffer.length === 0) {
    throw new PdfDecryptError('Empty PDF buffer');
  }

  const candidates = Array.isArray(passwordOrCandidates)
    ? passwordOrCandidates
    : [passwordOrCandidates];
  if (candidates.length === 0 || candidates.every((c) => !c)) {
    throw new PdfDecryptError('No password candidates provided');
  }

  const id = randomBytes(8).toString('hex');
  const inPath = join(tmpdir(), `fnb-enc-${id}.pdf`);
  const outPath = join(tmpdir(), `fnb-dec-${id}.pdf`);

  try {
    await writeFile(inPath, encryptedBuffer);

    const header = encryptedBuffer.subarray(0, 8).toString('binary');
    const looksLikePdf = header.startsWith('%PDF-');
    const hasEncryptMarker = encryptedBuffer
      .toString('binary')
      .includes('/Encrypt');
    logger.log(
      `qpdf input: size=${encryptedBuffer.length} header=${JSON.stringify(header)} ` +
        `looksLikePdf=${looksLikePdf} hasEncryptMarker=${hasEncryptMarker}`,
    );

    if (!looksLikePdf) {
      throw new PdfDecryptError(
        `Buffer does not look like a PDF (header=${JSON.stringify(header)})`,
      );
    }

    if (!hasEncryptMarker) {
      logger.log(
        'PDF has no /Encrypt marker — already decrypted, skipping qpdf',
      );
      return encryptedBuffer;
    }

    // Diagnostic: dump qpdf version + encryption scheme so we can tell
    // whether the password really is wrong or our qpdf can't handle the
    // encryption algorithm.
    try {
      const { stdout: ver } = await execFileAsync('qpdf', ['--version']);
      logger.log(`qpdf version: ${ver.split('\n')[0]}`);
    } catch {
      /* ignore */
    }
    try {
      const { stdout: enc } = await execFileAsync('qpdf', [
        '--show-encryption',
        inPath,
      ]);
      logger.log(`qpdf show-encryption:\n${enc.trim()}`);
    } catch (err) {
      const stderr = ((err as { stderr?: string }).stderr ?? '').trim();
      logger.warn(`qpdf show-encryption failed: ${stderr}`);
    }

    const errors: string[] = [];
    for (const password of candidates) {
      if (!password) continue;
      try {
        await execFileAsync('qpdf', [
          `--password=${password}`,
          '--decrypt',
          inPath,
          outPath,
        ]);
        // success path — log which candidate worked (length only, not value)
        logger.log(
          `qpdf success with password candidate (length=${password.length})`,
        );
        const decrypted = await readFile(outPath);
        if (decrypted.length === 0) {
          throw new PdfDecryptError('qpdf output is empty');
        }
        return decrypted;
      } catch (err) {
        const code = (err as { code?: number }).code;
        const stderr = ((err as { stderr?: string }).stderr ?? '').trim();
        if (code === 3) {
          // warnings only — output is still usable
          logger.warn(
            `qpdf warnings (length=${password.length}): ${stderr}`,
          );
          const decrypted = await readFile(outPath);
          if (decrypted.length > 0) return decrypted;
        }
        errors.push(
          `len=${password.length} exit=${code ?? '?'} stderr=${stderr || '<empty>'}`,
        );
      }
    }

    throw new PdfDecryptError(
      `All ${candidates.length} password candidates failed: ${errors.join(' | ')}`,
    );
  } finally {
    await Promise.all([
      unlink(inPath).catch(() => {
        /* ignore */
      }),
      unlink(outPath).catch(() => {
        /* ignore */
      }),
    ]);
  }
}
