# Paper type test — Josh and TD-404

Run this on the phone. Do Josh first, then TD-404. Use the roll named in each row. One printer connected at a time.

Commands below are what the app sends (from reading source). A pass is the physical feed matching the “Look for” column. Receipt and Black mark stay unconfirmed until your roll shows that feed.

Josh and TD-404 paper-type commands reload with Metro. The Josh line `printer gapType=… supportedGapTypes=…` appears only after a native rebuild. You can still run every print below without that rebuild.

There is no Receipt ×3 or Label ×3 button yet. Each diagnostics button prints one 50×30 mm label with a 3 mm gap.

## Before you start

| Step | Do this | Pass |
| --- | --- | --- |
| 1 | Reload the app in Metro so the print screen and diagnostics screen are current. | Print screen shows chips: Receipt, Label, Cardstock, Transparent, Black mark. |
| 2 | Connect **only Josh**. Leave TD-404 off or disconnected. | Diagnostics says the printer is linked. |
| 3 | Open **Printing settings → Printer Diagnostics & Latency Log**. | A card titled **Paper type test** is on the screen. |
| 4 | Keep five rolls ready: die-cut label, receipt (no gaps), cardstock, transparent, black mark. | You can swap rolls between rows. |

Repeat steps 2–3 with **only TD-404** after the Josh table is filled in.

## Where the words are

| Place | What you use it for |
| --- | --- |
| Diagnostics → Paper type test | One **Print** button per type. The grey line under the name is the exact command. Log tag: `[PAPER-TYPE-SHEET]`. |
| Print screen → Paper Type chips | A real label you already made. Log tag: `[PAPER-TYPE]`. |
| Gap Length stepper | Liner between die-cuts, in millimetres. Receipt locks this at 0.00 mm. The label stays **Gap Length** for every chip, including Black mark. |

Photograph the whole label, the gap or black mark that passed the sensor, and the next label if the printer skipped or fed extra. Note a jam, a blank label, or a skip.

## Part A — Diagnostics sheet

Load the roll, tap the button, read the grey command line, then write Pass or Fail.

### Josh

| Step | Roll in the printer | Button | Command on screen | Look for | Result |
| --- | --- | --- | --- | --- | --- |
| A1 | Die-cut label (gaps) | Print Label | `GAP_TYPE=2 GAP_LENGTH=300` | One label. Stops at the next gap. Ink is not cut off and the next label is not eaten. | |
| A2 | Receipt / continuous (no gaps, no marks) | Print Receipt | `GAP_TYPE=0 GAP_LENGTH=0` | Feeds the 30 mm height and stops. It does not hunt for a gap. Badge on the chip says Test. Unconfirmed until this roll does that. | |
| A3 | Black-mark roll (mark on the liner or back) | Print Black mark | `GAP_TYPE=3 GAP_LENGTH=300` | Starts after the mark. One label. Sensor may mis-feed; if it skips or prints on the mark, write that down. Unconfirmed until this roll does it. | |
| A4 | Cardstock | Print Cardstock | `GAP_TYPE=2 GAP_LENGTH=300` | Same command as Label. Stops on the next gap if this stock has gaps. Cardstock is not its own sensor. | |
| A5 | Transparent | Print Transparent | `GAP_TYPE=2 GAP_LENGTH=300` | Same command as Label. Stops on the next gap. The picture may look lighter on clear stock. Positions match the Label print from A1. | |

Josh only: under the title, a line like `printer gapType=… gapLength=… supportedGapTypes=…` means the native gap report is in this build. If that line stays as the placeholder `printer gapType=… supportedGapTypes=…`, the prints above are still valid. The report needs the native rebuild.

### TD-404

Disconnect Josh. Connect TD-404. Open the same diagnostics card.

| Step | Roll in the printer | Button | Command on screen | Look for | Result |
| --- | --- | --- | --- | --- | --- |
| B1 | Die-cut label (gaps) | Print Label | `GAP 3.00 mm,0 mm` | One label. Stops at the next gap. | |
| B2 | Receipt / continuous | Print Receipt | `GAP 0.00 mm,0 mm` | Feeds the 30 mm height and stops. No gap seek. Unconfirmed until this roll does that. | |
| B3 | Black-mark roll | Print Black mark | `BLINE 3.00 mm,0 mm` | Starts after the mark. One label. Write down a skip, a jam, or a print on the mark. Unconfirmed until this roll does it. | |
| B4 | Cardstock | Print Cardstock | `GAP 3.00 mm,0 mm` | Same command as Label. Not its own sensor. | |
| B5 | Transparent | Print Transparent | `GAP 3.00 mm,0 mm` | Same command as Label. Stops on the next gap. Compare position to B1. | |

## Part C — Same label, both printers

Use one saved label that already has text or a barcode, about the size of the roll. Do not change the design between printers. On the print screen, set **Paper Type**, leave **Gap Length** at 3.00 mm except where the table says otherwise, then print.

Do C1–C5 on Josh. Then connect TD-404 and do C6–C10 with the same label and the same chip.

| Step | Printer | Roll | Chip | Gap Length | Log line `[PAPER-TYPE]` | Look for | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | Josh | Die-cut label | Label | 3.00 mm | `josh Label GAP_TYPE=2 GAP_LENGTH=300` | Stops on the next gap. This is the reference for position. | |
| C2 | Josh | Receipt | Receipt | Locked at 0.00 mm. Stepper does not move. | `josh Receipt GAP_TYPE=0 GAP_LENGTH=0` | Continuous feed. Caption: “Test. Continuous feed. Gap length is 0 mm.” | |
| C3 | Josh | Black mark | Black mark | 3.00 mm | `josh Black mark GAP_TYPE=3 GAP_LENGTH=350` if you set 3.50 mm, otherwise `GAP_LENGTH=300` at 3.00 mm | Starts after the mark. Caption: “Test. Uses the black-mark sensor.” | |
| C4 | Josh | Cardstock | Cardstock | 3.00 mm | `josh Cardstock GAP_TYPE=2 GAP_LENGTH=300` | Caption: “Same gap as Label.” Feed matches C1. | |
| C5 | Josh | Transparent | Transparent | 3.00 mm | `josh Transparent GAP_TYPE=2 GAP_LENGTH=300` | Caption: “Same gap as Label.” Edges and text sit where they sat in C1. Clear stock can look lighter. | |
| C6 | TD-404 | Die-cut label | Label | 3.00 mm | `td404 Label GAP 3.00 mm,0 mm` | Stops on the next gap. Reference print for TD-404. | |
| C7 | TD-404 | Receipt | Receipt | Locked at 0.00 mm | `td404 Receipt GAP 0.00 mm,0 mm` | Continuous feed. No gap seek. | |
| C8 | TD-404 | Black mark | Black mark | 3.00 mm | `td404 Black mark BLINE 3.00 mm,0 mm` | Starts after the mark. | |
| C9 | TD-404 | Cardstock | Cardstock | 3.00 mm | `td404 Cardstock GAP 3.00 mm,0 mm` | Same feed as C6. | |
| C10 | TD-404 | Transparent | Transparent | 3.00 mm | `td404 Transparent GAP 3.00 mm,0 mm` | Same feed as C6. Position matches C6. | |

If you change Gap Length to 3.50 mm on Label, Cardstock, Transparent, or Black mark, Josh `GAP_LENGTH` becomes `350` and TD-404 shows `3.50`. Receipt stays `0` no matter what was saved before.

## Part D — Checks that should not change the picture

| Step | Do this | Pass |
| --- | --- | --- |
| D1 | Print the same label on Josh as Label, then as Cardstock, then as Transparent, on gap stock (or compare C1, C4, C5). | Text and barcode sit in the same place. Only the stock looks different. |
| D2 | Repeat D1 on TD-404 (C6, C9, C10). | Same positions. |
| D3 | Name a label “black mark sample” but leave the chip on Label. Print on Josh and on TD-404. | Josh stays `GAP_TYPE=2`. TD-404 stays `GAP 3.00 mm,0 mm`. The name does not switch the sensor. |
| D4 | Open an old saved label that has no paper type stored. | The chip shows Label. It is not rewritten to another type. |

## How to score a row

| What happened | Write |
| --- | --- |
| Command line matches the table and the feed matches “Look for” | Pass |
| Command line matches but the printer skips, overlaps, jams, or feeds a blank | Fail — command ok, feed failed. Note which roll. |
| Command line does not match the table | Fail — wrong command. Copy the `[PAPER-TYPE]` or `[PAPER-TYPE-SHEET]` line. |
| Receipt or Black mark feed is wrong on the real roll | Fail for that printer. Leave it as unconfirmed. Do not treat Cardstock or Transparent as a sensor failure when their command matches Label. |

## Fill-in

| Printer | Label | Receipt | Black mark | Cardstock | Transparent |
| --- | --- | --- | --- | --- | --- |
| Josh diagnostics (A) | | | | | |
| TD-404 diagnostics (B) | | | | | |
| Josh real label (C1–C5) | | | | | |
| TD-404 real label (C6–C10) | | | | | |
