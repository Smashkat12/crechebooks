/**
 * StorageConfig
 * Gate-3: S3 storage configuration registered under the 's3' namespace.
 *
 * Required env vars (except in test):
 *   S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */
import { registerAs } from '@nestjs/config';
import { Logger } from '@nestjs/common';

const logger = new Logger('StorageConfig');

export interface S3ConfigType {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export default registerAs('s3', (): S3ConfigType => {
  const isTest = process.env.NODE_ENV === 'test';

  const bucket = process.env.S3_BUCKET ?? '';
  const region = process.env.AWS_REGION ?? 'af-south-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? '';
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? '';

  if (!isTest) {
    if (!bucket) {
      throw new Error('S3_BUCKET environment variable is required');
    }
    if (!accessKeyId) {
      throw new Error('AWS_ACCESS_KEY_ID environment variable is required');
    }
    if (!secretAccessKey) {
      throw new Error('AWS_SECRET_ACCESS_KEY environment variable is required');
    }
    logger.log(`S3 storage configured: bucket=${bucket}, region=${region}`);
  } else {
    logger.debug('S3 config in test mode — credential validation skipped');
  }

  return { bucket, region, accessKeyId, secretAccessKey };
});
