# Google Sheets import: diagnosis and plan

Status: planning only. No code changed. Raster, border and print files untouched.
Date: 2026-10-14

Evidence labels: **[RUN]** = verified by running a command on this machine. **[SRC]** = from reading source, not verified on a device.

The exact symptom was left as a placeholder in the request (`[USER: add the exact symptom here]`), and `adb devices` shows no phone attached. So the diagnosis below is built from the repo and the built APK, not from the phone. **Please fill in the symptom** (nothing happened / error text / Sheet greyed out / crash). It decides which branch of the cause list applies.

---

## 1. Diagnosis

### Headline finding (most likely root cause)

**The patch is not in the build on the phone, and it is not even installed in `node_modules`.**

| Check | Result | Label |
|---|---|---|
| `grep GoogleSheetExportException node_modules/expo-document-picker/.../DocumentPickerModule.kt` | 0 hits. The file is the stock 14.0.8 module. | [RUN] |
| `localOnly` in `node_modules/expo-document-picker/{src/index.ts,build/index.js,...Options.kt}` | 0 hits in all three. | [RUN] |
| `git apply --check -p1 patches/expo-document-picker+14.0.8.patch` | Passes silently. The patch applies cleanly, so it is simply not applied right now. | [RUN] |
| `android/app/build/outputs/apk/debug/app-debug.apk` (built 14 Oct 17:38), all 9 dex files | `GoogleSheetExportException` = 0 hits. `FailedToReadDocumentException` (stock class) is present. | [RUN] |
| `node_modules/expo-document-picker` mtime is 12 Oct 12:17; patch was committed 11 Oct 16:41 (`20d592f`) | The install came after the patch, yet it is unpatched. Why is unknown: `patch-package` may have failed, or the install ran with `--ignore-scripts`. | [RUN] for the dates, cause unknown |
| `package.json` has `"postinstall": "patch-package && ..."` | Patching only happens on `npm install` / `postinstall`. | [SRC] |
| Gradle autolinks `expo-document-picker` from `node_modules` | A native build made from unpatched `node_modules` cannot contain the patch. | [SRC] |

What this does to the app today:

- The JS side (`pick-document-options.ts`) is current and **does** ask for the Sheets MIME. Metro hot-reloads it, so it looks like the feature is live.
- The old native module ignores unknown fields (`localOnly`, `initialFolder`), so nothing errors. [SRC]
- The stock module always adds `CATEGORY_OPENABLE` and sets type `*/*` plus the `EXTRA_MIME_TYPES` list. With `CATEGORY_OPENABLE`, virtual documents are hidden or greyed out in the picker. [SRC, standard Android behaviour]
- Net effect: a Sheet is greyed out or missing in the Drive picker. If the symptom matches that, this is the cause and nothing else is needed except applying the patch and rebuilding.

### Current implementation (read from source)

**JS flow** [SRC]

1. `data-file.tsx` / `use-excel-import-flow.tsx` calls `pickDocumentWithSource({ preset: 'excel' })`.
2. `use-document-source-picker.tsx` shows the sheet "This Device / Google Drive" and passes `source` on.
3. `pick-document.ts`:
   - `local` on Android goes to the `local-file-picker` module. This is a separate local module (`modules/local-file-picker`) and is not touched by this work.
   - `drive` goes to `DocumentPicker.getDocumentAsync(buildDocumentPickerRequest(...))`.
4. `pick-document-options.ts`: for Android + drive + excel preset, `androidSpreadsheetMimeTypes()` drops `*/*`, `application/octet-stream` and non-MIME strings (`public.spreadsheet`, ...), and puts `application/vnd.google-apps.spreadsheet` first. `localOnly: false`.
5. Back in `pick-document.ts`: the result extension is checked against the preset (`xlsx/xls/xlsm/csv`). If the name has no extension, it falls back to the MIME. A Sheet has no extension, so this only passes if native returns `X.xlsx`.
6. `parseExcelFile` (`excel.ts`) reads the `file://` cache URI as base64 and parses with `xlsx`.

**Native patch** (`patches/expo-document-picker+14.0.8.patch`) [SRC]

- If `options.type` contains the Sheets MIME, it leaves off `CATEGORY_OPENABLE`.
- It sets `intent.type = xlsx MIME` and puts Sheets + xlsx + the other cleaned types in `EXTRA_MIME_TYPES`.
- After picking, if the doc is Sheets-MIME or has `FLAG_VIRTUAL_DOCUMENT`, it runs `exportVirtualSpreadsheet`:
  `getStreamTypes(uri, xlsxMime)` → `openTypedAssetFileDescriptor(uri, xlsxMime, null)` → copy to `cache/DocumentPicker/<name>-<nanos>.xlsx` (100 MB cap, empty-file check) → returns name `<name>.xlsx` and MIME xlsx.
- It logs with tag `DocumentPicker` at every step (see below).
- It rejects with readable messages (`GoogleSheetExportException`).

**Small differences between the patch and the brief** [SRC]

- The brief says `getStreamTypes(uri, "*/*")`. The patch uses the xlsx filter. That works if Drive lists xlsx as an export type, which Drive normally does. Using `*/*` and then choosing an xlsx entry is more tolerant. See task T5.
- `DocumentDetailsReader.read(uri)` runs on the virtual URI before the export. If it throws for a virtual document (for example a missing size column), the pick fails with `FailedToReadDocumentException` before the export code runs. I did not verify this. The `picked uri=... mime=...` log line settles it.

### Log lines (already in the patch) and what each proves

Command: `adb logcat -s DocumentPicker:I ReactNativeJS:V *:S`

| Log line | What it proves |
|---|---|
| `intent categoryOpenable=false localOnly=false type=...xlsx extras=application/vnd.google-apps.spreadsheet,...` | The **patched** native module is running and built the intent as planned. **If this line is missing, the build lacks the patch.** `categoryOpenable=true` would mean the wrong flag. |
| `picked uri=content://com.google.android.apps.docs... mime=application/vnd.google-apps.spreadsheet` | The picker let the user choose a Sheet and returned a URI. The URI authority shows which provider answered. The MIME shows whether Drive reported it as a Sheet. |
| `flags=... virtual=true` | The provider marks it as a virtual document. Combined with the previous line it shows why the export path was chosen. `flags missing` or `query failed` means detection relied on the MIME only. |
| `getStreamTypes count=N` | `N=0` or `null`: the provider offers no export for that filter. Then `Google Drive did not return a spreadsheet`. `N>0` means xlsx is offered. |
| `exported bytes=N uri=file://.../DocumentPicker/....xlsx` | Export worked and a non-empty file exists. If this appears and import still fails, the problem is in the parser or the JS flow, not in Android. |
| `getStreamTypes denied` / `export denied` | A `SecurityException`: no URI permission. |
| `getStreamTypes failed ...` / `export failed ...` | Network or provider error. The exception class name is in the line. |
| `pick failed <Exception>: <msg>` | The pick failed after the user chose a file. The exception shows which stage. |
| `copied openInputStream bytes=N` | The normal (non-Sheet) path ran. For a Sheet this means detection missed it. |

Recommended extra logging (task T1): one JS line in `pick-document.ts` printing the request type list, and one printing `{ name, uri, mimeType, size }` of the result. This proves the JS-to-native contract. It is dev-only (`__DEV__`).

### Likely causes, in order

| # | Cause | Likelihood | One-step confirmation | Label |
|---|---|---|---|---|
| 1 | Installed build lacks the patch (`node_modules` unpatched, APK built from it) | **Very high** | Already confirmed on this machine. On the phone: no `intent categoryOpenable=...` line in logcat when opening the Drive picker. | Machine side [RUN]; phone side pending |
| 2 | `CATEGORY_OPENABLE` still set (same as #1; also would happen if Sheets MIME never reaches native) | High if #1 is fixed and Sheets is still greyed | `intent categoryOpenable=` shows `true` | [SRC] |
| 3 | MIME filter hides Sheets (primary type is a wildcard, or the list contains `octet-stream` or a non-MIME string) | Medium | `intent ... type= extras=` line: `type` must be xlsx, `extras` must start with the Sheets MIME and contain no `*/*`, `octet-stream`, `public.*` | [SRC] |
| 4 | Phone's picker has no Drive (MIUI and other limited pickers) | Medium on MIUI | Open the picker, tap the hamburger menu: is "Drive" listed? Or: `adb shell pm list packages com.google.android.apps.docs` | [SRC] |
| 5 | `getStreamTypes` returns nothing or no xlsx | Low-medium | `getStreamTypes count=` line | [SRC] |
| 6 | `DocumentDetailsReader.read` throws on the virtual URI before export | Low-medium | `pick failed FailedToReadDocumentException` with **no** preceding `picked uri=` line | [SRC] |
| 7 | Export stream empty or network failure | Low | `exported bytes=` missing, or `export failed` | [SRC] |
| 8 | Temp file or URI wrong (wrong `file://` path, JS cannot read it) | Low | `exported bytes=N uri=file://...` present, then a JS error from `readAsStringAsync`. Check `adb shell run-as <pkg> ls cache/DocumentPicker` | [SRC] |
| 9 | Parser rejects the file (not a valid workbook; empty rows) | Low | JS `Invalid File` / "no data" alert after a good export. Pull the cached xlsx and open it. | [SRC] |
| 10 | JS extension check returns `invalid` (name lacks `.xlsx`) | Low | Only if native did not rename. `picked` name in the JS log has no extension | [SRC] |

---

## 2. Options if system export cannot work on this phone

| Option | What it is | Effort | Sign-in | Native rebuild |
|---|---|---|---|---|
| **A. Fix the build** (apply patch, rebuild) | Not a workaround, the base fix. Gets the existing design running. | S (about 30 min plus build) | No | **Yes** |
| **B. "Download as .xlsx" guidance** | In-app hint on the Drive import path: open the Sheet in Drive/Sheets → File → Download → Microsoft Excel (.xlsx), then import the file from Downloads. Add to the source sheet, the error alert and Help. | S (about 1-2 h, mostly copy) | No | No (JS refresh) |
| **C. Share target** | Register the app as a receiver for `ACTION_SEND` / `ACTION_VIEW` of xlsx. In Sheets/Drive: Share → Send a copy → xlsx → pick SEZ Print. The app receives a real file URI. | M (about 1-2 days: manifest or config plugin, handle intent on cold and warm start, copy to cache, route into the import flow) | No | **Yes** |
| **D. Link paste** | User pastes a Sheet link; app fetches `.../export?format=xlsx`. Only works if the Sheet is shared "anyone with the link". Private Sheets get a login page. | S-M (about 1 day) | No, but private sheets fail | No |
| **E. Drive API export** | Google Sign-In plus `files.export`. Works for private Sheets, and independent of the phone's picker. | L (several days, plus Google Cloud project, OAuth consent, scopes) | **Yes** | **Yes** (sign-in module) |

Notes:

- Option E is listed only so you can approve or reject it. **Not recommended now**, and I will not add it without your approval. The `drive.readonly` scope is restricted and may trigger Google's app verification. `drive.file` works with the Google Picker flow, which is awkward on native.
- Option D is a limited version of "web URL export". It avoids sign-in only for link-shared sheets, and the link goes through whatever the user pastes, so it needs input checks (host must be `docs.google.com`).
- Option C is the strongest fallback if a given phone has no Drive provider, because the Sheets app does the export itself.

---

## 3. Recommendation

**Do A first, add B alongside it, and hold C in reserve.**

1. **A** is the only thing that can be wrong right now, and it is confirmed [RUN]. The design (patch plus JS options) is already written. Nothing else should be built until a patched build is tested on the phone.
2. **B** costs almost nothing, needs no rebuild, and covers every phone where Drive is missing from the picker (cause 4) and every Drive failure (causes 5-7). It turns a dead end into an instruction. It also works with the local picker, which stays unchanged.
3. **C** only if the patched build fails on the target phone and the user cannot use B. It is a native change and a real feature.
4. **D and E** are not recommended: D works only for public sheets, and E needs sign-in, which was rejected earlier.

---

## 4. Task list

Legend for rebuild: **REBUILD** = native build needed, **REFRESH** = Metro reload only.

### T0. Confirm what the phone is running (no code)
- **Goal:** prove the installed build matches this machine's finding.
- **Files:** none.
- **Rebuild:** no.
- **Verify on device:** with the phone on USB, run `adb logcat -c; adb logcat -s DocumentPicker:I ReactNativeJS:V *:S`, then Import → Google Drive. No `intent categoryOpenable=` line means unpatched. Also paste the symptom into the top of this file.
- **Depends on:** nothing.

### T1. Add dev-only JS logging
- **Goal:** log the request type list and the picked-file result in `__DEV__` only.
- **Files:** `src/lib/file-import/pick-document.ts`.
- **Rebuild:** REFRESH.
- **Verify on device:** logcat shows `ReactNativeJS` lines with `type` list and `{name, uri, mimeType, size}`.
- **Depends on:** nothing. Do not run it before T0 if you want a clean baseline.

### T2. Apply the patch and prove it
- **Goal:** get `node_modules/expo-document-picker` patched. Find why `postinstall` did not do it.
- **Files:** none in the repo (node_modules and the existing patch file). The patch file stays as is unless it fails.
- **Rebuild:** no (this step only prepares node_modules).
- **How:** run `npx patch-package` and read its output (it prints `expo-document-picker@14.0.8 ✔`). Then `grep -c GoogleSheetExportException` on the module (expect at least 1). If it fails with a version mismatch, the cause is in the install, not the patch.
- **Verify:** the grep count above; `git status` must show no change under `patches/`.
- **Depends on:** nothing. Note that this edits `node_modules` only, which is gitignored.

### T3. Rebuild and install a dev build
- **Goal:** native build that contains the patch.
- **Files:** none (`android/` is gitignored and prebuilt).
- **Rebuild:** **REBUILD** (`npx expo run:android`, or the project's usual build command).
- **Verify:** `unzip -p app-debug.apk 'classes*.dex' | strings | grep -c GoogleSheetExportException` is at least 1 (same check as above). On device: `intent categoryOpenable=false` appears in logcat.
- **Depends on:** T2. Run T1 before it so the JS logs ship in the same build (optional).

### T4. Test the Sheet end to end on the phone
- **Goal:** pick a real native Sheet from Drive and get label data.
- **Files:** none.
- **Rebuild:** no.
- **Verify on device:** Data file → Excel tab → Import → Google Drive → the Sheet is selectable (not greyed) → logcat shows `picked`, `flags virtual=true`, `getStreamTypes count>0`, `exported bytes=N` → the sheet-options prompt appears → rows load. Also test a normal `.xlsx` in Drive and a CSV (regression), and a cancel.
- **Depends on:** T3. If it fails, the first failing log line picks the cause from the table in section 1.

### T5. Harden the export (only if T4 shows cause 5 or 6)
- **Goal:** make export tolerant: `getStreamTypes(uri, "*/*")` then pick the xlsx entry; make `DocumentDetailsReader.read` failure on virtual URIs non-fatal (fall back to the URI's last path segment as name).
- **Files:** `patches/expo-document-picker+14.0.8.patch` (regenerate with `npx patch-package expo-document-picker`).
- **Rebuild:** **REBUILD**.
- **Verify on device:** repeat T4. Logs show the extra attempt.
- **Depends on:** T4 result.

### T6. Add the fallback guidance (Option B)
- **Goal:** tell the user how to export a Sheet manually when the picker or export fails.
- **Files:** `src/lib/file-import/use-file-source-sheet.tsx` (a one-line hint under "Google Drive"), `src/lib/use-excel-import-flow.tsx` / `alertImportError` path (map "Google Drive did not return a spreadsheet" / "could not be downloaded" errors to an alert with the manual steps), `src/app/(tabs)/help.tsx` (a short entry).
- **Rebuild:** REFRESH.
- **Verify on device:** turn on airplane mode, pick a Sheet, and confirm the alert text appears with the manual steps. Check the Help entry.
- **Depends on:** nothing. Better after T4 so the wording matches real error messages.

### T7. Unit tests for the options builder
- **Goal:** lock the MIME list rules: no `*/*`, `octet-stream`, `public.*`; Sheets first; local picker unaffected.
- **Files:** `src/lib/file-import/__tests__/pick-document-routing.test.ts` (extend; there are already related tests for these rules).
- **Rebuild:** no.
- **Verify:** run the project's test command (the test file uses `node:test`).
- **Depends on:** nothing.

### T8. Make the patch survive installs
- **Goal:** stop this from recurring.
- **Files:** `package.json` (only if the cause from T2 is a script problem), maybe a short note in `README.md`.
- **Rebuild:** no.
- **Verify:** `rm -rf node_modules/expo-document-picker && npm install` (or the project's install), then the grep from T2 returns at least 1. Also confirm CI or EAS builds run `postinstall`.
- **Depends on:** T2 (needs its finding on why patching failed).

### T9. (Only if needed) Share target, Option C
- **Goal:** Share → Send a copy → xlsx → SEZ Print opens the import flow with that file.
- **Files:** `app.json` or a plugin under `plugins/` (intent filter), JS handler for incoming intents, `src/lib/use-excel-import-flow.tsx`.
- **Rebuild:** **REBUILD**.
- **Verify on device:** from the Sheets app, share a Sheet as xlsx to SEZ Print. Test cold start and app already open.
- **Depends on:** T4 failing on the target phone, and your approval.

Suggested order: T0 → T2 → T3 → T4 (this alone probably fixes it), then T6, T7, T8. T1 can go in with T3. T5 and T9 only if T4 says so.

---

## 5. Risks and open questions

**Open questions (need your answer)**
1. What exactly did you see on the phone? (see top of this file)
2. Which phone and Android version? Is Drive installed, and is it in the picker's menu?
3. Is the phone running the debug APK from 14 Oct 17:38, or a build from somewhere else (EAS or another machine)? If another machine, its `node_modules` may be patched. Check there too.
4. Do you want T6 (manual-export guidance) even if T4 passes? I recommend it.
5. Do you want me to look at why `postinstall` skipped the patch on 12 Oct (T2/T8)? It could affect other builds.

**Risks**
- `node_modules` is not under git. Any `npm install` that skips scripts silently drops the patch again, and a later native build looks fine but is stock. T8 addresses this.
- The "Drive disables Sheets when type is a wildcard / OPENABLE is set" rule is described in the patch comments, but I did not verify it against current Drive behaviour. It needs the device test (T4).
- The patch changes the intent to a single xlsx primary type with an `EXTRA_MIME_TYPES` list. `.xls` and `.csv` rely on that list and should be regression-tested (T4).
- `android/` is gitignored and prebuilt (no `ios/` directory), so a rebuild must reuse the existing project and not regenerate it, or local changes there could be lost. I won't run `expo prebuild --clean` without asking.
- The Sheet is exported when the user picks it, so the data is a snapshot. Later edits to the Sheet are not picked up (expected, but worth telling the user).
- The 100 MB cap and the cache copy mean large Sheets are slow and use cache space. The cache files are never cleaned up by this patch (stock Expo has the same behaviour for its copies).
- Options D and E involve a network fetch of user data. D has the private-sheet failure mode and URL validation concerns. E involves sign-in and OAuth verification. Neither is started without your approval.
- Not changed or touched by any task above: `modules/local-file-picker`, raster, border and print code, and git state (no reset/checkout/merge/stash).
