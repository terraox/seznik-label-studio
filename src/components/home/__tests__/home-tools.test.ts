import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CREATE_GRID_TOOLS,
  CREATE_HERO_TOOL,
  FILE_TOOLS,
  HOME_TOOLS,
  LABEL_TYPE_TOOLS,
  TOOL_GRID_GROUPS,
  type HomeToolId,
} from '../home-tools';

const LEGACY_HOME_HREFS = [
  '/new-label',
  '/image-to-label',
  '/excel-print',
  '/pdf',
  '/print-photo-modal',
  '/new-label-setup?isTwoUps=true',
  '/shipping-label',
  '/customize-template',
  '/img-to-label',
  '/new-label-setup?serialEditor=1',
];

const GRID_COLUMNS = 3;
const LABEL_TYPE_COLUMNS = 3;

const allIds = Object.keys(HOME_TOOLS) as HomeToolId[];

test('every legacy home href is reachable exactly once', () => {
  const hrefs = allIds.map((id) => HOME_TOOLS[id].href);
  for (const href of LEGACY_HOME_HREFS) {
    assert.equal(
      hrefs.filter((h) => h === href).length,
      1,
      `expected ${href} exactly once in HOME_TOOLS`,
    );
  }
  assert.equal(hrefs.length, LEGACY_HOME_HREFS.length);
});

test('PDF tile keeps pointing at /pdf', () => {
  assert.equal(HOME_TOOLS.pdf.href, '/pdf');
});

test('every tool icon is an Ionicons outline glyph', () => {
  for (const id of allIds) {
    assert.match(HOME_TOOLS[id].icon, /-outline$/, `${id} icon must be an -outline glyph`);
  }
});

test('every tool is placed in exactly one home section', () => {
  const placed = [CREATE_HERO_TOOL, ...CREATE_GRID_TOOLS, ...FILE_TOOLS, ...LABEL_TYPE_TOOLS];
  assert.deepEqual([...placed].sort(), [...allIds].sort());
});

test('section membership matches each tool group', () => {
  for (const id of [CREATE_HERO_TOOL, ...CREATE_GRID_TOOLS]) assert.equal(HOME_TOOLS[id].group, 'create');
  for (const id of FILE_TOOLS) assert.equal(HOME_TOOLS[id].group, 'file');
  for (const id of LABEL_TYPE_TOOLS) assert.equal(HOME_TOOLS[id].group, 'labelType');
});

test('3-column ToolGrid groups have length 3', () => {
  for (const [name, ids] of Object.entries(TOOL_GRID_GROUPS)) {
    assert.equal(ids.length, GRID_COLUMNS, `${name} grid has ${ids.length} tiles`);
  }
});

test('Label types row has exactly 3 tiles', () => {
  assert.equal(LABEL_TYPE_TOOLS.length, LABEL_TYPE_COLUMNS);
});
