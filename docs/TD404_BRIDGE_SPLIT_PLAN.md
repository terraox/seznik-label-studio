# TD-404 Bridge Split: Tejas + Rudra

> Status: steps 2, 3, 4-partial, 5 DONE (2026-10-17). Rudra is a straight copy of Tejas for now. Step 4 (`td404-offsets.ts`) deferred until Rudra testing. Step 6 (device test) is next.
> Rudra has no SDK jar at all (the import was unused); fully independent of Tejas.

## Goal
One shared bridge (`td404-printer`) becomes two: **Tejas** (today's behaviour, untouched) and **Rudra** (new, own offsets). Dot logic stays the same. Only offsets differ.

---

## Steps (plain English)

1. **Freeze Tejas.** Commit current state so Tejas behaviour is saved and we can compare later.
2. **Rename the current bridge to Tejas.** Same code, new names. Nothing should change on the Tejas printer.
3. **Copy it to make Rudra.** Same code, Rudra names, start with the same offsets.
4. **Pull the offsets into one small file per printer.** So Rudra numbers live in one place and never touch Tejas.
5. **Make the app pick the right bridge.** Connect Tejas → Tejas bridge. Connect Rudra → Rudra bridge.
6. **Rebuild and test Tejas.** Must print exactly as before. Stop if not.
7. **Find Rudra offsets** with the calibration screens (left/right/top/bottom shift, border). Put the numbers in the Rudra offsets file.
8. **Test Rudra on the phone.** Then clean up docs.

---

## Technical detail

| # | Task | Where |
|---|------|-------|
| 1 | `git commit` baseline on `dev` (note: `bulk-labels.ts` is currently modified, commit or stash first) | repo |
| 2 | Rename folder `modules/td404-printer` → `modules/td404-tejas-printer`. Package name `td404-tejas-printer`. Expo `Name("Td404TejasPrinter")`. Kotlin package `expo.modules.td404tejasprinter`, class `Td404TejasPrinterModule`. Update `expo-module.config.json`, `package.json` (dependency + line ~153 plugin list), `build.gradle` namespace | `modules/`, root `package.json` |
| 3 | Copy to `modules/td404-rudra-printer` with the same renames (`Rudra`). **Risk:** both modules ship `labelprinter.jar/aar`, so duplicate classes will break the Android build. Docs say the SDK is "unused at print time", so drop the jar/aar from Rudra (or from both and keep one `compileOnly`). Verify by grepping the Kt for `com.` SDK imports | `modules/td404-rudra-printer` |
| 4 | New `src/lib/printer/td404-offsets.ts` exporting `TEJAS_OFFSETS` and `RUDRA_OFFSETS` (content shift dots, edge border, feed bake, gap). Move the hard-coded values out of `td404ContentShiftDots/Mm`, `td404EdgeBorderOptions`, `TD404_BORDER_GAP_MM` (`print-spec.ts`, `td404-job-params.ts`, `border-calibration.ts`). Look up by consumer id | `src/lib/printer/`, `src/printing/raster/` |
| 5 | `printer-manager.ts`: keep `usesTd404CommandSet` (shared logic), add `isTejas` / `isRudra` from the selected `ConsumerPrinterId` (already exists in `printer-models.ts`). Add a small `td404Bridge()` that returns the Tejas or Rudra module. Replace the 7 `from 'td404-printer'` imports (`print.tsx`, `location-dots.tsx`, `calibration-dots.tsx`, `ground-truth-parity.tsx`, etc.) with that. Keep `driverType: 'td404'` and `toDriverModel` so scan and connect stay the same. Keep transport `td404-spp` | `printer-manager.ts`, `src/app/*` |
| 6 | Full native rebuild (`npx expo run:android`). Print known-good Tejas labels. Compare to the step 1 baseline | device |
| 7 | Use `calibration-print.tsx` and `calibration-dots.tsx` on Rudra. Record offsets → `RUDRA_OFFSETS`. **Rebuild not needed** (JS only) | device |
| 8 | Update `PRINTER_BRIDGES.md`, `SDKS.md`, `PRINTER_ISSUE_REGISTER.md`. Delete the old `td404-printer` folder and its `android/build` leftovers | docs |

## Rules while doing this
- Tejas must be unchanged after step 6. Rudra work only starts after.
- Offsets live **only** in `td404-offsets.ts`. No printer-specific numbers inside shared code.
- Steps 2, 3, 5 need a **rebuild**. Step 4 and 7 are **refresh only**.
- Per memory: TD-404 position rewrite stages 5/6 stay on hold until the phone test confirms.

## Open question
- Does Rudra connect with a different BT name? (`supportedNames` has `RUDRA`.) If both advertise the same name, the user's choice on the connect screen decides the bridge.
