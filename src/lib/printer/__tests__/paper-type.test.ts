import assert from 'node:assert/strict';
import test from 'node:test';

import { LEGACY_PAPER_TYPES, readPaperType } from '@/lib/label-document';
import { JOSH_GAP_TYPE } from '@/lib/printer/josh-print';
import { resolveJoshJobParams } from '@/lib/printer/josh-job-params';
import {
  JOSH_PAPER_TYPES,
  PAPER_TYPES,
  formatPaperTypeSetting,
  mediaForPaperType,
  paperTypeCommand,
  paperTypeSelectionNote,
  paperTypesFor,
  paperTypeTestBadge,
  shownPaperType,
  tsplMedia,
  type PaperPrinterId,
} from '@/lib/printer/paper-type';
import { resolveTd404JobParams } from '@/lib/printer/td404-job-params';
import { encodeTscBitmapJob } from '@/lib/printer/tsc';

const PRINTERS: PaperPrinterId[] = ['josh', 'td404', 'dev'];
const OLD_OR_UNKNOWN = [...LEGACY_PAPER_TYPES, 'unknown', '', 'receipt', 'transparent', null, undefined, 3] as const;

test('Josh offers Label, Receipt, Transparent, Cardstock; TD-404 and Dev offer Receipt, Label', () => {
  assert.deepEqual([...JOSH_PAPER_TYPES], ['Label', 'Receipt', 'Transparent', 'Cardstock']);
  assert.deepEqual([...PAPER_TYPES], ['Receipt', 'Label']);
  assert.deepEqual([...paperTypesFor('josh')], [...JOSH_PAPER_TYPES]);
  for (const sdkId of ['td404', 'dev', 'tez', 'labelx', null, undefined]) {
    assert.deepEqual([...paperTypesFor(sdkId)], [...PAPER_TYPES], String(sdkId));
  }
  for (const type of ['Receipt', 'Transparent', 'Cardstock']) assert.equal(paperTypeTestBadge(type), 'Test', type);
  assert.equal(paperTypeTestBadge('Label'), null);
  assert.equal(paperTypeSelectionNote('Receipt'), 'Test. Continuous feed. Gap length is 0 mm.');
  assert.equal(paperTypeSelectionNote('Transparent'), 'Test. Uses the hole sensor. Gap Length is the hole length.');
  assert.equal(paperTypeSelectionNote('Cardstock'), 'Test. Uses the black-mark sensor. Gap Length is the mark length.');
  assert.equal(paperTypeSelectionNote('Label'), null);
});

test('stored values: the four types stay; Black mark, missing and unknown open as Label', () => {
  assert.deepEqual([...LEGACY_PAPER_TYPES], ['Black mark']);
  for (const kept of ['Receipt', 'Label', 'Transparent', 'Cardstock']) assert.equal(readPaperType(kept), kept);
  for (const value of OLD_OR_UNKNOWN) {
    assert.equal(readPaperType(value), 'Label', String(value));
    for (const printer of PRINTERS) {
      assert.equal(mediaForPaperType(value as string | null | undefined, printer), 'gap', `${printer} ${String(value)}`);
    }
  }
});

test('a type the printer does not offer shows as Label (no blank chip)', () => {
  assert.equal(shownPaperType('Transparent', 'td404'), 'Label');
  assert.equal(shownPaperType('Cardstock', 'dev'), 'Label');
  assert.equal(shownPaperType('Receipt', 'td404'), 'Receipt');
  assert.equal(shownPaperType('Transparent', 'josh'), 'Transparent');
  assert.equal(shownPaperType('Cardstock', 'josh'), 'Cardstock');
  assert.equal(shownPaperType('Black mark', 'josh'), 'Label');
});

test('TSPL lines: Label, Transparent and Cardstock send GAP n mm,0 mm; Receipt sends GAP 0', () => {
  for (const paperType of ['Label', 'Transparent', 'Cardstock']) {
    assert.equal(paperTypeCommand({ printer: 'td404', paperType, gapMm: 3 }).mediaLine, 'GAP 3.00 mm,0 mm\r\n', paperType);
    assert.equal(paperTypeCommand({ printer: 'dev', paperType, gapMm: 3 }).mediaLine, 'GAP 3 mm,0 mm\r\n', paperType);
    assert.equal(paperTypeCommand({ printer: 'td404', paperType, gapMm: 3 }).media, 'gap', paperType);
  }
  assert.equal(paperTypeCommand({ printer: 'td404', paperType: 'Label', gapMm: 3.5 }).mediaLine, 'GAP 3.50 mm,0 mm\r\n');
  assert.equal(paperTypeCommand({ printer: 'td404', paperType: 'Receipt', gapMm: 3 }).mediaLine, 'GAP 0.00 mm,0 mm\r\n');
  assert.equal(paperTypeCommand({ printer: 'dev', paperType: 'Receipt', gapMm: 3 }).mediaLine, 'GAP 0 mm,0 mm\r\n');
  assert.equal(formatPaperTypeSetting(paperTypeCommand({ printer: 'td404', paperType: 'Label', gapMm: 3 })), 'GAP 3.00 mm,0 mm');
  assert.equal(formatPaperTypeSetting(paperTypeCommand({ printer: 'td404', paperType: 'Receipt', gapMm: 3 })), 'GAP 0.00 mm,0 mm');

  for (const printer of ['td404', 'dev'] as const) {
    const label = paperTypeCommand({ printer, paperType: 'Label', gapMm: 3 });
    for (const value of [...OLD_OR_UNKNOWN, 'Transparent', 'Cardstock']) {
      const other = paperTypeCommand({ printer, paperType: value as string | null | undefined, gapMm: 3 });
      assert.deepEqual(other, label, String(value));
      assert.doesNotMatch(other.mediaLine, /BLINE/);
    }
  }
});

test('a Josh-only hole media never reaches TSPL as anything but gap', () => {
  assert.equal(tsplMedia('hole'), 'gap');
  assert.equal(tsplMedia('gap'), 'gap');
  assert.equal(tsplMedia('continuous'), 'continuous');
  assert.equal(tsplMedia(undefined), 'gap');
  const bitmap = { data: new Uint8Array(8 * 4), bytesPerRow: 8, width: 64, height: 4 } as never;
  const text = Buffer.from(encodeTscBitmapJob(bitmap, { widthMm: 50, heightMm: 30, gapMm: 3, media: 'hole' })).toString('latin1');
  assert.match(text, /\r\nGAP 3\.00 mm,0 mm\r\n/);
});

test('TD-404 job: media line once, after SIZE and before BITMAP and PRINT', () => {
  const bitmap = { data: new Uint8Array(8 * 4), bytesPerRow: 8, width: 64, height: 4 } as never;
  for (const [paperType, line] of [
    ['Label', 'GAP 3.00 mm,0 mm'],
    ['Receipt', 'GAP 0.00 mm,0 mm'],
    ['Transparent', 'GAP 3.00 mm,0 mm'],
    ['Cardstock', 'GAP 3.00 mm,0 mm'],
  ] as const) {
    const params = resolveTd404JobParams({ paperType, gapMm: 3 });
    const job = encodeTscBitmapJob(bitmap, { widthMm: 50, heightMm: 30, gapMm: params.gapMm, media: params.media });
    const lines = Buffer.from(job).toString('latin1').split('\r\n');
    assert.equal(lines.filter((l) => /^(GAP|BLINE) /.test(l)).length, 1, paperType);
    const size = lines.findIndex((l) => l.startsWith('SIZE '));
    const gap = lines.indexOf(line);
    const bitmapAt = lines.findIndex((l) => l.startsWith('BITMAP '));
    const print = lines.findIndex((l) => l.startsWith('PRINT '));
    assert.ok(size >= 0 && size < gap && gap < bitmapAt && bitmapAt < print, `${paperType}: ${lines.join(' | ')}`);
  }
});

test('Josh GAP_TYPE: Label 2, Receipt 0 (no length), Transparent 1, Cardstock 3', () => {
  const expected = [
    ['Label', 2, 'GAP_TYPE=2 GAP_LENGTH=300'],
    ['Receipt', 0, 'GAP_TYPE=0'],
    ['Transparent', 1, 'GAP_TYPE=1 GAP_LENGTH=300'],
    ['Cardstock', 3, 'GAP_TYPE=3 GAP_LENGTH=300'],
  ] as const;
  for (const [paperType, gapType, setting] of expected) {
    const command = paperTypeCommand({ printer: 'josh', paperType, gapMm: 3 });
    assert.equal(command.joshGapType, gapType, paperType);
    assert.equal(formatPaperTypeSetting(command), setting, paperType);
    assert.equal(resolveJoshJobParams({ paperType, gapMm: 3 }).gapType, gapType, paperType);
  }
  assert.equal(JOSH_GAP_TYPE.receipt, 0);
  assert.equal(JOSH_GAP_TYPE.hole, 1);
  assert.equal(JOSH_GAP_TYPE.label, 2);
  assert.equal(JOSH_GAP_TYPE.blackMark, 3);
  const receipt = paperTypeCommand({ printer: 'josh', paperType: 'Receipt', gapMm: 3 });
  assert.equal(receipt.gapMm, 0);

  for (const value of OLD_OR_UNKNOWN) {
    const old = resolveJoshJobParams({ paperType: value as string | null | undefined, gapMm: 3 });
    assert.equal(old.gapType, 2, String(value));
    assert.equal(old.media, 'gap', String(value));
    assert.equal(old.gapMm, 3, String(value));
  }
});

test('receipt forces gap 0; other types clamp 0–20 mm; dev rounds to whole mm', () => {
  for (const printer of PRINTERS) {
    const receipt = paperTypeCommand({ printer, paperType: 'Receipt', gapMm: 3.5 });
    assert.equal(receipt.gapMm, 0);
    assert.equal(receipt.joshGapLength01mm, 0);
    for (const paperType of ['Label', 'Transparent', 'Cardstock']) {
      assert.equal(paperTypeCommand({ printer, paperType, gapMm: 25 }).gapMm, 20);
      assert.equal(paperTypeCommand({ printer, paperType, gapMm: -1 }).gapMm, 0);
    }
  }
  assert.equal(paperTypeCommand({ printer: 'josh', paperType: 'Cardstock', gapMm: 3.5 }).joshGapLength01mm, 350);
  const devQuarter = paperTypeCommand({ printer: 'dev', paperType: 'Label', gapMm: 2.4 });
  assert.equal(devQuarter.gapMm, 2);
  assert.equal(devQuarter.mediaLine, 'GAP 2 mm,0 mm\r\n');
});

test('omitted gap uses the printer default; the label name does not change the command', () => {
  const josh = paperTypeCommand({ printer: 'josh', paperType: 'Label', labelName: 'black mark stock' });
  assert.equal(josh.joshGapType, 2);
  assert.equal(josh.gapMm, 3);
  assert.equal(josh.joshGapLength01mm, 300);

  const td = paperTypeCommand({ printer: 'td404', paperType: null });
  assert.equal(td.mediaLine, 'GAP 2.00 mm,0 mm\r\n');
  assert.equal(td.gapMm, 2);
});

test('only the sensor line differs between Receipt and Label', () => {
  for (const printer of ['td404', 'dev'] as const) {
    const [receipt, label] = PAPER_TYPES.map((paperType) => paperTypeCommand({ printer, paperType, gapMm: 3 }));
    const header = (line: string) => `SIZE 50.00 mm,30.00 mm\r\n${line}SPEED 3\r\nDENSITY 10\r\nREFERENCE 0,0\r\nBITMAP 0,0,`;
    assert.equal(header(receipt.mediaLine).replace(receipt.mediaLine, 'MEDIA\r\n'), header(label.mediaLine).replace(label.mediaLine, 'MEDIA\r\n'));
    assert.notEqual(receipt.mediaLine, label.mediaLine);
  }
});
