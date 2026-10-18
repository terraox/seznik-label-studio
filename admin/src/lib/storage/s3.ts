import { randomUUID } from 'crypto';

import { assertSafeKey, contentTypeFor, type FileStorage, type PresignedUpload, type PutOptions } from './types';

export type S3Config = {
  bucket: string;
  region: string;
  /** Leave empty for AWS; set for an S3-compatible service. */
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Public base address of the files (the CloudFront domain). */
  publicBaseUrl: string;
};

/**
 * S3 storage written against the real S3 API (AWS SDK v3). The bucket stays private; files are
 * read by the public through CloudFront. Only verified against a real bucket at deploy time.
 */
export class S3Storage implements FileStorage {
  readonly driver = 's3' as const;
  private clientPromise: Promise<import('@aws-sdk/client-s3').S3Client> | null = null;

  constructor(private readonly config: S3Config) {}

  private async sdk() {
    return import('@aws-sdk/client-s3');
  }

  private client() {
    this.clientPromise ??= this.sdk().then(
      ({ S3Client }) =>
        new S3Client({
          region: this.config.region,
          endpoint: this.config.endpoint || undefined,
          forcePathStyle: this.config.forcePathStyle,
          ...(this.config.accessKeyId && this.config.secretAccessKey
            ? { credentials: { accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey } }
            : {}),
        }),
    );
    return this.clientPromise;
  }

  async put(key: string, body: Buffer, options: PutOptions) {
    const { PutObjectCommand } = await this.sdk();
    await (await this.client()).send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: assertSafeKey(key),
        Body: body,
        ContentType: options.contentType,
        // Published keys contain the file hash, so they can be cached forever.
        CacheControl: options.cacheControl ?? (key.startsWith('catalog/') ? 'public, max-age=31536000, immutable' : 'no-store'),
      }),
    );
  }

  async get(key: string) {
    const { GetObjectCommand } = await this.sdk();
    try {
      const out = await (await this.client()).send(new GetObjectCommand({ Bucket: this.config.bucket, Key: assertSafeKey(key) }));
      const bytes = await out.Body?.transformToByteArray();
      return bytes ? { body: Buffer.from(bytes), contentType: out.ContentType ?? contentTypeFor(key) } : null;
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async exists(key: string) {
    const { HeadObjectCommand } = await this.sdk();
    try {
      await (await this.client()).send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: assertSafeKey(key) }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (error as { name?: string }).name === 'NotFound') return false;
      throw error;
    }
  }

  async delete(key: string) {
    const { DeleteObjectCommand } = await this.sdk();
    await (await this.client()).send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: assertSafeKey(key) }));
  }

  async copy(fromKey: string, toKey: string) {
    const { CopyObjectCommand } = await this.sdk();
    await (await this.client()).send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        CopySource: `${this.config.bucket}/${assertSafeKey(fromKey)}`,
        Key: assertSafeKey(toKey),
      }),
    );
  }

  publicUrl(key: string) {
    return `${this.config.publicBaseUrl.replace(/\/$/, '')}/${assertSafeKey(key)}`;
  }

  /** Presigned POST (not PUT) because only a POST policy can enforce a size limit and the file type. */
  async presignUpload(options: { contentType: string; maxBytes: number; expiresInSeconds?: number }): Promise<PresignedUpload> {
    const { createPresignedPost } = await import('@aws-sdk/s3-presigned-post');
    const key = `staging/${randomUUID()}.svg`;
    const expiresIn = options.expiresInSeconds ?? 300;
    const post = await createPresignedPost(await this.client(), {
      Bucket: this.config.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 1, options.maxBytes],
        ['eq', '$Content-Type', options.contentType],
      ],
      Fields: { 'Content-Type': options.contentType },
      Expires: expiresIn,
    });
    return { url: post.url, fields: post.fields, key, maxBytes: options.maxBytes, expiresInSeconds: expiresIn };
  }
}
