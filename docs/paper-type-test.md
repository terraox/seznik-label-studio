# Paper type test: Josh and TD-404

**Josh** has four options. **Label** is gap paper (`GAP_TYPE=2`). **Receipt** is continuous (`GAP_TYPE=0`, no gap length). **Transparent** uses the hole sensor (`GAP_TYPE=1`). **Cardstock** uses the black-mark sensor (`GAP_TYPE=3`). For Transparent and Cardstock, Gap Length is the hole or mark length.

**TD-404** has two options: Receipt (`GAP 0`) and Label (`GAP n mm`). A label saved as Transparent or Cardstock prints there as Label and its chip shows Label. Old labels saved as Black mark open as Label everywhere.

The commands below are what the app sends (from reading source). A row passes when the physical feed matches "Look for". Receipt, Transparent and Cardstock keep their **Test** badge until their rows pass.

This needs the native rebuild (Josh: no gap length for Receipt, Receipt copy pacing, gap report rows). Without it, Josh Receipt still sends `GAP_LENGTH=0`, and pauses between copies as if there were a 3 mm gap.

## Before you start

| Step | Do this | Pass |
| --- | --- | --- |
| 1 | Install the rebuilt app. | With Josh connected: Label, Receipt (Test), Transparent (Test), Cardstock (Test). With TD-404: Receipt (Test), Label. |
| 2 | Keep four rolls ready: die-cut label (gaps), receipt (no gaps, no marks), a roll with holes or notches, a black-mark roll (cardstock tags). | |
| 3 | Make or pick one label, 50 × 30 mm, with text or a barcode. Use it for every row. | |

Log tag for every print: `[PAPER-TYPE]`.

## Josh (DP27)

Connect only Josh. Open **Printing settings → Printer Diagnostics & Latency Log** first.

| Step | Do this | Look for | Result |
| --- | --- | --- | --- |
| J0 | Read the **Printer health** card. | Rows **Gap type**, **Gap length**, **Supported gap types** have values. The last row says whether Receipt 0 and Label 2 are listed. Log line: `[PAPER-TYPE] josh printer gapType=… gapLength=… supportedGapTypes=…`. Copy it here. | |
| J1 | Die-cut roll. Chip **Label**, Gap Length 3.00 mm. Print 1. | Log `josh Label GAP_TYPE=2 GAP_LENGTH=300`. Stops at the next gap. | |
| J2 | Same, copies 3. | Three labels, each on its own die-cut. Nothing walks across a gap. | |
| J3 | Receipt roll. Chip **Receipt**. Gap Length shows 0.00 mm and its buttons are off. Print 1. | Log `josh Receipt GAP_TYPE=0`, with no GAP_LENGTH. Native log `[…:GAP] GAP_NONE type=0 length not sent (continuous)`. Paper feeds about 30 mm and stops. It does not hunt for a gap. | |
| J4 | Same, copies 3. | About 90 mm of print, three 30 mm blocks, no blank stretch between them. Native log `paced …ms for next copy`. The pitch is about 640 ms at speed 3. | |
| J5 | Hole roll. Chip **Transparent**, Gap Length = the hole length. Print 1, then copies 3. | Log `josh Transparent GAP_TYPE=1 GAP_LENGTH=…`. Native log `GAP_HOLE type=1`. Each label starts at the next hole. If J0 does not list 1, write that down: the DP27 may ignore it. | |
| J6 | Black-mark roll. Chip **Cardstock**, Gap Length = the mark length. Print 1, then copies 3. | Log `josh Cardstock GAP_TYPE=3 GAP_LENGTH=…`. Native log `GAP_BLACK type=3`. Each label starts after the mark. If J0 does not list 3, write that down. | |

## TD-404

Disconnect Josh. Connect TD-404. TD-404 takes its paper type from the label (Label Settings → Paper Type).

| Step | Do this | Look for | Result |
| --- | --- | --- | --- |
| T1 | Die-cut roll. Label Settings → **Label**, Gap 3.0 mm. Print 1. | Log `td404 Label GAP 3.00 mm,0 mm`. Stops at the next gap. | |
| T2 | Same, copies 3. | Three labels, each on its own die-cut. | |
| T3 | Receipt roll. Label Settings → **Receipt**. Print 1. | Log `td404 Receipt GAP 0.00 mm,0 mm`. Feeds about 30 mm and stops. No gap seek. | |
| T4 | Same, copies 3. | About 90 mm, three 30 mm blocks. | |
| T5 | Open a label saved as Transparent or Cardstock on Josh. Label Settings with TD-404 connected. Print 1 on die-cut roll. | Chip shows **Label**. Log `td404 Transparent GAP 3.00 mm,0 mm` (or Cardstock). Feeds like T1. | |

## Old labels

| Step | Do this | Pass |
| --- | --- | --- |
| O1 | Open a label saved earlier as Black mark (or import an old .sezlabel / .seznik with Black mark). | Opens. Chip shows **Label**. No blank chip, no crash. |
| O2 | Export that label and open the file on another phone (or the web bench). | Paper reads Label. |

## How to score

| What happened | Write |
| --- | --- |
| Log line matches and the feed matches "Look for" | Pass |
| Log line matches but the printer skips, overlaps, jams or feeds blank | Fail: command ok, feed failed. Note which roll. |
| Log line does not match | Fail: wrong command. Copy the `[PAPER-TYPE]` line. |

## Fill-in

| Printer | Label ×1/×3 | Receipt ×1/×3 | Transparent ×1/×3 | Cardstock ×1/×3 | supportedGapTypes |
| --- | --- | --- | --- | --- | --- |
| Josh | | | | | |
| TD-404 | | | n/a (prints as Label, T5) | n/a (prints as Label, T5) | n/a |
