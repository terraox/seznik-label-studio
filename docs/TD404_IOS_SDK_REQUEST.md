# TD-404 / TEJAS / RUDRA — iOS SDK blocker

**Status:** Blocked. Cannot implement `modules/td404-*-printer` iOS until Ninestar ships a complete package.

## What we have today (unusable)

| Location | Problem |
|---|---|
| `TD 404IOSSDK/Print Label SDK-IOS/TplSdkTest/` | Only AppleDouble `._*` stubs (Mac resource forks). Zero real `.swift` / headers / frameworks. |
| Desktop `Print Label SDK-IOS/` | Same corrupt tree. |
| `TD-404 SDK (2).zip` → `Print Label SDK-IOS/` | Same stubs inside the archive. |
| `IOS Interface Documentation-EN.pdf` | Docs only — no binary to link. |

Magic on stub files: `00 05 16 07 … 4D 61 63 20 4F 53 20 58` (“Mac OS X” AppleDouble).

## What to request from Ninestar

Please re-send **Print Label SDK-IOS** as a complete archive that includes:

1. Real **BLE** print framework or static library (`.xcframework` preferred, or `.framework` / `.a` + headers).
2. Real demo app sources (`TplSdkTest` Swift/ObjC files — not `._ViewController.swift` sidecars).
3. Integration guide matching the Android `labelprinter` TSPL/BITMAP flow we use today.
4. Prefer zip created so Windows extraction keeps payload files (or deliver via Drive/WeTransfer).

## Intended app integration (after SDK arrives)

- Expo modules: `td404-tejas-printer` / `td404-rudra-printer` gain `ios/` native code.
- Same JS API as Android: `connectTd404`, `printTd404PngLabel`, status/disconnect events.
- Transport on iPhone: **BLE only** (classic SPP is not available without MFi).
- `capabilities.platforms` → `['android', 'ios']` in `src/printer-tejas`.
- Chunk writes (~500 bytes) + print progress UI.

Until then, iOS UI lists TEJAS/RUDRA as **coming soon**; **JOSH** is the supported iPhone printer path.
