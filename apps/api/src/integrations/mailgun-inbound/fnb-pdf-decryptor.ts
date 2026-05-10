/**
 * FNB PDF decryptor.
 *
 * FNB statements are AES-encrypted PDFs. The owner password is the customer's
 * SA ID number set when they signed up for online banking. We shell out to
 * `qpdf` (installed in the runner Dockerfile) which is the most reliable way
 * to decrypt arbitrary PDF encryption schemes.
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
 * Decrypt a password-protected PDF buffer using qpdf.
 * Returns the unencrypted PDF buffer. Throws PdfDecryptError on failure.
 */
export async function decryptPdf(
  encryptedBuffer: Buffer,
  password: string,
): Promise<Buffer> {
  if (!encryptedBuffer || encryptedBuffer.length === 0) {
    throw new PdfDecryptError('Empty PDF buffer');
  }
  if (!password) {
    throw new PdfDecryptError('Empty password');
  }

  const id = randomBytes(8).toString('hex');
  const inPath = join(tmpdir(), `fnb-enc-${id}.pdf`);
  const outPath = join(tmpdir(), `fnb-dec-${id}.pdf`);

  try {
    await writeFile(inPath, encryptedBuffer);

    // Sanity-check the PDF header so we know whether the failure is at the
    // bytes-on-the-wire layer or specifically at decrypt time.
    const header = encryptedBuffer.subarray(0, 8).toString('binary');
    const looksLikePdf = header.startsWith('%PDF-');
    const hasEncryptMarker = encryptedBuffer
      .subarray(0, Math.min(2048, encryptedBuffer.length))
      .toString('binary')
      .includes('/Encrypt');
    logger.log(
      `qpdf input: size=${encryptedBuffer.length} header=${JSON.stringify(header)} ` +
        `looksLikePdf=${looksLikePdf} hasEncryptMarker=${hasEncryptMarker}`,
    );

    try {
      const { stdout, stderr } = await execFileAsync('qpdf', [
        `--password=${password}`,
        '--decrypt',
        inPath,
        outPath,
      ]);
      if (stderr) logger.warn(`qpdf stderr: ${stderr.trim()}`);
      if (stdout) logger.log(`qpdf stdout: ${stdout.trim()}`);
    } catch (err) {
      // qpdf returns non-zero on warnings even when output is usable.
      // Exit code 3 means "warnings, output written" — still successful.
      const code = (err as { code?: number }).code;
      const stderr = (err as { stderr?: string }).stderr ?? '';
      const stdout = (err as { stdout?: string }).stdout ?? '';
      if (code !== 3) {
        throw new PdfDecryptError(
          `qpdf failed (exit ${code ?? '?'}): stderr=${stderr.trim() || '<empty>'} stdout=${stdout.trim() || '<empty>'}`,
          err,
        );
      }
      logger.warn(
        `qpdf produced warnings but decrypted successfully: ${stderr.trim()}`,
      );
    }

    const decrypted = await readFile(outPath);
    if (decrypted.length === 0) {
      throw new PdfDecryptError('qpdf output is empty');
    }
    return decrypted;
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
