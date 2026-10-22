# Sez Print · Web Lab

A browser test bench for `.seznik` files. It reuses the app's own `src/lib/label-share` code (same validator, same exporter), so a file opened or exported here is checked exactly like on the phone.

```
cd web
npm install        # once (esbuild only)
npm start          # build + serve on http://localhost:5173   (PORT=… to change)
npm run dev        # same, rebuilding on save
npm run sample     # regenerate public/sample.seznik from the test fixtures
```

## What it does
- **Open** a `.seznik` (button, drag-and-drop, or `?open=sample.seznik`). A report shows the counts, missing items, palette/spreadsheet notes and the "Default font" limit.
- **Measurements:** rulers (mm / cm / in), scale bar, live cursor position, and for the selected element its position, size and the gaps to each label edge.
- **Scale:** zoom slider, Fit, and 1 : 1 real size (set *Screen ppi* to match your display), grid and snap.
- **Create elements:** Text, Barcode, QRCode, Image, Clipart (built-in id or your own SVG/picture), Line, Shapes, Table, Time, ArcText, Serial, Border, Signature. Excel, Scan, OCR, Line Emoji and Label Clone need the phone and are shown disabled.
- **Edit:** drag, corner-resize, arrow-nudge, undo/redo, layers (forward/backward, duplicate, delete), and a field editor generated from the import schema, plus a raw JSON editor for serial, table cells and signature strokes.
- **Export:** `.seznik` (built by the same code as the phone), SVG, and PNG at 152 / 203 / 300 dpi.

## Limits
This is a preview, not a print proof: positions, sizes and rotation are exact, but fonts, barcode text, image dithering and built-in clipart art are approximations (the clipart library lives in the phone app). Printer settings and spreadsheet data are never part of a file.

`?size=60x40&add=text,barcode,qrcode` starts a label with elements; `?selftest=1` exports the label, re-opens it and prints `SELFTEST OK` in the page.
