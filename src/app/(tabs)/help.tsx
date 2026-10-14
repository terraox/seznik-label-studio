import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple, cardShadow, Palette } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';

type HelpPane = 'tutorials' | 'guides';

const TUTORIALS = [
  {
    id: 'first-label',
    minutes: '4 min',
    title: 'Print your first label',
    summary: 'From a blank canvas to a label in the printer.',
    icon: 'printer.fill' as const,
    steps: [
      'On Home, tap New Label and pick a size.',
      'Add text, then drag it into place. Pull a corner to resize.',
      'Tap Save, then Print. Set copies and tap Print.',
    ],
  },
  {
    id: 'connect',
    minutes: '3 min',
    title: 'Connect over Bluetooth',
    summary: 'Pair a Seznik or ESC/POS printer from the phone.',
    icon: 'antenna.radiowaves.left.and.right' as const,
    steps: [
      'Turn the printer on and keep it close.',
      'Tap Unconnected on Home or Print, then scan.',
      'Choose your printer. Bluetooth needs a development build, not Expo Go.',
    ],
  },
  {
    id: 'barcode',
    minutes: '5 min',
    title: 'Barcode and QR',
    summary: 'Put a scannable code on the label and check it.',
    icon: 'barcode' as const,
    steps: [
      'Add a barcode or QR from the editor tools.',
      'Type the payload, or bind it to an Excel column.',
      'Print one sample and scan it before a long run.',
    ],
  },
  {
    id: 'excel',
    minutes: '6 min',
    title: 'One label per spreadsheet row',
    summary: 'Import a sheet and print a stack automatically.',
    icon: 'tablecells' as const,
    steps: [
      'Open Data File and import Excel or CSV.',
      'Bind text, QR, or barcode fields to column names.',
      'On Print, leave automatic pages on so each row is one label.',
    ],
  },
];

const GUIDES = [
  {
    title: 'Connect a printer',
    body: 'Tap Unconnected on Home or Print, then scan for Bluetooth printers. Generic ESC/POS thermal printers are supported. A development build is required — Bluetooth is not available in Expo Go.',
  },
  {
    title: 'Design a label',
    body: 'Use New Label or a template, then add text, barcodes, QR codes, tables, and black-and-white stickers. Drag to move, pull the corner to resize, and use Undo/Redo if you miss a step. Save before leaving the editor.',
  },
  {
    title: 'Print',
    body: 'Open Print from the editor or Home. Set copies, darkness, orientation, and offsets, then tap Print. Data-bound labels print one page per Excel row when automatic pages is on.',
  },
  {
    title: 'Import a Google Sheet',
    body: 'In Data File, tap Import, choose Google Drive (Sheets, Excel), and pick the Sheet. If it is greyed out or the download fails, open the Sheet in Google Sheets, tap File > Download > Microsoft Excel (.xlsx), then import that file from This Device.',
  },
  {
    title: 'Stickers and clipart',
    body: 'Stickers are black-and-white silhouettes so they print cleanly on thermal labels. Open Clipart from the editor and tap a sticker to place it.',
  },
  {
    title: 'Scan, OCR, and voice',
    body: 'Scan reads barcodes from the camera or a photo. OCR extracts text. ASR converts speech into label text. Full text recognition needs a development build.',
  },
];

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.four);
  const [pane, setPane] = useState<HelpPane>('tutorials');
  const [openTutorial, setOpenTutorial] = useState(TUTORIALS[0].id);
  const [openGuide, setOpenGuide] = useState<string | null>(GUIDES[0].title);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerKicker}>Sez Print</Text>
        <Text style={styles.headerTitle}>Help</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.switcher}>
          {(['tutorials', 'guides'] as const).map((id) => {
            const active = pane === id;
            return (
              <Pressable
                key={id}
                onPress={() => setPane(id)}
                android_ripple={androidRipple}
                style={[styles.switchItem, active && styles.switchItemActive]}>
                <Text style={[styles.switchLabel, active && styles.switchLabelActive]}>
                  {id === 'tutorials' ? 'Tutorials' : 'Guides'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {pane === 'tutorials' ? (
          <View style={styles.stack}>
            <Text style={styles.lead}>
              Short walks through the jobs people do most. Open one and follow the steps on the phone.
            </Text>
            {TUTORIALS.map((tutorial, index) => {
              const open = openTutorial === tutorial.id;
              return (
                <Pressable
                  key={tutorial.id}
                  onPress={() => setOpenTutorial(open ? '' : tutorial.id)}
                  android_ripple={androidRipple}
                  style={[styles.lesson, open && styles.lessonOpen]}>
                  <View style={styles.lessonTop}>
                    <View style={styles.lessonIndex}>
                      <Text style={styles.lessonIndexText}>{index + 1}</Text>
                    </View>
                    <View style={styles.lessonCopy}>
                      <Text style={styles.minutes}>{tutorial.minutes}</Text>
                      <Text style={styles.lessonTitle}>{tutorial.title}</Text>
                      <Text style={styles.lessonSummary}>{tutorial.summary}</Text>
                    </View>
                    <AppIcon
                      name={open ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'}
                      tintColor={Palette.muted}
                      size={14}
                    />
                  </View>
                  {open ? (
                    <View style={styles.steps}>
                      {tutorial.steps.map((step, stepIndex) => (
                        <View key={step} style={styles.step}>
                          <View style={styles.stepDot}>
                            <AppIcon name={tutorial.icon} tintColor={Palette.accent} size={14} />
                          </View>
                          <Text style={styles.stepText}>
                            <Text style={styles.stepNo}>{stepIndex + 1}. </Text>
                            {step}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.stack}>
            <Text style={styles.lead}>Reference notes for setup, editing, and print.</Text>
            {GUIDES.map((guide) => {
              const open = openGuide === guide.title;
              return (
                <Pressable
                  key={guide.title}
                  onPress={() => setOpenGuide(open ? null : guide.title)}
                  android_ripple={androidRipple}
                  style={styles.guide}>
                  <View style={styles.guideTop}>
                    <Text style={styles.guideTitle}>{guide.title}</Text>
                    <AppIcon
                      name={open ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'}
                      tintColor={Palette.muted}
                      size={14}
                    />
                  </View>
                  {open ? <Text style={styles.guideBody}>{guide.body}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: Palette.header,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    paddingBottom: 12,
    justifyContent: 'flex-end',
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  scroll: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  switcher: {
    flexDirection: 'row',
    backgroundColor: '#E3E8EE',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  switchItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 11,
  },
  switchItemActive: {
    backgroundColor: '#FFFFFF',
    ...cardShadow,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.muted,
  },
  switchLabelActive: {
    color: Palette.ink,
  },
  stack: {
    gap: 10,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: '#5C6B78',
    marginBottom: 4,
  },
  lesson: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    gap: 12,
    ...cardShadow,
  },
  lessonOpen: {
    borderWidth: 1,
    borderColor: '#B7E3E8',
  },
  lessonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lessonIndex: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Palette.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonIndexText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  lessonCopy: {
    flex: 1,
    gap: 2,
  },
  minutes: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#0E7C8A',
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.ink,
  },
  lessonSummary: {
    fontSize: 13,
    lineHeight: 18,
    color: Palette.muted,
  },
  steps: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E3E8EE',
  },
  step: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#E7F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.ink,
    paddingTop: 3,
  },
  stepNo: {
    fontWeight: '700',
    color: Palette.header,
  },
  guide: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    gap: 8,
    ...cardShadow,
  },
  guideTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guideTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Palette.ink,
  },
  guideBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4B5563',
  },
});
