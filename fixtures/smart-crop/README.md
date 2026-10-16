# Smart Crop fixtures

**Never commit a PDF here.** `.gitignore` blocks `fixtures/smart-crop/*.pdf`.

Committed files are 100-DPI **grayscale PNGs** — the exact buffer the detector sees — named:

- `amazon-lr.png` — label left, invoice right
- `flipkart-tb.png` — bordered label box on top, invoice below
- `valmo-tb.png` — Valmo / Meesho, label on top, pale "TAX INVOICE" band, invoice below

Their test tolerances are **PROVISIONAL** until these files exist (see `SMART_CROP_PLAN.md` R2.7).

## Redaction (before the PDF ever reaches the app)

- Replace every name, address, phone number and order detail with a **same-length placeholder**
  (`XXXXXXXX` for `RAJESH K`), so block shapes, line lengths and spacing stay identical.
  The detector reads coverage and gap statistics; a shortened line changes them.
- Swap each barcode and QR code for a **dummy code of the same size**. Blanking a code removes
  the signal the default suggestion relies on.

## Producing a PNG

There is no node-side PDF renderer in this project, so the PNG is produced on device by the
Phase 1 dev probe:

1. Open the redacted PDF in the PDF editor in a dev build.
2. The probe logs `[smart-crop] fixture PNG: file:///…/smart-crop/page-1-100dpi-gray.png`.
3. Copy that file here under the names above.
4. **Open the PNG and check it visually for residual text** before `git add`.
