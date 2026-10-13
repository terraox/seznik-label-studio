import assert from 'node:assert/strict';
import { defaultBorderPlacement } from '@/lib/border-geometry';
import {
  composeUpsDocument,
  createLabelDocument,
  createUpsConfig,
  upsPanelDocument,
  type LabelElement,
} from '@/lib/label-document';

function border(id: string, widthMm: number, heightMm: number): LabelElement {
  return {
    id,
    type: 'border',
    borderStyle: 'solid-medium',
    lineWidth: 0.55,
    needPrinting: true,
    drawingColorIndex: 0,
    ...defaultBorderPlacement(widthMm, heightMm),
  };
}

const cellW = 50;
const cellH = 30;
const stored = defaultBorderPlacement(cellW, cellH);
const panel0 = [border('b0', cellW, cellH)];
const panel1 = [border('b1', cellW, cellH)];

const doc = createLabelDocument({
  name: '2-up',
  widthMm: cellW,
  heightMm: cellH,
  elements: panel0,
});
doc.ups = {
  ...createUpsConfig({ columns: 2, columnSpacingMm: 4, seedElements: panel0 }),
  panels: [panel0, panel1],
  activeIndex: 0,
};

const first = upsPanelDocument(doc, 0);
const second = upsPanelDocument(doc, 1);

assert.equal(first.widthMm, cellW, 'panel 1 stays the cell width');
assert.equal(first.heightMm, cellH, 'panel 1 stays the cell height');
assert.equal(second.widthMm, cellW, 'panel 2 stays the cell width');
assert.equal(second.heightMm, cellH, 'panel 2 stays the cell height');
assert.equal(first.ups, undefined, 'panel 1 is a normal label');
assert.equal(second.ups, undefined, 'panel 2 is a normal label');

const border0 = first.elements.find((el) => el.type === 'border');
const border1 = second.elements.find((el) => el.type === 'border');
assert.ok(border0?.type === 'border' && border1?.type === 'border');
assert.equal(border0.left, stored.left, 'panel 1 keeps the stored inset');
assert.equal(border0.top, stored.top);
assert.equal(border0.width, stored.width);
assert.equal(border0.height, stored.height);
assert.equal(border0.geometryVersion, 1);
assert.equal(border1.left, stored.left, 'panel 2 keeps the stored inset');
assert.equal(border1.top, stored.top);
assert.equal(border1.width, stored.width);
assert.equal(border1.height, stored.height);
assert.notEqual(border0.left, 0, 'inset is not rewritten to the cell edge');
assert.notEqual(border0.width, cellW);

const paired = composeUpsDocument(doc);
const gap = 4;
assert.equal(paired.widthMm, cellW * 2 + gap, 'both sides print on one piece');
assert.equal(paired.heightMm, cellH);
assert.equal(paired.ups, undefined);
const pairedBorders = paired.elements.filter((el) => el.type === 'border');
assert.equal(pairedBorders.length, 2);
assert.equal(pairedBorders[0]?.left, stored.left, 'row 1 border stays on the left side');
assert.equal(pairedBorders[1]?.left, cellW + gap + stored.left, 'row 2 border sits on the right side');
assert.equal(pairedBorders[0] && 'width' in pairedBorders[0] ? pairedBorders[0].width : 0, stored.width);
assert.equal(pairedBorders[1] && 'width' in pairedBorders[1] ? pairedBorders[1].width : 0, stored.width);

// The live elements buffer is the active panel, even if the stored copy is stale.
const live = [border('live', cellW, cellH)];
live[0] = { ...live[0], left: stored.left };
doc.elements = live;
const synced = upsPanelDocument(doc, 0);
assert.equal(synced.elements[0]?.id, 'live');
assert.equal(synced.widthMm, cellW);
const untouched = upsPanelDocument(doc, 1);
assert.equal(untouched.elements[0]?.id, 'b1');

const plain = createLabelDocument({ name: 'one', widthMm: 40, heightMm: 20 });
assert.equal(upsPanelDocument(plain, 0), plain);

console.log('ok ups-panel-document');
