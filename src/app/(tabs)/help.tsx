import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { HELP_TOPICS } from '@/lib/help/topics';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type HelpPane = 'tutorials' | 'features' | 'guides';

const PANES: { id: HelpPane; label: string }[] = [
  { id: 'tutorials', label: 'Tutorials' },
  { id: 'features', label: 'Features' },
  { id: 'guides', label: 'Guides' },
];

const TUTORIALS = [
  {
    id: 'first-label',
    minutes: '4 min',
    title: 'Print your first label',
    summary: 'From a blank canvas to a label in the printer.',
    icon: 'printer.fill' as const,
    steps: [
      'On Home, tap New Label, choose Blank label and pick a size or a preset.',
      'Tap Create Label, add text from the tool bar, then drag it into place. Pull a corner to resize.',
      'Tap Save, then Print. Set copies and tap Print.',
    ],
  },
  {
    id: 'connect',
    minutes: '3 min',
    title: 'Connect over Bluetooth',
    summary: 'Pair a Tejas, Rudra or Josh printer from the phone.',
    icon: 'antenna.radiowaves.left.and.right' as const,
    steps: [
      'Turn the printer on and keep it close.',
      'Tap the printer chip at the top of Home. Allow Bluetooth, Location and Nearby devices if the phone asks.',
      'Choose your printer. Green means ready to print. The app reconnects to your last printer when it opens.',
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
      'On Home, tap Excel, choose the label size, then pick your .xlsx or .csv file.',
      'Choose the sheet and the columns to include, then tap Confirm.',
      'In the editor, set text, QR or barcode fields to Data Source and pick the column. Each row prints as one label.',
    ],
  },
];

const GUIDES = [
  {
    title: 'Connect a printer',
    body: 'Tap the printer chip at the top of Home and choose your printer from the list. Sez Print works with the Tejas, Rudra and Josh printers. Red means not connected and green means ready. Allow Bluetooth, Location and Nearby devices when the phone asks; you can check them in Settings > App Permissions.',
  },
  {
    title: 'Design a label',
    body: 'Use New Label or a template, then add text, barcodes, QR codes, images, tables, lines, shapes, borders, clipart and signatures. Drag to move, pull a corner to resize, and use Undo and Redo if you miss a step. Save before leaving the editor. Open the New Label page under Features for the full walk-through.',
  },
  {
    title: 'Print',
    body: 'Open Print from the editor or Home. Set copies, print darkness, print speed, gap length, orientation and offsets, then tap Print. Labels bound to an Excel sheet print one label per row.',
  },
  {
    title: 'Images: B & W and Halftone',
    body: 'Select an image to choose its Color Mode. B & W is solid black and white, best for logos and text, and the Gray Threshold slider decides what turns black. Halftone makes the grays out of dots, best for photos. What you see on the canvas is what prints.',
  },
  {
    title: 'Stickers and clipart',
    body: 'Stickers are black-and-white shapes so they print cleanly on thermal labels. Open Clipart from the editor and tap a sticker to place it.',
  },
  {
    title: 'Scan and OCR',
    body: 'Scan reads a barcode or QR code with the camera. OCR reads text from a photo so you do not have to type it. Both are in the editor tool bar.',
  },
  {
    title: 'Templates',
    body: 'The Templates tab has ready-made label shapes and sizes. Tap one to open it in the editor, then change the text and print.',
  },
  {
    title: 'Settings and feedback',
    body: 'Settings has your printer, language, fonts, clipart, borders, data files, print history, appearance and the walkthrough. To send a suggestion or report a problem, use Settings > Suggestions & Complaints.',
  },
];

export default function HelpScreen() {
  useThemeRefresh();
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
          {PANES.map(({ id, label }) => {
            const active = pane === id;
            return (
              <Pressable
                key={id}
                onPress={() => setPane(id)}
                android_ripple={androidRipple}
                style={[styles.switchItem, active && styles.switchItemActive]}>
                <Text style={[styles.switchLabel, active && styles.switchLabelActive]}>{label}</Text>
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
                      tintColor={C.textMuted}
                      size={14}
                    />
                  </View>
                  {open ? (
                    <View style={styles.steps}>
                      {tutorial.steps.map((step, stepIndex) => (
                        <View key={step} style={styles.step}>
                          <View style={styles.stepDot}>
                            <AppIcon name={tutorial.icon} tintColor={C.accent} size={14} />
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
        ) : pane === 'features' ? (
          <View style={styles.stack}>
            <Text style={styles.lead}>One page for each part of the app. Tap a feature to read how it works.</Text>
            {HELP_TOPICS.map((topic) => (
              <Pressable
                key={topic.id}
                onPress={() => router.push({ pathname: '/help-topic', params: { id: topic.id } })}
                android_ripple={androidRipple}
                accessibilityRole="button"
                accessibilityLabel={`${topic.title}. ${topic.summary}`}
                style={styles.lesson}>
                <View style={styles.lessonTop}>
                  <View style={styles.lessonIndex}>
                    <AppIcon name={topic.icon} tintColor={C.onAccent} size={18} />
                  </View>
                  <View style={styles.lessonCopy}>
                    <Text style={styles.lessonTitle}>{topic.title}</Text>
                    <Text style={styles.lessonSummary}>{topic.summary}</Text>
                  </View>
                  <AppIcon name="chevron.right" tintColor={C.textMuted} size={14} />
                </View>
              </Pressable>
            ))}
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
                      tintColor={C.textMuted}
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

const styles = themedStyles((c, scheme) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    backgroundColor: c.header,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    paddingBottom: 12,
    justifyContent: 'flex-end',
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.62)', // theme-fixed: white text on the dark banner
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: c.onAccent,
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
    backgroundColor: c.fillStrong,
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
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textMuted,
  },
  switchLabelActive: {
    color: c.text,
  },
  stack: {
    gap: 10,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: c.textSecondary,
    marginBottom: 4,
  },
  lesson: {
    backgroundColor: c.surface,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    ...cardElevation(c, scheme),
  },
  lessonOpen: {
    borderWidth: 1,
    borderColor: c.border,
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
    backgroundColor: c.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonIndexText: {
    color: c.onAccent,
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
    color: c.accentInk,
  },
  lessonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
  },
  lessonSummary: {
    fontSize: 13,
    lineHeight: 18,
    color: c.textMuted,
  },
  steps: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
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
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: c.text,
    paddingTop: 3,
  },
  stepNo: {
    fontWeight: '700',
    color: c.brandInk,
  },
  guide: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    ...cardElevation(c, scheme),
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
    color: c.text,
  },
  guideBody: {
    fontSize: 14,
    lineHeight: 20,
    color: c.textSecondary,
  },
}));
