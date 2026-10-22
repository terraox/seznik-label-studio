import assert from 'node:assert/strict';
import test from 'node:test';

import { unreferencedManagedFiles } from '@/lib/editor/image-ingest';
import type { LabelDocument } from '@/lib/label-document';
import { buildSezlabel } from '../export';
import { commitParsedLabel, type CommitDeps } from '../commit';
import { protectedImportUris } from '../import-guard';
import { parseSezlabel, type ParsedLabel } from '../import';
import { FakePhone, fullDocument, importEnv, makeFont, makePng } from './fixtures';

type Rec = Record<string, any>;
const IMAGES = 'file:///recv/sezprint/images/';
const CLIPART = 'file:///recv/sezprint/clipart/';

/** In-memory stand-in for the file layer and the three stores. */
class Fake {
  files = new Map<string, Uint8Array | string>();
  labels: LabelDocument[] = [];
  clipart = new Map<string, Rec>();
  svgs = new Map<string, string>();
  writes = 0;
  published: string[] = [];
  clipartCap = 200;
  fonts = new Map<string, Rec>();
  fontLibraryCap = 40;
  failFontInstall = false;
  failWriteAt = 0; // 1-based index of the write that throws
  failWorkingCopy = false;
  failSave = false;
  existingNames: string[] = [];
  onWrite: ((uri: string) => void) | null = null;
  private n = 0;

  deps(): CommitDeps {
    return {
      imagesDir: async () => IMAGES,
      clipartDir: async () => CLIPART,
      writeBytes: async (uri, bytes) => {
        this.writes += 1;
        if (this.failWriteAt && this.writes === this.failWriteAt) throw new Error('disk full');
        this.files.set(uri, bytes);
        this.onWrite?.(uri);
      },
      writeClipartText: async (name, text) => {
        this.writes += 1;
        if (this.failWriteAt && this.writes === this.failWriteAt) throw new Error('disk full');
        const uri = `${CLIPART}${name}`;
        this.files.set(uri, text);
        return uri;
      },
      publish: async (_s, uri) => {
        this.published.push(uri);
      },
      deleteFile: async (uri) => {
        this.files.delete(uri);
      },
      makeWorkingCopy: async (_p, _w, _h, dest) => {
        if (this.failWorkingCopy) throw new Error('cannot decode');
        this.files.set(dest, new Uint8Array([1, 2, 3]));
      },
      existingLabelNames: () => this.existingNames,
      saveLabel: (doc) => {
        if (this.failSave) throw new Error('store write failed');
        this.labels.push(doc);
      },
      addClipart: (item) => {
        if (this.clipart.size >= this.clipartCap) return false;
        this.clipart.set(item.id, item);
        return true;
      },
      removeClipart: (id) => {
        this.clipart.delete(id);
      },
      installFont: async ({ family, ext, bytes }) => {
        if (this.failFontInstall) throw new Error('font engine refused');
        if (this.fonts.size >= this.fontLibraryCap) return null;
        const uri = `file:///recv/sezprint/fonts/${family}.${ext}`;
        this.files.set(uri, bytes);
        this.fonts.set(family, { uri });
        return {
          undo: async () => {
            this.fonts.delete(family);
            this.files.delete(uri);
          },
        };
      },
      rememberSvg: (id, svg) => {
        this.svgs.set(id, svg);
      },
      newId: (prefix = 'id') => `${prefix}_${(this.n += 1)}`,
      now: () => 1_800_000_000_000,
      safeFileName: (id, _name, ext) => `${id}.${ext}`,
    };
  }

  /** What the app's image cleanup would delete given the labels saved so far. */
  sweep(): string[] {
    const keep = new Set<string>();
    for (const l of this.labels) {
      for (const el of l.elements as Rec[]) {
        if (el.type === 'image') [el.uri, el.printUri].filter(Boolean).forEach((u: string) => keep.add(u));
      }
      if (l.background?.type === 'image') keep.add(l.background.uri);
      if (l.referenceImage) keep.add(`${IMAGES}${l.referenceImage.fileName}`);
    }
    const names = [...this.files.keys()].filter((u) => u.startsWith(IMAGES)).map((u) => u.slice(IMAGES.length));
    const stale = unreferencedManagedFiles(names, [...keep, ...protectedImportUris()], 'sezprint/images');
    // Same call the app makes (sweepEditorImageFiles): it takes URIs that contain the images dir.
    return stale.map((n) => `${IMAGES}${n}`);
  }
}

async function parsedFromSender(tweak?: (doc: LabelDocument, phone: FakePhone) => void): Promise<ParsedLabel> {
  const phone = new FakePhone();
  const doc = fullDocument(phone);
  tweak?.(doc, phone);
  const exported = await buildSezlabel(doc, phone.exportEnv());
  return parseSezlabel(exported.bytes, importEnv());
}

/** A PNG whose header claims 3000 x 1500, so the working copy has to be rebuilt. */
function bigPng(): Uint8Array {
  const png = makePng(8, 8, 5);
  const dv = new DataView(png.buffer, png.byteOffset);
  dv.setUint32(16, 3000);
  dv.setUint32(20, 1500);
  return png;
}

test('normal import: files written, clipart added, one new label saved, guard released', async () => {
  const parsed = await parsedFromSender();
  const fake = new Fake();
  const { doc, missing } = await commitParsedLabel(parsed, fake.deps());

  assert.equal(fake.labels.length, 1, 'exactly one label saved');
  assert.equal(fake.labels[0], doc);
  assert.ok(doc.id.startsWith('label_'));
  assert.equal(doc.groupId, null);
  assert.equal(doc.createdAt, 1_800_000_000_000);
  assert.deepEqual(protectedImportUris(), [], 'guard released');

  // Every picture the label names exists on disk.
  const named = new Set<string>();
  for (const el of doc.elements as Rec[]) if (el.type === 'image') [el.uri, el.printUri].forEach((u: string) => named.add(u));
  named.add((doc.background as Rec).uri);
  named.add(`${IMAGES}${doc.referenceImage!.fileName}`);
  for (const uri of named) assert.ok(fake.files.has(uri), `${uri} was written`);

  // Own clipart: stored under a new id and the element follows it.
  assert.equal(fake.clipart.size, 1);
  const [newId] = [...fake.clipart.keys()];
  assert.ok((doc.elements as Rec[]).some((e) => e.type === 'clipart' && e.clipartId === newId));
  assert.ok(fake.svgs.has(newId));
  assert.ok(fake.files.has(fake.clipart.get(newId)!.fileUri));

  assert.equal(missing.filter((m) => m.kind === 'user-clipart').length, 0);
  // Nothing extra is lying around: every file is either named by the label or is the clipart file.
  const stray = [...fake.files.keys()].filter((u) => !named.has(u) && u !== fake.clipart.get(newId)!.fileUri);
  assert.deepEqual(stray, []);
});

test('a big picture gets a rebuilt working copy; the print copy keeps the original bytes', async () => {
  const phone = new FakePhone();
  const doc = fullDocument(phone);
  const image = doc.elements.find((e) => e.type === 'image') as Rec;
  const big = bigPng();
  phone.put(image.printUri, big);
  const exported = await buildSezlabel(doc, phone.exportEnv());
  const parsed = parseSezlabel(exported.bytes, importEnv());
  const fake = new Fake();
  const { doc: saved } = await commitParsedLabel(parsed, fake.deps());
  const img = (saved.elements as Rec[]).find((e) => e.type === 'image')!;
  assert.notEqual(img.uri, img.printUri);
  assert.ok(img.uri.endsWith('-preview.jpg'));
  assert.deepEqual(fake.files.get(img.printUri), big);
  assert.equal(img.workingWidthPx, 2000);
  assert.equal(img.workingHeightPx, 1000);
});

test('same name gets (2)', async () => {
  const parsed = await parsedFromSender();
  const fake = new Fake();
  fake.existingNames = ['Full label'];
  const { doc } = await commitParsedLabel(parsed, fake.deps());
  assert.equal(doc.name, 'Full label (2)');
});

test('rollback: a write fails in the middle → every file removed, no label, no clipart, guard released', async () => {
  for (const failAt of [1, 2, 3, 4]) {
    const parsed = await parsedFromSender();
    const fake = new Fake();
    fake.failWriteAt = failAt;
    await assert.rejects(commitParsedLabel(parsed, fake.deps()), /disk full/);
    assert.deepEqual([...fake.files.keys()], [], `failAt ${failAt}: no stray files`);
    assert.equal(fake.labels.length, 0, `failAt ${failAt}: nothing saved`);
    assert.equal(fake.clipart.size, 0, `failAt ${failAt}: clipart removed`);
    assert.deepEqual(protectedImportUris(), [], `failAt ${failAt}: guard released`);
  }
});

test('rollback: the working copy cannot be built', async () => {
  const phone = new FakePhone();
  const doc = fullDocument(phone);
  phone.put((doc.elements.find((e) => e.type === 'image') as Rec).printUri, bigPng());
  const parsed = parseSezlabel((await buildSezlabel(doc, phone.exportEnv())).bytes, importEnv());
  const fake = new Fake();
  fake.failWorkingCopy = true;
  await assert.rejects(commitParsedLabel(parsed, fake.deps()), /cannot decode/);
  assert.deepEqual([...fake.files.keys()], []);
  assert.equal(fake.labels.length, 0);
  assert.deepEqual(protectedImportUris(), []);
});

test('rollback: saving the label fails after everything was written', async () => {
  const parsed = await parsedFromSender();
  const fake = new Fake();
  fake.failSave = true;
  await assert.rejects(commitParsedLabel(parsed, fake.deps()), /store write failed/);
  assert.deepEqual([...fake.files.keys()], [], 'all files removed again');
  assert.equal(fake.clipart.size, 0, 'own clipart removed again');
  assert.equal(fake.labels.length, 0);
  assert.deepEqual(protectedImportUris(), []);
});

test('clipart library full: label still saved, the clipart file is not kept, listed as missing', async () => {
  const parsed = await parsedFromSender();
  const fake = new Fake();
  fake.clipartCap = 0;
  const { doc, missing } = await commitParsedLabel(parsed, fake.deps());
  assert.equal(fake.labels.length, 1);
  assert.equal(fake.clipart.size, 0);
  assert.ok(missing.some((m) => m.kind === 'user-clipart' && /full/.test(m.detail ?? '')));
  assert.ok(![...fake.files.keys()].some((u) => u.startsWith(CLIPART)), 'no stray clipart file');
  assert.ok((doc.elements as Rec[]).some((e) => e.type === 'clipart'), 'the element stays (it will draw nothing)');
});

test('cleanup guard: files written but not yet saved survive the image cleanup, then it works normally again', async () => {
  const parsed = await parsedFromSender();
  const fake = new Fake();
  const sweptDuring: string[][] = [];
  // The cleanup runs after every single write, while no label names these files yet.
  fake.onWrite = () => sweptDuring.push(fake.sweep());
  assert.equal(fake.labels.length, 0);
  const { doc } = await commitParsedLabel(parsed, fake.deps());
  assert.ok(sweptDuring.length >= 3);
  assert.ok(sweptDuring.every((stale) => stale.length === 0), 'nothing in flight was marked for deletion');

  // After the commit the label names them, so the cleanup still keeps them…
  assert.deepEqual(fake.sweep(), []);
  // …and once the label is gone the guard no longer holds them (cleanup is not blocked forever).
  fake.labels = [];
  const stale = fake.sweep();
  assert.ok(stale.length >= 3, 'unreferenced pictures are cleaned up again');
  void doc;
});

test('cleanup guard sanity: without the guard the same sweep WOULD delete in-flight files', async () => {
  const parsed = await parsedFromSender();
  const fake = new Fake();
  let unguarded: string[] = [];
  fake.onWrite = () => {
    // Pretend the guard did not exist: only what saved labels name is kept.
    const names = [...fake.files.keys()].filter((u) => u.startsWith(IMAGES)).map((u) => u.slice(IMAGES.length));
    unguarded = unreferencedManagedFiles(names, [], 'sezprint/images');
  };
  await commitParsedLabel(parsed, fake.deps());
  assert.ok(unguarded.length > 0, 'the guard is what protects them');
});

async function parsedWithFont(receiverHas = false): Promise<ParsedLabel> {
  const phone = new FakePhone();
  const doc = fullDocument(phone);
  phone.importedFonts.set('Inter', makeFont('ttf', 900));
  const exported = await buildSezlabel(doc, phone.exportEnv());
  return parseSezlabel(exported.bytes, importEnv({ isFontAvailable: (n) => receiverHas || n === 'Default' || n === 'Barcode' }));
}

test('packed font is installed with the label under the exact name the label uses', async () => {
  const parsed = await parsedWithFont();
  assert.equal(parsed.fonts.length, 1);
  assert.equal(parsed.missing.filter((m) => m.kind === 'font').length, 0, 'not missing: it came with the file');
  const fake = new Fake();
  const { installedFonts, doc } = await commitParsedLabel(parsed, fake.deps());
  assert.deepEqual(installedFonts, ['Inter']);
  assert.ok(fake.fonts.has('Inter'));
  assert.equal((doc.elements as Rec[]).find((e) => e.type === 'text')!.fontFamily, 'Inter');
});

test('a font the phone already has is not installed again', async () => {
  const parsed = await parsedWithFont(true);
  assert.equal(parsed.fonts.length, 0);
  const fake = new Fake();
  await commitParsedLabel(parsed, fake.deps());
  assert.equal(fake.fonts.size, 0);
});

test('font library full: label still saved, font listed as missing, nothing stray', async () => {
  const parsed = await parsedWithFont();
  const fake = new Fake();
  fake.fontLibraryCap = 0;
  const { missing, installedFonts } = await commitParsedLabel(parsed, fake.deps());
  assert.deepEqual(installedFonts, []);
  assert.ok(missing.some((m) => m.kind === 'font' && /full/.test(m.detail ?? '')));
  assert.equal(fake.labels.length, 1);
  assert.equal(fake.fonts.size, 0);
});

test('rollback removes an installed font when a later step fails', async () => {
  const parsed = await parsedWithFont();
  const fake = new Fake();
  fake.failSave = true;
  await assert.rejects(commitParsedLabel(parsed, fake.deps()), /store write failed/);
  assert.equal(fake.fonts.size, 0, 'font uninstalled again');
  assert.deepEqual([...fake.files.keys()], []);
  assert.equal(fake.labels.length, 0);
});

test('font install failure rolls everything back', async () => {
  const parsed = await parsedWithFont();
  const fake = new Fake();
  fake.failFontInstall = true;
  await assert.rejects(commitParsedLabel(parsed, fake.deps()), /font engine refused/);
  assert.deepEqual([...fake.files.keys()], []);
  assert.equal(fake.labels.length, 0);
  assert.equal(fake.clipart.size, 0);
});
