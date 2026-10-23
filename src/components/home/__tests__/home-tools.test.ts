import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CREATE_GRID_TOOLS,
  CREATE_HERO_TOOL,
  FILE_TOOLS,
  HOME_TOOLS,
  TOOL_GRID_GROUPS,
  type HomeTool,
  type HomeToolId,
} from '../home-tools';

const LEGACY_HOME_HREFS = [
  '/new-label',
  '/image-to-label',
  '/excel-print',
  '/pdf',
  '/ecommerce-label',
  '/new-label-setup?serialEditor=1',
];

const GRID_COLUMNS = 3;

const allIds = Object.keys(HOME_TOOLS) as HomeToolId[];

test('every legacy home href is reachable exactly once', () => {
  const hrefs = allIds.flatMap((id) => {
    const tool: HomeTool = HOME_TOOLS[id];
    return tool.href ? [tool.href] : [];
  });
  for (const href of LEGACY_HOME_HREFS) {
    assert.equal(
      hrefs.filter((h) => h === href).length,
      1,
      `expected ${href} exactly once in HOME_TOOLS`,
    );
  }
  assert.equal(hrefs.length, LEGACY_HOME_HREFS.length);
});

test('Import tile opens the .seznik file picker', () => {
  const tool: HomeTool = HOME_TOOLS.importLabel;
  assert.equal(tool.action, 'openLabelFile');
  assert.ok(FILE_TOOLS.includes('importLabel'));
});

test('every tool either links somewhere or runs an action', () => {
  for (const id of allIds) {
    const tool: HomeTool = HOME_TOOLS[id];
    assert.ok(tool.href || tool.action, `${id} needs an href or an action`);
  }
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
  const placed = [CREATE_HERO_TOOL, ...CREATE_GRID_TOOLS, ...FILE_TOOLS];
  assert.deepEqual([...placed].sort(), [...allIds].sort());
});

test('section membership matches each tool group', () => {
  for (const id of [CREATE_HERO_TOOL, ...CREATE_GRID_TOOLS]) assert.equal(HOME_TOOLS[id].group, 'create');
  for (const id of FILE_TOOLS) assert.equal(HOME_TOOLS[id].group, 'file');
});

test('3-column ToolGrid groups have length 3', () => {
  for (const [name, ids] of Object.entries(TOOL_GRID_GROUPS)) {
    assert.equal(ids.length, GRID_COLUMNS, `${name} grid has ${ids.length} tiles`);
  }
});
