import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PREFERRED_LOCAL_FILE_PACKAGES,
  choosePreferredLocalPackage,
} from '@/lib/file-import/pick-local-packages';

test('preferred package order prefers MIUI global file explorer first', () => {
  const chosen = choosePreferredLocalPackage(
    ['com.google.android.apps.nbu.files', 'com.mi.android.globalFileexplorer'],
    {
      'com.google.android.apps.nbu.files': true,
      'com.mi.android.globalFileexplorer': true,
    },
  );
  assert.equal(chosen, 'com.mi.android.globalFileexplorer');
});

test('preferred package order skips packages without GET_CONTENT handler', () => {
  const chosen = choosePreferredLocalPackage(
    ['com.mi.android.globalFileexplorer', 'com.android.fileexplorer'],
    {
      'com.mi.android.globalFileexplorer': false,
      'com.android.fileexplorer': true,
    },
  );
  assert.equal(chosen, 'com.android.fileexplorer');
});

test('preferred package order returns null when nothing handles GET_CONTENT', () => {
  const chosen = choosePreferredLocalPackage(
    [...PREFERRED_LOCAL_FILE_PACKAGES],
    {
      'com.mi.android.globalFileexplorer': false,
      'com.android.fileexplorer': false,
      'com.sec.android.app.myfiles': false,
      'com.google.android.apps.nbu.files': false,
    },
  );
  assert.equal(chosen, null);
});
