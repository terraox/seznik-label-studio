import assert from 'node:assert/strict';
import test from 'node:test';

import { JOSH_GAP_TYPE } from '@/lib/printer/josh-print';
import { resolveJoshJobParams } from '@/lib/printer/josh-job-params';
import {
  formatPaperTypeSetting,
  paperTypeCommand,
  type PaperPrinterId,
} from '@/lib/printer/paper-type';
import { resolveTd404JobParams } from '@/lib/printer/td404-job-params';

const PRINTERS: PaperPrinterId[] = ['josh', 'td404', 'dev'];
const TYPES = ['Label', 'Receipt', 'Cardstock', 'Transparent', 'Black mark', 'unknown', null] as const;

test('each paper type maps to the exact Josh bundle and TSPL line', () => {
  const joshLabel = paperTypeCommand({ printer: 'josh', paperType: 'Label', gapMm: 3 });
  assert.equal(joshLabel.joshGapType, JOSH_GAP_TYPE.label);
  assert.equal(joshLabel.joshGapType, 2);
  assert.equal(joshLabel.joshGapLength01mm, 300);
  assert.equal(joshLabel.gapMm, 3);
  assert.equal(formatPaperTypeSetting(joshLabel), 'GAP_TYPE=2 GAP_LENGTH=300');

  const joshMark = paperTypeCommand({ printer: 'josh', paperType: 'Black mark', gapMm: 3.5 });
  assert.equal(joshMark.joshGapType, 3);
  assert.equal(joshMark.joshGapLength01mm, 350);
  assert.equal(joshMark.gapMm, 3.5);
  assert.equal(joshMark.media, 'bline');

  const joshReceipt = paperTypeCommand({ printer: 'josh', paperType: 'Receipt', gapMm: 3 });
  assert.equal(joshReceipt.joshGapType, 0);
  assert.equal(joshReceipt.joshGapLength01mm, 0);
  assert.equal(joshReceipt.gapMm, 0);
  assert.notEqual(joshReceipt.joshGapType, -1);

  const tdLabel = paperTypeCommand({ printer: 'td404', paperType: 'Label', gapMm: 3 });
  assert.equal(tdLabel.mediaLine, 'GAP 3.00 mm,0 mm\r\n');
  const tdMark = paperTypeCommand({ printer: 'td404', paperType: 'Black mark', gapMm: 3.5 });
  assert.equal(tdMark.mediaLine, 'BLINE 3.50 mm,0 mm\r\n');
  const tdReceipt = paperTypeCommand({ printer: 'td404', paperType: 'Receipt', gapMm: 3 });
  assert.equal(tdReceipt.mediaLine, 'GAP 0.00 mm,0 mm\r\n');
  assert.equal(tdReceipt.gapMm, 0);

  const devLabel = paperTypeCommand({ printer: 'dev', paperType: 'Label', gapMm: 3 });
  assert.equal(devLabel.mediaLine, 'GAP 3 mm,0 mm\r\n');
  const devReceipt = paperTypeCommand({ printer: 'dev', paperType: 'Receipt', gapMm: 3 });
  assert.equal(devReceipt.mediaLine, 'GAP 0 mm,0 mm\r\n');
  assert.equal(devReceipt.gapMm, 0);
  const devMark = paperTypeCommand({ printer: 'dev', paperType: 'Black mark', gapMm: 3 });
  assert.equal(devMark.mediaLine, 'BLINE 3 mm,0 mm\r\n');

  for (const printer of PRINTERS) {
    for (const paperType of ['Cardstock', 'Transparent', 'unknown', null] as const) {
      const stock = paperTypeCommand({ printer, paperType, gapMm: 3 });
      const label = paperTypeCommand({ printer, paperType: 'Label', gapMm: 3 });
      assert.equal(stock.media, 'gap');
      assert.equal(stock.joshGapType, label.joshGapType);
      assert.equal(stock.mediaLine, label.mediaLine);
      assert.notEqual(stock.joshGapType, 1);
      assert.notEqual(stock.joshGapType, 3);
    }
  }

  for (const printer of PRINTERS) {
    for (const paperType of TYPES) {
      const command = paperTypeCommand({ printer, paperType, gapMm: 3 });
      assert.ok(command.joshGapType === 0 || command.joshGapType === 2 || command.joshGapType === 3);
    }
  }
});

test('receipt forces length 0; other stock keeps 3.5 mm; out of range clamps; dev rounds', () => {
  for (const printer of PRINTERS) {
    const receipt = paperTypeCommand({ printer, paperType: 'Receipt', gapMm: 3.5 });
    assert.equal(receipt.gapMm, 0);
    assert.equal(receipt.joshGapLength01mm, 0);
    const mark = paperTypeCommand({ printer, paperType: 'Black mark', gapMm: 3.5 });
    if (printer === 'dev') {
      assert.equal(mark.gapMm, 4);
      assert.equal(mark.mediaLine, 'BLINE 4 mm,0 mm\r\n');
    } else {
      assert.equal(mark.gapMm, 3.5);
    }
    const high = paperTypeCommand({ printer, paperType: 'Label', gapMm: 25 });
    const low = paperTypeCommand({ printer, paperType: 'Label', gapMm: -1 });
    if (printer === 'dev') {
      assert.equal(high.gapMm, 20);
      assert.equal(low.gapMm, 0);
      assert.equal(low.mediaLine, 'GAP 0 mm,0 mm\r\n');
    } else {
      assert.equal(high.gapMm, 20);
      assert.equal(high.joshGapLength01mm, 2000);
      assert.equal(low.gapMm, 0);
    }
  }
  const devQuarter = paperTypeCommand({ printer: 'dev', paperType: 'Label', gapMm: 2.4 });
  assert.equal(devQuarter.gapMm, 2);
  assert.equal(devQuarter.mediaLine, 'GAP 2 mm,0 mm\r\n');
});

test('omitted gap uses the printer default; the label name does not change the command', () => {
  const josh = paperTypeCommand({
    printer: 'josh',
    paperType: 'Label',
    labelName: 'black mark stock',
  });
  assert.equal(josh.joshGapType, 2);
  assert.equal(josh.gapMm, 3);
  assert.equal(josh.joshGapLength01mm, 300);

  const td = paperTypeCommand({ printer: 'td404', paperType: null });
  assert.equal(td.mediaLine, 'GAP 2.00 mm,0 mm\r\n');
  assert.equal(td.gapMm, 2);

  const named = resolveJoshJobParams({ paperType: 'Label', gapMm: 3 });
  assert.equal(named.gapType, JOSH_GAP_TYPE.label);
  assert.equal(named.media, 'gap');

  const forced = resolveJoshJobParams({ paperType: 'Label', media: 'bline', gapMm: 2.5 });
  assert.equal(forced.media, 'bline');
  assert.equal(forced.gapType, 3);

  const tdNamed = resolveTd404JobParams({ paperType: 'Label', gapMm: 3 });
  assert.equal(tdNamed.media, 'gap');
  assert.equal(tdNamed.gapMm, 3);
});

test('only the sensor fields change across paper types', () => {
  for (const printer of PRINTERS) {
    const commands = ['Label', 'Receipt', 'Cardstock', 'Transparent', 'Black mark'].map((paperType) =>
      paperTypeCommand({ printer, paperType, gapMm: 3 }),
    );
    if (printer === 'josh') {
      const rests = commands.map((command) =>
        JSON.stringify({ widthMm: 50, heightMm: 30, density: -1, speed: -1 }),
      );
      assert.equal(new Set(rests).size, 1);
      const bundles = commands.map((command) => ({
        widthMm: 50,
        heightMm: 30,
        GAP_TYPE: command.joshGapType,
        GAP_LENGTH: command.joshGapLength01mm,
        density: -1,
        speed: -1,
      }));
      const withoutSensor = bundles.map(({ GAP_TYPE: _type, GAP_LENGTH: _length, ...rest }) => rest);
      assert.deepEqual(withoutSensor[0], withoutSensor[1]);
      assert.deepEqual(withoutSensor[0], withoutSensor[4]);
      assert.notEqual(bundles[0].GAP_TYPE, bundles[1].GAP_TYPE);
      assert.equal(bundles[0].GAP_TYPE, bundles[2].GAP_TYPE);
      assert.equal(bundles[0].GAP_LENGTH, bundles[2].GAP_LENGTH);
    } else {
      const stripped = commands.map((command) => {
        const header = `SIZE 50.00 mm,30.00 mm\r\n${command.mediaLine}SPEED 3\r\nDENSITY 10\r\nREFERENCE 0,0\r\nBITMAP 0,0,`;
        return header.replace(command.mediaLine, 'MEDIA\r\n');
      });
      assert.equal(new Set(stripped).size, 1);
      assert.notEqual(commands[0].mediaLine, commands[1].mediaLine);
      assert.equal(commands[0].mediaLine, commands[2].mediaLine);
      assert.equal(commands[0].mediaLine, commands[3].mediaLine);
      assert.notEqual(commands[0].mediaLine, commands[4].mediaLine);
    }
  }
});
