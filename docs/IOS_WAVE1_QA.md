# iOS Wave 1 QA checklist

Run on a physical iPhone with a **development** or **preview** EAS build (`npm run build:ios:dev` / `npm run build:ios`). Expo Go is not sufficient (native modules).

## Automated (CI / Windows OK)

```bash
npm run test:ios-wave1
```

Covers file-pick routing, iOS printer notices, OTP autofill contract, layout, printer-core, OCR, home tools.

## Manual device matrix (no print required for Wave 1 sign-off)

| Flow | Pass? |
|---|---|
| Theme → welcome → login/register (manual OTP; iOS SMS autofill if offered) | |
| Select printer (sees JOSH note for iPhone) | |
| Home tools: New Label, Serial, Shipping, Excel, Image, PDF, Import | |
| Editor: text, image, barcode, QR, undo/redo, save | |
| Templates / fonts / clipart | |
| Excel import via Files picker | |
| PDF editor open + page preview (`pdf-raster` iOS) | |
| OCR / scan / ASR permissions + basic success | |
| Settings → app permissions | |
| Connect printer screen shows iOS banner; JOSH scan/connect (Wave 2a) | |

## Print (Wave 2a — JOSH)

| Flow | Pass? |
|---|---|
| Scan finds JOSH | |
| Connect / disconnect / reconnect | |
| Print single PNG label from editor | |
| Gap / density settings affect output | |

## Still blocked

- TEJAS / RUDRA — need real Ninestar iOS SDK (`docs/TD404_IOS_SDK_REQUEST.md`)
- DEV / Veer — Android-only
