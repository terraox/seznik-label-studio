import path from 'path';

import { LocalStorage } from './local';
import { S3Storage } from './s3';
import type { FileStorage } from './types';

export * from './types';

let instance: FileStorage | null = null;

/** The configured storage (STORAGE_DRIVER=local | s3). One per process. */
export function storage(): FileStorage {
  if (instance) return instance;
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 's3') {
    const bucket = process.env.S3_BUCKET;
    const publicBaseUrl = process.env.CDN_BASE_URL;
    if (!bucket || !publicBaseUrl) throw new Error('STORAGE_DRIVER=s3 needs S3_BUCKET and CDN_BASE_URL.');
    instance = new S3Storage({
      bucket,
      region: process.env.S3_REGION ?? 'ap-south-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
      publicBaseUrl,
    });
  } else {
    instance = new LocalStorage(
      process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), 'data', 'catalog'),
      process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    );
  }
  return instance;
}
