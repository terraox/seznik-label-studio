# Home Screen Redesign

## Layout revision (supersedes chip-row decision)

The home body is a single-screen layout (no scroll on a typical ~360×740dp phone at default font size). ScrollView remains as a safety net for small phones / large fonts only.

### Order (top → bottom)

1. **New Label** — one broad white hero card with a large teal icon tile on the left, title, and description. No section heading. Route `/new-label`.
2. **Last edited label** — WePrint-style card (name, size, large preview, Edit/Print/Delete/Share/Upload), hidden when there are no labels.
3. **Print from file** — Excel, PDF (`/pdf`), Photo — 3 equal tiles.
4. **More ways to create** — Scan Label, Serial Labels, Custom Size — 3 equal tiles.
5. **Label types** — 2-Up Label, Shipping, Jewellery, Fit Image — one row of 4 equal tiles.
6. **Buy from us** — taller moving promo strip at the bottom; opens Shop tab.

All tiles in rows 2–4 share the same card style.
x
### Where every item ends up

| Item | Route | Location |
|------|-------|----------|
| New Label | `/new-label` | Broad hero (large left icon) |
| Scan Label | `/scan` | More ways to create |
| Serial Labels | `/serial-label` | More ways to create |
| Custom Size | `/customize-template` | More ways to create |
| Excel | `/excel-print` | Print from file |
| PDF | `/pdf` | Print from file (unchanged) |
| Photo | `/print-photo-modal` | Print from file |
| 2-Up Label | `/new-label-setup?isTwoUps=true` | Label types |
| Shipping | `/shipping-label` | Label types |
| Jewellery | `/jewellery-label` | Label types |
| Fit Image | `/img-to-label` | Label types |
| Edit / Print / Share / Upload / Delete | as before | Continue strip (+ ⋯ overflow) |
| Connection status | `/printer-connect` | Header chip |

### Height budget (HomeLayout)

At default font scale, excluding tab-bar padding:

- `contentPadTop` 16 + `heroHeight` 64
- 3 × (`sectionHeadingBlock` 24 + `tileHeight` 80) for Print + More ways; Label types uses `labelTypeTileHeight` 72
- `continueHeight` 72 when labels exist
- 4 × `sectionGap` 16 between blocks

**Total with Continue: 520dp. Without Continue: 432dp.** Assumed content viewport ≈ **560dp** on a 360×740 phone (after header + tab bar).

### User device check

- [ ] Fits one screen on a typical phone (~360×740) at default font size
- [ ] Scroll only appears with large fonts / short viewports
- [ ] All 11 tools still open the correct routes
- [ ] Continue strip Edit / Print / ⋯ behave as before
- [ ] Print PDF still opens `/pdf`
