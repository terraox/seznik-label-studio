export type PutOptions = { contentType: string; cacheControl?: string };

export type PresignedUpload = {
  url: string;
  /** Form fields the browser must send first, then the file. */
  fields: Record<string, string>;
  key: string;
  maxBytes: number;
  expiresInSeconds: number;
};

/**
 * Where catalogue files (sanitised SVGs, thumbnails, uploads waiting for review) live.
 *   local  files on disk, served by the app server (development)
 *   s3     an S3 bucket behind CloudFront (production; verified at deploy time)
 * Keys look like `staging/<uuid>.svg` and `catalog/<kind>/<itemId>/<hash>.svg`.
 */
export interface FileStorage {
  readonly driver: 'local' | 's3';
  put(key: string, body: Buffer, options: PutOptions): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  copy(fromKey: string, toKey: string): Promise<void>;
  /** The address the app / browser uses to fetch a stored file. */
  publicUrl(key: string): string;
  /**
   * A direct browser-to-storage upload into `staging/`, limited in size and type.
   * Null when the driver has no such thing (local): upload through the API instead.
   */
  presignUpload(options: { contentType: string; maxBytes: number; expiresInSeconds?: number }): Promise<PresignedUpload | null>;
}

const SAFE_KEY = /^(staging|catalog)\/[A-Za-z0-9._\-/]+$/;

/** Only keys the catalogue itself makes are accepted: no `..`, no absolute paths, no odd characters. */
export function assertSafeKey(key: string): string {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.includes('//') || key.endsWith('/')) {
    throw new Error(`Unsafe storage key: ${key.slice(0, 80)}`);
  }
  return key;
}

export function contentTypeFor(key: string): string {
  if (key.endsWith('.svg')) return 'image/svg+xml';
  if (key.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}
