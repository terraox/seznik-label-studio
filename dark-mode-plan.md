# Dark Mode: Stage 1 Audit and Plan

Status: **STOP 1. Waiting for approval.** No app code has changed. This file is the only thing written.

Tags: **[run]** means verified by running a command. **[read]** means from reading the source.

---

## 0. Decisions I need from you

| # | Question | My recommendation |
|---|----------|-------------------|
| D1 | You asked for "pure black and white contrast". The brief also says "not pure black everywhere". | Page background is pure black `#000000` and main text is pure white `#FFFFFF`. Cards, sheets and popups are dark grey steps (`#121212`, `#1E1E1E`, `#2A2A2A`) so the layers can still be told apart. |
| D2 | The header bar is navy `#214668` today. What should it be in dark? | Black `#000000` with a thin grey line under it. This matches "pure black". The other option is to keep the navy brand colour. |
| D3 | Light mode uses about 60 slightly different greys. | Merge them into the token set. Brand colours stay exact. Some greys move a tiny step in light mode. The other option is to keep light mode pixel-identical, which needs about 35 tokens. |
| D4 | Dev and debug screens (phase2–9, stage-a-gates, ground-truth-parity, calibration-dots, location-dots, dot-buffer-1k, canvas-skia-prototype, dev-skia-test, file-picker-diagnostics, calibration-print, pdf-thermal) | Skip them and wrap them in a fixed light scope, so they stay light in dark mode. They hold 898 colour literals. |
| D5 | Android navigation bar buttons. Your uncommitted `plugins/with-light-navigation-bar.js` forces **dark** buttons, which would be invisible on black. | Add `expo-navigation-bar` and set the button style from JS when the theme changes. This is a new native dependency, so it needs a rebuild, but there is no hand-written Kotlin. The other option is to extend the plugin's generated Kotlin in MainActivity. |
| D6 | Template tab thumbnails (about 85% of the 461 literals in `template.tsx`) | They stay light, as white cards on the dark page, because they show what will print. |
| D7 | Where the control goes | A new "Appearance" row in the Settings tab. It opens an action sheet: Follow system / Light / Dark. |
| D8 | Login and register screens (switched off) | Skip for now and add them to the backlog. |
| D9 | Proof that print bytes are unchanged on the ViewShot path | Add a dev-only log of a SHA-1 of the captured PNG in `print.tsx`, so you can print the same label in light and dark and compare. It only reads the bytes and never changes them. |

---

## 1. How colours work today

| Finding | Tag |
|---|---|
| The project is on **Expo SDK 54** (`expo ~54.0.37`, RN 0.81.5), but `AGENTS.md` points to the v57 docs. I will use the SDK 54 docs because they match what is installed. Please confirm. | [read] |
| `src/constants/theme.ts` has a template `Colors.light/dark` set with 5 keys. Only `ThemedText`, `ThemedView`, `hint-row`, `collapsible`, `web-badge` and `app-tabs.web` use it, through `useTheme()`. None of these are the main UI. | [run] |
| `src/constants/ui.ts` `Palette` (12 fixed light colours, plus `accentStrong`, `HomeStatusColors`, `cardShadow`, `androidRipple`) is the real design system. 98 `.tsx` files import it. | [run] |
| 164 `StyleSheet.create` calls are at module level and read `Palette` once at import. They cannot react to a theme change. This is the main structural problem. | [run] |
| No `makeStyles` or `useMemo(StyleSheet)` pattern exists. | [run] |
| `_layout.tsx` already switches React Navigation between `DarkTheme` and `DefaultTheme` from the system `useColorScheme()`. `app.json` has `userInterfaceStyle: "automatic"`. The Android `AppTheme` is `Theme.AppCompat.DayNight`. **This means a phone in dark mode is already partly dark today:** navigator backgrounds turn near-black, and any Android `<Text>` with no colour turns light. This is a likely existing bug. Phone check needed. | [read] |
| `StatusBar style="light"` is fixed, which suits the navy header. | [read] |
| `Appearance.setColorScheme()` → `AppCompatDelegate.setDefaultNightMode()` on Android. `MainActivity` has `uiMode` in `configChanges`, so switching **does not restart** the activity. RN `useColorScheme()` and Android system dialogs follow the override. | [read] |
| `values-night/` is empty. The native splash colour comes from the `expo-splash-screen` plugin (`#FEFEFE`) and has no dark value. | [read] |
| The theme preference must persist. `settings-store.ts` uses zustand `persist` with AsyncStorage, which loads asynchronously. | [read] |

### Hard-coded colour count [run]

`grep` for hex, `rgb()`/`rgba()`, `'white'` and `'black'` across `src/**/*.ts(x)`, excluding `__tests__`: **3,464 literals in 190 files.**

| Group | Files | Literals |
|---|---|---|
| To convert (product UI) | 130 | 2,309 (includes ~400 thumbnail literals in `template.tsx` that stay light) |
| Stays light: canvas, print, data, constants | 41 | 257 |
| Dev and debug screens (D4) | 19 | 898 |

Worst product-UI files: `(tabs)/template.tsx` 461 · `edit.tsx` 73 · `scan.tsx` 69 · `serial-label.tsx` 65 · `barcode-property-panel` 60 · `shipping-editor/label-editor` 53 · `print.tsx` 52 · `degrees-property-panel` 47 · `data-file` 44 · `text-property-panel` 42 · `image-property-panel` 40 · `print-photo` 39 · `jewellery-label` 39 · `time-property-panel` 38 · `shipping-editor/label-size-picker` 37 · `arctext-property-panel` 36 · `new-label-setup` 35.

---

## 2. Screens and components, grouped [run + read]

**Fully theme-able today:** `themed-text`, `themed-view`, `hint-row`, `ui/collapsible`, `web-badge`, `app-tabs.web` (web only).

**Partly hard-coded** (use `Palette` plus some literal hex): nearly everything else. This includes all tabs, settings screens, the editor chrome, property panels, print, printers, the PDF editor, the Excel flow, dialogs and sheets.

**Fully hard-coded** (no `Palette`): `ui/ios-alert-modal`, `animated-splash`, `canvas-rulers` (mostly), `RootErrorBoundary` in `_layout`, `konva-transformer` HUD, and the dev screens.

### All user-reachable screens (47 routes)

- **Tabs:** home `index`, `template`, `shop`, `help`, `setting`
- **Editor:** `edit`, `image-crop`
- **Print:** `print`, `share` (modal), `print-photo`, `print-photo-modal` (modal), `photo-frames`
- **Create:** `new-label` (modal), `new-label-setup`, `customize-template` (modal), `shipping-label` (modal), `jewellery-label` (modal), `serial-label`, `img-to-label`, `image-to-label`, `scan`, `ocr`, `asr`
- **Files/Data:** `pdf`, `pdf-editor`, `data-file`, `excel-print`, `excel-data-preview`, `excel-bulk-setup`, `column-name`
- **Settings:** `advanced-settings`, `printing-settings`, `editing-settings`, `editor-settings`, `default-property-settings`, `label-settings`, `drawing-color`, `cache-settings`, `app-permissions`, `language-switch`, `font-library`, `clipart`, `border-library`, `printing-history`
- **Printer:** `printer-connect`, `printer-diagnostics` (reachable from Printing Settings and Printer Connect)

### Shared overlays

Modals, sheets and popups: `ui/action-sheet`, `ui/ios-alert-modal` (+host), `label-size-dialog`, `label-dimension-modal`, `print-size-selector`, `template-choice-sheet`, `excel-import-options-modal`, `walkthrough-overlay`, `editor/more-menu`, `grid-spacing-popover`, `table-size-picker`, `quick-value-modal`, `printers/connect/bluetooth-blockers`, `settings/default-property-settings-fields`, `shipping-editor/label-size-picker`, `pdf-editor/pdf-print-sheet`, plus the in-file `<Modal>`s in `edit`, `scan`, `serial-label`, `shipping-label`, `label-settings` and `pdf-thermal`.

---

## 3. What must stay light, and how it is kept light

### Must stay light [read]

| Area | Files |
|---|---|
| Artboard fill (`#FFFFFF` or the doc background) | `editor/konva-canvas.tsx` lines 358–371 (artboard only, not its surroundings) |
| Element rendering | `editor/element-renderer.tsx`, `editor/skia-element-renderer.tsx`, `editor/skia-image-artboard*.tsx`, `editor/canvas-grid-overlay.tsx`, `editor/signature-drawing-board.tsx` (drawing surface), `editor/mono-image-preview.tsx` |
| Label previews and thumbnails | `label-preview.tsx`, `excel-label-preview.tsx`, `print-history-entry-preview.tsx`, `border-preview.tsx`, `photo-frame-preview.tsx`, `stock-silhouette.tsx`, `cable-flag-outline.tsx`, `print-grid-layer.tsx`, `print-ruler-layer.tsx`, `home/continue-card` preview stage, `template-choice-sheet` previews, `(tabs)/template.tsx` thumbnail styles, `shipping-editor/shipping-label-canvas.tsx`, `clipart-tile` art |
| **Print capture (ViewShot to printer)** | `print.tsx` lines 1922–1930 (`<ViewShot ref={shotRef}>` around `LabelPreview`, white background) |
| Share and image capture | `share.tsx` line 109 (ViewShot), `edit.tsx` `canvasShotRef` |
| Print and raster pipeline | `src/printing/**`, `src/lib/printer/**`, `src/lib/pdf-editor/{render-label,export}.ts`, `src/lib/shipping-editor/pdf-export.ts`. **Not touched.** |

### How dark mode is kept out (three layers)

1. **No theme imports in print-safe files.** None of the files above will import the theme module. They keep their literal colours. A guard test fails if any of them imports `@/theme` or `useColorScheme`.
2. **`<LightScope>`.** This is a context provider that forces the light token set for everything inside it. It goes around the artboard in `konva-canvas`, the ViewShot subtree in `print.tsx` and `share.tsx`, every preview stage, and the D4 dev screens. Even if a themed component is placed inside one of these areas later, it still resolves to light.
3. **Android native default text colour.** Under DayNight dark, a `<Text>` or `<TextInput>` with no explicit `color` turns light. Inside `LightScope`, element text must always pass an explicit colour. Stage 2 adds a check that every `<Text>` in the print-safe files has a `color`. The element text styles appear to carry `labelStyle.color` [read], but this must be confirmed for every path.

---

## 4. Proposed design

### 4.1 Tokens (`src/theme/tokens.ts`)

Light values are today's values (D3). Contrast ratios are against the dark `bg` / `surface` / `raised` backgrounds, computed with the WCAG formula **[run]**.

| Token | Light | Dark | Dark contrast (bg / surface / raised) | Use |
|---|---|---|---|---|
| `bg` | `#EFF2F7` | `#000000` | — | Screen background |
| `surface` | `#FFFFFF` | `#121212` | — | Cards, rows, tab bar |
| `raised` | `#F5F7FA` | `#1E1E1E` | — | Sheets, popups, menus, inputs |
| `raised2` | `#EEF1F5` | `#2A2A2A` | — | Pressed or selected row, segmented track |
| `header` | `#214668` | `#000000` (D2) | — | Top bar |
| `onHeader` | `#FFFFFF` | `#FFFFFF` | 21 / — / — | Header text and icons |
| `text` | `#2C3E50` | `#FFFFFF` | 21.0 / 18.7 / 16.7 ✅ | Main text |
| `textSecondary` | `#556473` | `#B3B3B3` | 10.0 / 8.9 / 8.0 ✅ | Captions, labels |
| `textMuted` | `#7E8B98` | `#8A8A8A` | 6.1 / 5.4 / 4.8 ✅ | Hints, placeholders, inactive tab |
| `textDisabled` | `#A4B0BC` | `#6B6B6B` | 3.9 / 3.5 / 3.1 (exempt from WCAG) | Disabled |
| `border` | `#CBD5E1` | `#6B6B6B` | 3.9 / 3.5 / 3.1 ✅ (≥3) | Inputs, outlined buttons |
| `hairline` | `#EAECEF` | `#2E2E2E` | 1.5 (decorative only) | Dividers between rows |
| `accent` (text, icons, selected) | `#17A6B8` | `#3FC6D6` | 10.3 / 9.2 / 8.1 ✅ | Active icons, links, switches |
| `accentFill` (button background) | `#0E7C8A` | `#0E7C8A` | white text on it 4.9 ✅ | Primary buttons |
| `onAccent` | `#FFFFFF` | `#FFFFFF` | 4.9 ✅ | Text on `accentFill` |
| `accentSoft` | `rgba(23,166,184,.15)` | `rgba(63,198,214,.18)` | — | Selected chip background |
| `danger` | `#E84149` | `#FF6B6B` | 7.6 / 6.8 / 6.0 ✅ | Delete, errors |
| `success` | `#18794A` | `#4ADE80` | 12.1 / 10.8 / 9.6 ✅ | Connected |
| `warning` | `#B45309` | `#FBBF24` | 12.6 / 11.2 / 10.0 ✅ | Warnings |
| `link` (iOS-style dialog buttons) | `#007AFF` | `#6CB4FF` | 9.6 / 8.6 / 7.6 ✅ | Alert and action-sheet buttons |
| `scrim` | `rgba(0,0,0,.45)` | `rgba(0,0,0,.70)` | — | Behind modals |
| `canvasArea` | `#EFF2F7` | `#000000` | white artboard on it: 21:1 | Around the artboard |
| `shadow` | `#0B1F33` | none (use `hairline` border) | — | Elevation |

The status chip fills (`HomeStatusColors`, white text, ≥4.5) stay the same in both themes.

### 4.2 Editor surroundings

- The area around the white artboard is pure black (`canvasArea`). White on black is 21:1, so the label stands out clearly with no border or shadow. Shadows are not drawn in dark mode.
- Rulers (`canvas-rulers.tsx`): background `surface #121212`, ticks `#6B6B6B`, numbers `textSecondary` (8.9:1). The light ruler numbers are 2.8:1 today.
- The selection outline `#E8543C` is 5.8:1 on black ✅ and 3.6:1 on white. It is unchanged.
- Resize handles `#42BCC7` are 7.7:1 on dark ✅. They are 2.3:1 on white **today** (existing light-mode issue, not in scope). They are unchanged.
- The snap guide and transformer stroke already switch by fill luminance (`canvas-chrome.ts`). They are unchanged.

### 4.3 Tools, panels, popups, font picker

- The bottom tools sheet, editing pad and property panels use `surface`. Tabs, segmented controls and steppers use `raised` / `raised2`. The selected state is `accentSoft` with `accent` text.
- Sliders: track `raised2`, fill `accent`, thumb white. Switches: off track `#6B6B6B`, on track `accent`.
- Popups, menus and `ios-alert-modal` use `raised` on `scrim`. Text in the font picker (`font-library`) is drawn in each font with the `text` token. That is UI, not label content, so it turns white.
- Colour swatches in the property panels (the label ink colours black and white) keep their real colours and get a `border` ring, so black stays visible on dark.

### 4.4 Native parts

| Part | Plan | Rebuild? |
|---|---|---|
| Status bar | Keep `style="light"`. The header is dark in both themes. Light modal screens set their own style. | Metro |
| Android nav bar buttons | D5: light buttons in dark mode, dark buttons in light mode. Also update or replace `with-light-navigation-bar.js`. | **Rebuild** |
| Native splash | Add `dark.backgroundColor: "#000000"` to the `expo-splash-screen` plugin. The native splash follows the **system** setting, because it shows before JS can read your saved choice. | **Rebuild** |
| JS animated splash | Background from the theme. `splash-animation.webp` has alpha **[run]**, but the art itself must be checked on black. | Metro |
| No flash at startup | The navigator already mounts only after the splash finishes **[read]**. The splash and navigator wait for the settings store to load, then call `Appearance.setColorScheme()` before the first themed frame. | Metro |
| Keyboard | Android: the keyboard app follows the system and the app cannot set it. iOS: `keyboardAppearance` comes from the theme via a shared `ThemedTextInput` default. | Metro |
| System `Alert.alert`, date and number pickers | Android dialogs follow `AppCompatDelegate` (DayNight) **[read]**. No date picker library is installed **[read]**. | Metro |
| Document and image picker | System UI, follows the phone's setting, not the app's. This is expected. | — |
| App icon / adaptive icon | Unchanged. | — |

### 4.5 Images

| Asset | Problem | Fix |
|---|---|---|
| `printer_*.png` (printer-connect cards) | Product photos might have dark edges on black | Put them on a fixed light `surface` tile. Check on the phone. |
| `splash-animation.webp` | Logo colours unknown on black | Check on the phone. If needed, make a dark variant (needs a design asset). |
| `logo.png` (auth, switched off) | RGB with no alpha, so it shows as a white box | Backlog (D8) |
| Home and tool icons | Drawn as SVG or `AppIcon` with a tint | Tint from tokens |

---

## 5. Architecture

```
src/theme/
  tokens.ts            light + dark token objects (single source)
  preference.ts        'system' | 'light' | 'dark' in settings-store (persisted)
  theme-provider.tsx   reads preference → Appearance.setColorScheme → context {scheme, c}
  use-colors.ts        useColors() → c ; useScheme()
  make-styles.ts       makeStyles((c) => ({...})) → useStyles(); caches one StyleSheet per scheme
  light-scope.tsx      <LightScope> forces light tokens for children
```

Converting a file is mechanical: `const styles = StyleSheet.create({` → `const useStyles = makeStyles((c) => ({`, add `const styles = useStyles()` in each component, and change `Palette.x` / `'#hex'` to `c.token`. `Palette` stays in place, marked deprecated, until the last group is done.

**Kill switch:** `THEME_DARK_READY = false` makes the resolved scheme always `light` until the final group, so you never see a half-dark app. In dev builds, the Settings control can still preview dark. This also fixes the existing partly-dark problem described in §1 from the first task onward.

---

## 6. Task list

Everything is **Metro reload only** except G8. ⏸ = STOP 2, where I report and you test on the phone.

| # | Goal | Files | Rebuild | Phone check | Depends on |
|---|---|---|---|---|---|
| **G0.1** | Tokens and contrast test | `src/theme/tokens.ts`, `src/theme/__tests__/contrast.test.ts` | Metro | none (tests only) | — |
| **G0.2** | Preference, provider, kill switch, set React Navigation theme from tokens | `src/theme/*`, `settings-store.ts`, `_layout.tsx` | Metro | Phone in system dark mode: the app is now fully light (fixes the partly-dark issue) | G0.1 |
| **G0.3** | `makeStyles`, `useColors`, `LightScope`, guard tests (no hard-coded colours in converted files, no theme import in print-safe files) | `src/theme/*`, `src/theme/__tests__/*` | Metro | none | G0.2 |
| **G0.4** | Settings → Appearance row and sheet (Light / Dark / Follow system), i18n keys | `(tabs)/setting.tsx`, `src/lib/i18n.ts` | Metro | The row shows and the choice is saved after an app kill | G0.3 ⏸ |
| **G1** | App shell | `_layout` (error boundary), `app-tabs`, `settings-stack-header`, `settings-ui`, `themed-*`, `ui/action-sheet`, `ui/ios-alert-modal`, `ui/collapsible`, `walkthrough-overlay`, `animated-splash` | Metro | Tab bar, headers, any alert, action sheet, walkthrough | G0 ⏸ |
| **G2** | Tabs | `(tabs)/index` + `components/home/*`, `(tabs)/template` (UI chrome only, thumbnails inside `LightScope`), `shop`, `help`, `setting` | Metro | All 5 tabs | G1 ⏸ |
| **G3** | Settings stack | advanced, printing, editing, editor, default-property (+fields), label-settings, drawing-color, cache, app-permissions, language-switch, printing-history (preview stays light), font-library, clipart, border-library, column-name | Metro | Every settings screen | G1 ⏸ |
| **G4a** | Editor frame | `edit.tsx` chrome, `konva-canvas` (surroundings only, artboard in `LightScope`), `zoomable-edit-pad`, `canvas-rulers`, `editing-pad`, `static-tool-palette`, `palette-tool-item`, `canvas-panel-divider`, `bulk-label-nav`, `resize-size-hud`, `konva-transformer` HUD, `more-menu`, `grid-spacing-popover`, `label-size-dialog`, `label-dimension-modal`, `label-size-editor`, `label-size-setup-section` | Metro | Editor: white label, dark surroundings, rulers, handles, menus | G1 ⏸ |
| **G4b** | Property panels | all `editor/*-property-panel.tsx`, `font-slider`, `gray-threshold-slider`, `text-align-buttons`, `position-controls`, `position-icons`, `chrome-icons`, `editor-menu-icons`, `table-size-picker`, `quick-value-modal`, `reference-image-panel`, `image-crop-screen` / `image-crop-canvas` (UI only) | Metro | Each element type's panel | G4a ⏸ |
| **G5** | Print and printers | `print.tsx` chrome (ViewShot in `LightScope`, D9 hash log), `print-size-selector`, `quality-control`, `printers/**`, `printer-connect`, `printer-diagnostics` | Metro | Print screen, plus the **byte-identity check** below | G4 ⏸ |
| **G6** | Create flows | `new-label`, `new-label-setup`, `template-choice-sheet`, `customize-template`, `shipping-label` + `shipping-editor/*` (UI), `jewellery-label`, `serial-label`, `img-to-label`, `image-to-label`, `image-crop`, `photo-frames`, `print-photo`, `print-photo-modal`, `scan`, `ocr` + `ocr-result-panel`, `asr`, `share` | Metro | Each flow end to end | G1 ⏸ |
| **G7** | Files and data | `pdf`, `pdf-editor` + `components/pdf-editor/*` (page view stays light), `data-file`, `excel-*`, `excel-data-table`, `excel-import-options-modal`, `excel-kind-icons` | Metro | PDF and Excel flows | G1 ⏸ |
| **G8** | Native | `app.json` splash dark colour; D5 nav bar (`expo-navigation-bar` + update or remove `plugins/with-light-navigation-bar.js`) | **REBUILD** (`npx expo run:android`) | Splash in system dark; nav bar buttons visible in both themes and after switching | G0 ⏸ |
| **G9** | Turn on the kill switch; dev screens in `LightScope` (D4); final report and `git diff --stat` | `src/theme/*`, dev screen roots | Metro | The full test sheet (§8) | all ⏸ |

Groups G2, G3, G4, G6 and G7 are independent after G1, so the order can change.

---

## 7. Risks

1. **ViewShot print capture (highest risk).** `print.tsx` sends a screenshot of `LabelPreview` to the printer on several paths. A dark colour inside that view would change print bytes. Mitigation: `LightScope`, no theme imports in print-safe files, the explicit-colour check on `<Text>`, and the D9 hash compare.
2. **Android `<Text>` with no colour** turns light under DayNight dark, both inside and outside the canvas. Every converted `Text` gets an explicit token. Print-safe files get the guard check.
3. **The white canvas next to the dark UI.** Handles that sit outside the artboard are fine (7.7:1). Dashed jewellery and cable guides (`#CBD5E1`) drawn on white are unchanged.
4. **Shadows disappear on black.** Use the `hairline` border in dark mode for cards and popups.
5. **Transparent PNGs:** printer photos, the splash art and clipart thumbnails. Clipart tiles keep a white tile so black art stays visible.
6. **Colour swatches:** black ink on a dark panel. Add a `border` ring.
7. **Your uncommitted nav-bar plugin** forces dark buttons. It must change in G8, or the buttons become invisible in dark mode.
8. **Third-party components:** `react-native-qrcode-svg` and the barcode SVGs are canvas-side and pass explicit colours. System pickers follow the phone. React Navigation's theme is mapped from the tokens.
9. **Module-level styles** in files not yet converted stay light, which is acceptable behind the kill switch. Something forgotten shows up as a light island, not as invisible text.
10. **Existing light-mode contrast failures** (not fixed unless you ask) **[run]**: `Palette.muted` text 3.5:1, `accent` as text 2.9:1, placeholder `#94A3B8` 2.6:1, ruler numbers 2.8:1, handle on white 2.3:1, inactive tab `#7A8794` 3.7:1.

---

## 8. Phone test sheet

**How to switch:** Settings tab → Appearance → Light / Dark / Follow system. For Follow system, use Android quick settings → Dark theme on or off while the app is open. It should switch live.

**Every screen:** no light boxes left behind, no invisible text or icons, placeholders readable, pressed and selected states visible, scrim behind modals, nav bar buttons visible.

| Area | What must look right |
|---|---|
| Cold start | Splash matches the theme (system setting for the native splash). No white flash before home. The saved choice is kept after the app is killed. |
| Home tab | Header, status chip, hero card, tool tiles and icons, continue card (**the preview stays white**), Buy-from-us strip |
| Template tab | Search pill, tabs, **template thumbnails stay white** on a dark page |
| Shop, Help | Cards, text, links |
| Settings tab | Rows, chevrons, icons, Appearance sheet, log-out row |
| Each settings screen (§2 list) | Switches (both states), sliders, number steppers, inputs, segmented controls |
| Printing history | List is dark, **label previews are white** |
| Editor | **White label**, black surroundings, rulers readable, grid, selection dash, handles + icons, lock badge, size HUD, top toolbar active and inactive icons, bottom tools sheet, editing pad, divider drag bar, more menu, grid popover, label size dialog, bulk nav, quick-value modal |
| Every element panel | Text, arc text, barcode, QR, image (+ crop), shape, line, table (+ size picker), time, degrees, serial, clipart, signature (**drawing board stays white**), border, reference image, multi-select. Colour swatches show a ring. |
| Font library | Font names readable, selected state visible |
| Print screen | Chrome dark, **preview white**, size selector, quality control, footer buttons. **Print one label in Light and one in Dark: the printouts must match, and the D9 hash in the log must be the same.** |
| Printer connect / diagnostics | Family cards (printer photos), device list, connection pill, battery, Bluetooth blocker sheet |
| New label / setup / template choice | Sheets, size fields, previews white |
| Shipping, jewellery, serial, customize | Editor UI dark, canvas white |
| Img-to-label, image crop, photo frames, print photo | Crop handles visible on the dark surroundings |
| Scan, OCR, ASR | Camera overlay, result panel, mic UI |
| Share | Dark scrim. **The shared image is white.** |
| PDF, PDF editor | Tools dark, **page white**, crop window, watermark and colour tools, print sheet |
| Data file, Excel screens | Table rows, headers, import options modal, kind icons |
| Alerts | In-app alert modal (with input), Android system `Alert.alert` |
| Switch live | Change the theme while on the editor and on the print screen. Nothing breaks and the canvas stays white. |

---

## 9. Tests planned for Stage 2

- `src/theme/__tests__/contrast.test.ts`: every dark text token ≥4.5 and every icon or border token ≥3.0 on `bg`, `surface` and `raised`.
- `src/theme/__tests__/no-hardcoded-colors.test.ts`: fails if a file on the converted list contains a hex, `rgb`, `'white'` or `'black'` (with an allow-list for `transparent` and fixed light-scope blocks).
- `src/theme/__tests__/print-safe.test.ts`: fails if a print-safe file imports `@/theme` or `useColorScheme`, or has a `<Text>` without a colour.
- Run the existing `test:phase4-stage-a` and `test:phase4-parity` before and after. They must match exactly (headless raster proof). The ViewShot path is checked on the phone with the D9 hash.
- Not touched: raster, border, print-origin and golden files. No Kotlin unless D5 picks the plugin route (flagged).

---

## 10. Stage 2 progress

| Group | Status |
|---|---|
| G0 tokens, provider, guards, Appearance row | done |
| G8 native (dark splash, nav bar via expo-navigation-bar; MainActivity forced-dark code removed) | done (needs rebuild) |
| G1 app shell | done |
| G2 tabs, G3 settings, G4a editor frame, G4b panels, G5 print + printers, G6 create flows, G7 files/data | done (bulk conversion, all screens) |
| G9 dev screens in `LightScope`, kill switch on (`THEME_DARK_READY = true`) | done |
| D9 print hash compare on the phone | waiting for your test |

### How it is built

- `makeStyles` hook for the small shared components (G1).
- `themedStyles` + `C` + `useThemeRefresh()` for the bulk screens (`src/theme/themed.ts`). Each component calls `useThemeRefresh()` first; styles resolve per scheme and respect `LightScope`.
- `// theme-fixed: <reason>` marks every colour that deliberately stays the same in both themes (label/print surfaces, camera UI, white icons on coloured buttons, ink and swatch values, product art).

### Guards (`npm run test:theme`)

- Dark contrast for every token pair (WCAG AA).
- No hard-coded colours, `Palette.*`, `accentStrong` or `HomeStatusColors` in 134 converted files, unless marked `theme-fixed`.
- Print-safe files never import the theme, directly **or through any import chain**.
- Every `<Text>` in print-safe files has an explicit colour.
- SHA-1 helper matches `node:crypto`.

### Light-mode colour shifts (D3)

1,224 of 2,088 mapped colours are exact. These 174 pairs shift slightly in light mode (computed by diffing the backups):

| Old light colour | New token (light value) | Files | Examples |
|---|---|---|---|
| `#06B6D4` | accent `#17A6B8` | 2 | app/edit.tsx, c/quality-control.tsx |
| `#0D9488` | accent `#17A6B8` | 1 | c/editor/image-property-panel.tsx |
| `#475569` | accent `#17A6B8` | 1 | c/pdf-editor/pdf-tool-panel.tsx |
| `#48C3C7` | accent `#17A6B8` | 3 | app/drawing-color.tsx, app/label-settings.tsx, c/settings-ui.tsx |
| `#64748B` | accent `#17A6B8` | 1 | c/printers/seznik-printer-grid.tsx |
| `#94A3B8` | accent `#17A6B8` | 1 | c/printers/seznik-printer-grid.tsx |
| `#B6E4EA` | accent `#17A6B8` | 1 | c/print-size-selector.tsx |
| `#E7F7F9` | accent `#17A6B8` | 4 | c/pdf-editor/pdf-color-tool.tsx, c/pdf-editor/pdf-rotate-tool.tsx, c/pdf-editor/pdf-scope-selector.tsx … |
| `#1EB8C8` | accentFill `#17A6B8` | 1 | app/(tabs)/template.tsx |
| `#20A4B8` | accentFill `#17A6B8` | 1 | app/photo-frames.tsx |
| `#94A3B8` | accentFill `#17A6B8` | 1 | c/printers/seznik-printer-grid.tsx |
| `#17A6B8` | accentSoft `rgba(23, 166, 184, 0.15)` | 4 | c/pdf-editor/pdf-color-tool.tsx, c/pdf-editor/pdf-rotate-tool.tsx, c/pdf-editor/pdf-scope-selector.tsx … |
| `#E6F6F8` | accentSoft `rgba(23, 166, 184, 0.15)` | 3 | app/printer-diagnostics.tsx, c/print-size-selector.tsx, c/printers/connect/bluetooth-blockers.tsx |
| `#E7F6F8` | accentSoft `rgba(23, 166, 184, 0.15)` | 1 | app/(tabs)/help.tsx |
| `#E7F7F9` | accentSoft `rgba(23, 166, 184, 0.15)` | 2 | c/pdf-editor/pdf-sharpness-tool.tsx, c/pdf-editor/pdf-watermark-tool.tsx |
| `#E8F6F8` | accentSoft `rgba(23, 166, 184, 0.15)` | 2 | c/home/buy-from-us-strip.tsx, c/printers/connect/connected-actions.tsx |
| `#EEF2FF` | accentSoft `rgba(23, 166, 184, 0.15)` | 5 | app/new-label-setup.tsx, app/pdf.tsx, c/label-size-editor.tsx … |
| `#EFF6FF` | accentSoft `rgba(23, 166, 184, 0.15)` | 4 | app/print-photo.tsx, app/shipping-label.tsx, c/shipping-editor/label-editor.tsx … |
| `#F0F9FF` | accentSoft `rgba(23, 166, 184, 0.15)` | 2 | app/scan.tsx, c/printers/seznik-printer-grid.tsx |
| `RGBA(23,166,184,0.12)` | accentSoft `rgba(23, 166, 184, 0.15)` | 1 | c/editor/grid-spacing-popover.tsx |
| `RGBA(23,166,184,0.35)` | accentSoft `rgba(23, 166, 184, 0.15)` | 1 | app/scan.tsx |
| `#94A3B8` | border `#CBD5E1` | 1 | app/new-label-setup.tsx |
| `#A4B0BC` | border `#CBD5E1` | 2 | app/print.tsx, c/pdf-editor/pdf-print-sheet.tsx |
| `#B7E3E8` | border `#CBD5E1` | 1 | app/(tabs)/help.tsx |
| `#B8C0C8` | border `#CBD5E1` | 2 | app/asr.tsx, app/ocr.tsx |
| `#B8E4EA` | border `#CBD5E1` | 1 | c/printers/connect/connected-actions.tsx |
| `#BAE6FD` | border `#CBD5E1` | 2 | app/scan.tsx, c/printers/seznik-printer-grid.tsx |
| `#BBE5CD` | border `#CBD5E1` | 2 | c/printers/connect/connected-actions.tsx, c/printers/connect/connection-hero.tsx |
| `#BBF7D0` | border `#CBD5E1` | 1 | app/serial-label.tsx |
| `#BFDBFE` | border `#CBD5E1` | 2 | app/print-photo.tsx, c/shipping-editor/label-editor.tsx |
| `#C5CED6` | border `#CBD5E1` | 1 | app/excel-bulk-setup.tsx |
| `#C6C6C8` | border `#CBD5E1` | 2 | app/edit.tsx, c/ui/ios-alert-modal.tsx |
| `#CCFBF1` | border `#CBD5E1` | 1 | c/editor/image-property-panel.tsx |
| `#D0D8E0` | border `#CBD5E1` | 1 | c/bulk-label-nav.tsx |
| `#D1D1D6` | border `#CBD5E1` | 2 | app/edit.tsx, c/editor/table-size-picker.tsx |
| `#D1D5DB` | border `#CBD5E1` | 18 | app/image-to-label.tsx, app/new-label-setup.tsx, app/print-photo.tsx … |
| `#D5DAE0` | border `#CBD5E1` | 1 | c/pdf-editor/pdf-print-sheet.tsx |
| `#D5DCE4` | border `#CBD5E1` | 1 | c/editor/editing-pad.tsx |
| `#D7DDE3` | border `#CBD5E1` | 1 | c/editor/border-property-panel.tsx |
| `#FDE68A` | border `#CBD5E1` | 1 | app/image-to-label.tsx |
| `#991B1B` | danger `#E84149` | 1 | c/pdf-editor/pdf-print-sheet.tsx |
| `#B91C1C` | danger `#E84149` | 1 | c/pdf-editor/pdf-print-sheet.tsx |
| `#DC2626` | danger `#E84149` | 9 | app/(tabs)/template.tsx, app/data-file.tsx, app/excel-data-preview.tsx … |
| `#E15B64` | danger `#E84149` | 1 | c/settings-ui.tsx |
| `#E25B5B` | danger `#E84149` | 1 | c/editor/border-property-panel.tsx |
| `#EF4444` | danger `#E84149` | 2 | app/serial-label.tsx, c/editor/barcode-property-panel.tsx |
| `#EF5350` | danger `#E84149` | 1 | c/settings-ui.tsx |
| `#FECACA` | danger `#E84149` | 1 | app/printer-diagnostics.tsx |
| `#FF3B30` | danger `#E84149` | 2 | c/printers/seznik-printer-grid.tsx, c/ui/ios-alert-modal.tsx |
| `#DC2626` | dangerFill `#E84149` | 1 | app/pdf.tsx |
| `#E11D48` | dangerFill `#E84149` | 2 | app/data-file.tsx, app/serial-label.tsx |
| `#FECACA` | dangerSoft `#FEE2E2` | 4 | app/data-file.tsx, c/pdf-editor/pdf-print-sheet.tsx, c/printers/connect/connected-actions.tsx … |
| `#FECDD3` | dangerSoft `#FEE2E2` | 1 | app/serial-label.tsx |
| `#FEF2F2` | dangerSoft `#FEE2E2` | 7 | app/(tabs)/template.tsx, app/data-file.tsx, app/printer-diagnostics.tsx … |
| `#FFF1F2` | dangerSoft `#FEE2E2` | 1 | app/serial-label.tsx |
| `#DCFCE7` | fill `#F5F7FA` | 1 | app/scan.tsx |
| `#E8F7F8` | fill `#F5F7FA` | 1 | c/settings/default-property-settings-fields.tsx |
| `#EEF8FA` | fill `#F5F7FA` | 1 | c/print-size-selector.tsx |
| `#EFF2F6` | fill `#F5F7FA` | 4 | c/label-size-dialog.tsx, c/pdf-editor/pdf-page-viewer.tsx, c/pdf-editor/pdf-sharpness-tool.tsx … |
| `#F0FDFA` | fill `#F5F7FA` | 1 | c/editor/image-property-panel.tsx |
| `#F1F5F9` | fill `#F5F7FA` | 14 | app/(tabs)/template.tsx, app/clipart.tsx, app/data-file.tsx … |
| `#F3F4F6` | fill `#F5F7FA` | 1 | c/pdf-editor/pdf-watermark-tool.tsx |
| `#F3F5F8` | fill `#F5F7FA` | 3 | app/excel-bulk-setup.tsx, app/font-library.tsx, c/excel-data-table.tsx |
| `#F4F5F7` | fill `#F5F7FA` | 3 | app/data-file.tsx, app/print-photo.tsx, app/print.tsx |
| `#F4F6F8` | fill `#F5F7FA` | 2 | app/clipart.tsx, app/font-library.tsx |
| `#F4F6F9` | fill `#F5F7FA` | 2 | app/image-to-label.tsx, app/img-to-label.tsx |
| `#F4FBF7` | fill `#F5F7FA` | 1 | c/printers/connect/connection-hero.tsx |
| `#F7F9FC` | fill `#F5F7FA` | 1 | c/print-size-selector.tsx |
| `#F8FAFC` | fill `#F5F7FA` | 26 | app/(tabs)/template.tsx, app/data-file.tsx, app/edit.tsx … |
| `#F9FAFB` | fill `#F5F7FA` | 1 | c/editor/image-property-panel.tsx |
| `#FAFCFD` | fill `#F5F7FA` | 1 | c/editor/barcode-property-panel.tsx |
| `#D7DDE3` | fillStrong `#EEF1F5` | 1 | c/editor/border-property-panel.tsx |
| `#D8DEE6` | fillStrong `#EEF1F5` | 1 | c/bulk-label-nav.tsx |
| `#DCE8F7` | fillStrong `#EEF1F5` | 1 | c/editor/editing-pad.tsx |
| `#E0F2FE` | fillStrong `#EEF1F5` | 1 | c/editor/text-property-panel.tsx |
| `#E0F7FA` | fillStrong `#EEF1F5` | 1 | app/scan.tsx |
| `#E2E8F0` | fillStrong `#EEF1F5` | 14 | app/data-file.tsx, app/pdf.tsx, app/print-photo.tsx … |
| `#E3E8EE` | fillStrong `#EEF1F5` | 1 | app/(tabs)/help.tsx |
| `#E4E9EE` | fillStrong `#EEF1F5` | 1 | c/bulk-label-nav.tsx |
| `#E5E7EB` | fillStrong `#EEF1F5` | 2 | app/print-photo.tsx, c/editor/image-property-panel.tsx |
| `#E8ECF1` | fillStrong `#EEF1F5` | 9 | app/border-library.tsx, c/editor/arctext-property-panel.tsx, c/editor/barcode-property-panel.tsx … |
| `#E9EDF3` | fillStrong `#EEF1F5` | 1 | c/home/sample-continue-card.tsx |
| `#ECEEF1` | fillStrong `#EEF1F5` | 1 | app/print.tsx |
| `#EEF2F6` | fillStrong `#EEF1F5` | 9 | app/font-library.tsx, app/new-label-setup.tsx, app/print.tsx … |
| `#C5E7EC` | hairline `#EAECEF` | 1 | c/home/buy-from-us-strip.tsx |
| `#CBD5E1` | hairline `#EAECEF` | 1 | c/editor/barcode-property-panel.tsx |
| `#D1D1D6` | hairline `#EAECEF` | 2 | c/editor/table-size-picker.tsx, c/ui/ios-alert-modal.tsx |
| `#D6DEE8` | hairline `#EAECEF` | 1 | c/print-size-selector.tsx |
| `#D7DEE6` | hairline `#EAECEF` | 1 | app/(tabs)/shop.tsx |
| `#D7DEE8` | hairline `#EAECEF` | 1 | app/font-library.tsx |
| `#D8DEE6` | hairline `#EAECEF` | 2 | app/column-name.tsx, c/editor/table-size-picker.tsx |
| `#E2E6EC` | hairline `#EAECEF` | 1 | app/(tabs)/template.tsx |
| `#E2E8F0` | hairline `#EAECEF` | 34 | app/edit.tsx, app/excel-data-preview.tsx, app/image-to-label.tsx … |
| `#E3E6EA` | hairline `#EAECEF` | 6 | app/new-label.tsx, app/print-photo-modal.tsx, app/share.tsx … |
| `#E3E7ED` | hairline `#EAECEF` | 2 | app/clipart.tsx, app/font-library.tsx |
| `#E3E8EE` | hairline `#EAECEF` | 2 | app/(tabs)/help.tsx, app/(tabs)/shop.tsx |
| `#E4E8ED` | hairline `#EAECEF` | 16 | app/(tabs)/setting.tsx, app/asr.tsx, app/print-photo.tsx … |
| `#E5E7EB` | hairline `#EAECEF` | 2 | c/editor/image-property-panel.tsx, c/editor/reference-image-panel.tsx |
| `#E8ECF0` | hairline `#EAECEF` | 1 | app/printing-history.tsx |
| `#ECEEF1` | hairline `#EAECEF` | 2 | app/print.tsx, c/pdf-editor/pdf-print-sheet.tsx |
| `#EEF2F6` | hairline `#EAECEF` | 1 | c/editor/image-property-panel.tsx |
| `#F1F5F9` | hairline `#EAECEF` | 1 | c/shipping-editor/label-editor.tsx |
| `#F3F4F6` | hairline `#EAECEF` | 1 | c/editor/image-property-panel.tsx |
| `#0274DF` | link `#007AFF` | 1 | app/print-photo.tsx |
| `#0284C7` | link `#007AFF` | 2 | app/print.tsx, app/scan.tsx |
| `#0369A1` | link `#007AFF` | 1 | c/editor/text-property-panel.tsx |
| `#2563EB` | link `#007AFF` | 5 | app/excel-data-preview.tsx, app/serial-label.tsx, app/shipping-label.tsx … |
| `RGBA(0,0,0,0.1)` | pressedOverlay `rgba(0, 0, 0, 0.06)` | 1 | c/editor/more-menu.tsx |
| `RGBA(0,0,0,0.35)` | scrim `rgba(0, 0, 0, 0.45)` | 2 | app/drawing-color.tsx, app/scan.tsx |
| `RGBA(0,0,0,0.38)` | scrim `rgba(0, 0, 0, 0.45)` | 2 | app/pdf.tsx, app/print.tsx |
| `RGBA(0,0,0,0.5)` | scrim `rgba(0, 0, 0, 0.45)` | 4 | app/(tabs)/template.tsx, app/data-file.tsx, app/jewellery-label.tsx … |
| `RGBA(0,0,0,0.55)` | scrim `rgba(0, 0, 0, 0.45)` | 1 | app/scan.tsx |
| `RGBA(0,0,0,0.65)` | scrim `rgba(0, 0, 0, 0.45)` | 1 | app/scan.tsx |
| `RGBA(15,23,42,0.28)` | scrim `rgba(0, 0, 0, 0.45)` | 2 | app/edit.tsx, c/editor/grid-spacing-popover.tsx |
| `RGBA(15,23,42,0.35)` | scrim `rgba(0, 0, 0, 0.45)` | 1 | app/label-settings.tsx |
| `RGBA(15,23,42,0.45)` | scrim `rgba(0, 0, 0, 0.45)` | 1 | c/printers/connect/bluetooth-blockers.tsx |
| `RGBA(20,30,42,0.5)` | scrim `rgba(0, 0, 0, 0.45)` | 1 | c/label-size-dialog.tsx |
| `#000000` | shadow `#0B1F33` | 11 | app/edit.tsx, app/pdf.tsx, app/print.tsx … |
| `#A3E635` | shadow `#0B1F33` | 1 | app/scan.tsx |
| `#10B981` | success `#18794A` | 3 | c/editor/barcode-property-panel.tsx, c/printers/seznik-printer-grid.tsx, c/shipping-editor/label-editor.tsx |
| `#16A34A` | success `#18794A` | 1 | app/scan.tsx |
| `#22C55E` | success `#18794A` | 1 | c/settings-ui.tsx |
| `#459E83` | success `#18794A` | 1 | c/settings-ui.tsx |
| `#10B981` | successFill `#2E9E63` | 1 | c/printers/seznik-printer-grid.tsx |
| `#16A34A` | successFill `#2E9E63` | 2 | app/data-file.tsx, app/serial-label.tsx |
| `#18794A` | successFill `#2E9E63` | 2 | c/printers/connect/connected-actions.tsx, c/printers/connect/connection-hero.tsx |
| `#5CB85C` | successFill `#2E9E63` | 1 | app/print.tsx |
| `#ECFDF5` | successSoft `#E8F6EE` | 1 | c/editor/barcode-property-panel.tsx |
| `#F0FDF4` | successSoft `#E8F6EE` | 1 | app/serial-label.tsx |
| `#000000` | text `#2C3E50` | 2 | app/edit.tsx, c/ui/ios-alert-modal.tsx |
| `#0F172A` | text `#2C3E50` | 10 | app/clipart.tsx, app/jewellery-label.tsx, app/print.tsx … |
| `#101419` | text `#2C3E50` | 1 | app/scan.tsx |
| `#111111` | text `#2C3E50` | 1 | c/editor/table-size-picker.tsx |
| `#111827` | text `#2C3E50` | 2 | c/editor/image-property-panel.tsx, c/editor/reference-image-panel.tsx |
| `#1C1C1E` | text `#2C3E50` | 1 | c/excel-import-options-modal.tsx |
| `#1E293B` | text `#2C3E50` | 14 | app/(tabs)/template.tsx, app/data-file.tsx, app/edit.tsx … |
| `#334155` | text `#2C3E50` | 1 | app/scan.tsx |
| `#94A3B8` | textDisabled `#A4B0BC` | 2 | c/editor/canvas-panel-divider.tsx, c/editor/editing-pad.tsx |
| `#B7C2CE` | textDisabled `#A4B0BC` | 1 | app/edit.tsx |
| `#B8C0C8` | textDisabled `#A4B0BC` | 9 | app/printing-history.tsx, c/editor/arctext-property-panel.tsx, c/editor/barcode-property-panel.tsx … |
| `#CBD3DC` | textDisabled `#A4B0BC` | 1 | c/home/sample-continue-card.tsx |
| `#CBD5E1` | textDisabled `#A4B0BC` | 7 | c/editor/barcode-property-panel.tsx, c/editor/degrees-property-panel.tsx, c/editor/image-crop-screen.tsx … |
| `#E2E8F0` | textDisabled `#A4B0BC` | 2 | app/printer-diagnostics.tsx, c/editor/image-crop-screen.tsx |
| `#F8FAFC` | textDisabled `#A4B0BC` | 1 | c/label-dimension-modal.tsx |
| `#17A6B8` | textMuted `#7E8B98` | 1 | c/printers/seznik-printer-grid.tsx |
| `#7A8490` | textMuted `#7E8B98` | 1 | app/print.tsx |
| `#7D7D7D` | textMuted `#7E8B98` | 1 | c/settings-ui.tsx |
| `#8A97A4` | textMuted `#7E8B98` | 15 | app/(tabs)/template.tsx, app/clipart.tsx, app/column-name.tsx … |
| `#8AA0AD` | textMuted `#7E8B98` | 1 | c/excel-kind-icons.tsx |
| `#8E8E93` | textMuted `#7E8B98` | 2 | c/excel-import-options-modal.tsx, c/ui/ios-alert-modal.tsx |
| `#8E97A1` | textMuted `#7E8B98` | 6 | app/(tabs)/template.tsx, app/data-file.tsx, app/new-label.tsx … |
| `#8EA9C2` | textMuted `#7E8B98` | 1 | app/photo-frames.tsx |
| `#94A3B8` | textMuted `#7E8B98` | 32 | app/(tabs)/template.tsx, app/clipart.tsx, app/data-file.tsx … |
| `#9AA3AD` | textMuted `#7E8B98` | 3 | app/clipart.tsx, app/font-library.tsx, app/print.tsx |
| `#9CA3AF` | textMuted `#7E8B98` | 2 | app/print.tsx, c/quality-control.tsx |
| `#9EAFC0` | textMuted `#7E8B98` | 1 | app/(tabs)/template.tsx |
| `#A0AEC0` | textMuted `#7E8B98` | 3 | app/column-name.tsx, c/editor/qrcode-property-panel.tsx, c/editor/table-property-panel.tsx |
| `#A4B0BC` | textMuted `#7E8B98` | 2 | app/asr.tsx, lib/ocr/c/ocr-result-panel.tsx |
| `#17A6B8` | textSecondary `#556473` | 2 | c/pdf-editor/pdf-tool-panel.tsx, c/printers/seznik-printer-grid.tsx |
| `#2C3E50` | textSecondary `#556473` | 17 | app/asr.tsx, app/column-name.tsx, app/print-photo-modal.tsx … |
| `#334155` | textSecondary `#556473` | 9 | app/data-file.tsx, app/excel-bulk-setup.tsx, app/jewellery-label.tsx … |
| `#374151` | textSecondary `#556473` | 1 | c/editor/image-property-panel.tsx |
| `#3C3C43` | textSecondary `#556473` | 1 | c/ui/ios-alert-modal.tsx |
| `#475569` | textSecondary `#556473` | 20 | app/edit.tsx, app/image-to-label.tsx, app/jewellery-label.tsx … |
| `#4B5563` | textSecondary `#556473` | 2 | app/(tabs)/help.tsx, c/editor/image-property-panel.tsx |
| `#5A6570` | textSecondary `#556473` | 1 | app/(tabs)/setting.tsx |
| `#5C6B78` | textSecondary `#556473` | 2 | app/(tabs)/help.tsx, app/(tabs)/shop.tsx |
| `#606F7B` | textSecondary `#556473` | 1 | app/(tabs)/template.tsx |
| `#64748B` | textSecondary `#556473` | 35 | app/(tabs)/template.tsx, app/clipart.tsx, app/data-file.tsx … |
| `#6B7280` | textSecondary `#556473` | 2 | c/editor/image-property-panel.tsx, c/editor/reference-image-panel.tsx |
| `#9A3412` | warning `#B45309` | 1 | app/printer-diagnostics.tsx |
| `#F59E0B` | warning `#B45309` | 3 | c/editor/barcode-property-panel.tsx, c/quality-control.tsx, c/shipping-editor/label-editor.tsx |
| `#FFF7ED` | warningSoft `#FEF3C7` | 1 | app/printer-diagnostics.tsx |
| `#FFFBEB` | warningSoft `#FEF3C7` | 1 | c/editor/barcode-property-panel.tsx |

### Not converted (on purpose)

- `_layout.tsx` crash screen (outside the theme provider), `themed-text` link colour, `app-tabs.web.tsx` (web), `animated-icon.tsx` (template, unused on Android).
- `clipart-tile` / `clipart-icon`: light tile with black clipart art (like a thumbnail).
- `skia-canvas.tsx` (dev prototype only).

### Backlog

- D8: `login.tsx`, `register.tsx`, `components/auth/auth-ui.tsx` (switched off, wrapped in `LightScope`). `logo.png` has no alpha and needs a dark variant.
- Pre-existing (verified by running): `npm run test:phase4-stage-a` fails with "editor parity failed: 2.79% differing". Same value before and after dark mode.
- Do not run `npm run test:phase4-parity` as a check: it rewrites `fixtures/phase4/parity/*`.
- Pre-existing (verified by running `tsc`): `print.tsx` uses an undefined `joshHeadlessMono` (JOSH fallback path will throw). There are also duplicate style keys in `help.tsx` and `shop.tsx`, and `edit.tsx` uses `clearGroupPreview` before it is declared.
- `AGENTS.md` points to the v57 docs but the project is on SDK 54. Should be updated.
