import fs from 'fs/promises';
import path from 'path';

import { assertSafeKey, contentTypeFor, type FileStorage, type PutOptions } from './types';

/** Development storage: plain files under one folder, fetched through /api/catalog-files/. */
export class LocalStorage implements FileStorage {
  readonly driver = 'local' as const;

  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
  ) {}

  private file(key: string) {
    const full = path.resolve(this.root, assertSafeKey(key));
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Key escapes the storage folder');
    return full;
  }

  async put(key: string, body: Buffer, _options: PutOptions) {
    const full = this.file(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const tmp = `${full}.${process.pid}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, full);
  }

  async get(key: string) {
    try {
      return { body: await fs.readFile(this.file(key)), contentType: contentTypeFor(key) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async exists(key: string) {
    return fs.access(this.file(key)).then(() => true, () => false);
  }

  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }

  async copy(fromKey: string, toKey: string) {
    const to = this.file(toKey);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(this.file(fromKey), to);
  }

  publicUrl(key: string) {
    return `${this.baseUrl.replace(/\/$/, '')}/api/catalog-files/${assertSafeKey(key)}`;
  }

  async presignUpload() {
    return null;
  }
}
