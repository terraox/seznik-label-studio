import assert from 'node:assert/strict';
import test from 'node:test';

import { HELP_TOPICS, helpTopic } from '@/lib/help/topics';
import { HOME_TOOLS } from '@/components/home/home-tools';

test('topic ids are unique and every topic has a body', () => {
  const ids = HELP_TOPICS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const topic of HELP_TOPICS) {
    assert.ok(topic.title && topic.summary, topic.id);
    assert.ok(topic.blocks.length > 0, topic.id);
    for (const block of topic.blocks) {
      if (block.type === 'steps' || block.type === 'bullets') assert.ok(block.items.length > 0, topic.id);
      else assert.ok(block.text.trim().length > 0, topic.id);
    }
  }
});

test('every Home tool has a help page', () => {
  const wanted: Record<keyof typeof HOME_TOOLS, string> = {
    newLabel: 'new-label',
    imageToLabel: 'upload-label',
    serialLabels: 'serial-labels',
    shippingLabels: 'shipping-labels',
    excel: 'excel',
    pdf: 'pdf',
    printImage: 'print-image',
    importLabel: 'seznik-files',
  };
  for (const id of Object.values(wanted)) assert.ok(helpTopic(id), id);
});

test('New Label is explained in detail', () => {
  const text = JSON.stringify(helpTopic('new-label'));
  for (const word of ['Shape', 'Size presets', 'Labels across', 'Label name', 'Create Label', 'Save', 'Print']) {
    assert.ok(text.includes(word), word);
  }
});
