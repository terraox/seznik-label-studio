import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { TextInput } from '@/components/ui/text-input';
import { ExpandBody, ExpandCard } from '@/components/ui/motion';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { HELP_TOPICS, type HelpTopic } from '@/lib/help/topics';
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

type Tutorial = (typeof TUTORIALS)[number];
type Guide = (typeof GUIDES)[number];

function TutorialCard({ tutorial, index, open, onToggle }: { tutorial: Tutorial; index: number; open: boolean; onToggle: () => void }) {
  return (
    <ExpandCard style={[styles.card, open && styles.cardOpen]}>
      <Pressable onPress={onToggle} android_ripple={androidRipple} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.cardTop}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberBadgeText}>{index + 1}</Text>
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{tutorial.title}</Text>
          <Text style={styles.cardSummary}>{tutorial.summary}</Text>
          <View style={styles.metaRow}>
            <AppIcon name="clock" tintColor={C.textMuted} size={12} />
            <Text style={styles.metaText}>{tutorial.minutes}</Text>
            <Text style={styles.metaText}>·</Text>
            <Text style={styles.metaText}>{tutorial.steps.length} steps</Text>
          </View>
        </View>
        <AppIcon name={open ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'} tintColor={C.textMuted} size={14} />
      </Pressable>
      {open ? (
        <ExpandBody style={styles.timeline}>
          {tutorial.steps.map((step, i) => {
            const last = i === tutorial.steps.length - 1;
            return (
              <View key={step} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={styles.timelineDot}>
                    <Text style={styles.timelineDotText}>{i + 1}</Text>
                  </View>
                  {last ? null : <View style={styles.timelineLine} />}
                </View>
                <Text style={[styles.timelineText, last && styles.timelineTextLast]}>{step}</Text>
              </View>
            );
          })}
        </ExpandBody>
      ) : null}
    </ExpandCard>
  );
}

function FeatureTile({ topic }: { topic: HelpTopic }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/help-topic', params: { id: topic.id } })}
      android_ripple={androidRipple}
      accessibilityRole="button"
      accessibilityLabel={`${topic.title}. ${topic.summary}`}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileIcon}>
        <AppIcon name={topic.icon} tintColor={C.accentInk} size={20} />
      </View>
      <Text numberOfLines={2} style={styles.tileTitle}>
        {topic.title}
      </Text>
      <Text numberOfLines={3} style={styles.tileSummary}>
        {topic.summary}
      </Text>
    </Pressable>
  );
}

function GuideRow({ guide, open, onToggle }: { guide: Guide; open: boolean; onToggle: () => void }) {
  return (
    <ExpandCard style={[styles.card, styles.guide, open && styles.cardOpen]}>
    <Pressable onPress={onToggle} android_ripple={androidRipple} accessibilityRole="button" accessibilityState={{ expanded: open }} style={styles.guidePress}>
      <View style={styles.guideTop}>
        <View style={[styles.guideBar, open && styles.guideBarOpen]} />
        <Text style={styles.guideTitle}>{guide.title}</Text>
        <AppIcon name={open ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'} tintColor={C.textMuted} size={14} />
      </View>
      {open ? <ExpandBody><Text style={styles.guideBody}>{guide.body}</Text></ExpandBody> : null}
    </Pressable>
    </ExpandCard>
  );
}

function SectionTitle({ children, count }: { children: string; count?: number }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {count !== undefined ? <Text style={styles.sectionCount}>{count}</Text> : null}
    </View>
  );
}

export default function HelpScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.four);
  const [pane, setPane] = useState<HelpPane>('tutorials');
  const [query, setQuery] = useState('');
  const [openTutorial, setOpenTutorial] = useState<string>(TUTORIALS[0].id);
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const has = (...parts: string[]) => parts.some((p) => p.toLowerCase().includes(q));
    return {
      tutorials: TUTORIALS.filter((t) => has(t.title, t.summary, ...t.steps)),
      topics: HELP_TOPICS.filter((t) => has(t.title, t.summary)),
      guides: GUIDES.filter((g) => has(g.title, g.body)),
    };
  }, [q]);
  const resultCount = results ? results.tutorials.length + results.topics.length + results.guides.length : 0;

  const counts: Record<HelpPane, number> = {
    tutorials: TUTORIALS.length,
    features: HELP_TOPICS.length,
    guides: GUIDES.length,
  };

  const renderTutorials = (list: Tutorial[]) =>
    list.map((tutorial) => (
      <TutorialCard
        key={tutorial.id}
        tutorial={tutorial}
        index={TUTORIALS.indexOf(tutorial)}
        open={openTutorial === tutorial.id || !!q}
        onToggle={() => setOpenTutorial(openTutorial === tutorial.id ? '' : tutorial.id)}
      />
    ));
  const renderTopics = (list: HelpTopic[]) => (
    <View style={styles.grid}>
      {list.map((topic) => (
        <FeatureTile key={topic.id} topic={topic} />
      ))}
    </View>
  );
  const renderGuides = (list: Guide[]) =>
    list.map((guide) => (
      <GuideRow
        key={guide.title}
        guide={guide}
        open={openGuide === guide.title || !!q}
        onToggle={() => setOpenGuide(openGuide === guide.title ? null : guide.title)}
      />
    ));

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <Text style={styles.headerKicker}>Sez Print</Text>
        <Text style={styles.headerTitle}>How can we help?</Text>
        <View style={styles.searchPill}>
          <AppIcon name="magnifyingglass" tintColor={C.onHeader} size={17} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tutorials, features and guides"
            placeholderTextColor="#8EA9C2" // theme-fixed: placeholder on the search pill
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {results ? (
          resultCount === 0 ? (
            <View style={styles.empty}>
              <AppIcon name="magnifyingglass" tintColor={C.textMuted} size={28} />
              <Text style={styles.emptyTitle}>Nothing found for “{query.trim()}”</Text>
              <Text style={styles.emptyText}>Try a shorter word, such as “print”, “barcode” or “Excel”.</Text>
            </View>
          ) : (
            <>
              {results.tutorials.length > 0 ? (
                <View style={styles.stack}>
                  <SectionTitle count={results.tutorials.length}>Tutorials</SectionTitle>
                  {renderTutorials(results.tutorials)}
                </View>
              ) : null}
              {results.topics.length > 0 ? (
                <View style={styles.stack}>
                  <SectionTitle count={results.topics.length}>Features</SectionTitle>
                  {renderTopics(results.topics)}
                </View>
              ) : null}
              {results.guides.length > 0 ? (
                <View style={styles.stack}>
                  <SectionTitle count={results.guides.length}>Guides</SectionTitle>
                  {renderGuides(results.guides)}
                </View>
              ) : null}
            </>
          )
        ) : (
          <>
            <View style={styles.switcher}>
              {PANES.map(({ id, label }) => {
                const active = pane === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setPane(id)}
                    android_ripple={androidRipple}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={[styles.switchItem, active && styles.switchItemActive]}>
                    <Text style={[styles.switchLabel, active && styles.switchLabelActive]}>
                      {label} <Text style={styles.switchCount}>{counts[id]}</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {pane === 'tutorials' ? (
              <View style={styles.stack}>
                <Text style={styles.lead}>Short walks through the jobs people do most. Open one and follow the steps on the phone.</Text>
                {renderTutorials(TUTORIALS)}
              </View>
            ) : pane === 'features' ? (
              <View style={styles.stack}>
                <Text style={styles.lead}>One page for each part of the app. Tap a feature to read how it works.</Text>
                {renderTopics(HELP_TOPICS)}
              </View>
            ) : (
              <View style={styles.stack}>
                <Text style={styles.lead}>Reference notes for setup, editing and print.</Text>
                {renderGuides(GUIDES)}
              </View>
            )}
          </>
        )}

        <View style={styles.footer}>
          <View style={styles.footerIcon}>
            <AppIcon name="questionmark.circle.fill" tintColor={C.accentInk} size={22} />
          </View>
          <View style={styles.footerCopy}>
            <Text style={styles.footerTitle}>Still stuck?</Text>
            <Text style={styles.footerText}>Send us a suggestion or report a problem from Settings &gt; Suggestions &amp; Complaints.</Text>
          </View>
        </View>
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
    paddingBottom: 14,
    gap: 2,
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
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  searchPill: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: scheme === 'light' ? '#3C6182' : c.fillStrong, // theme-fixed: light keeps the navy search pill
  },
  searchInput: {
    flex: 1,
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
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
    color: c.accentInk,
    fontWeight: '700',
  },
  switchCount: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textMuted,
  },
  stack: {
    gap: 10,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: c.textSecondary,
    marginBottom: 2,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: c.textSecondary,
  },
  sectionCount: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: c.accentInk,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 18,
    overflow: 'hidden',
    ...cardElevation(c, scheme),
  },
  cardOpen: {
    borderWidth: 1,
    borderColor: c.accent,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  numberBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '800',
  },
  cardCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
  },
  cardSummary: {
    fontSize: 13,
    lineHeight: 18,
    color: c.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: c.textMuted,
  },
  timeline: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  timelineRail: {
    alignItems: 'center',
    width: 26,
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotText: {
    fontSize: 13,
    fontWeight: '800',
    color: c.accentInk,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
    marginBottom: -12,
    borderRadius: 1,
    backgroundColor: c.hairline,
  },
  timelineText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: c.text,
    paddingTop: 3,
    paddingBottom: 4,
  },
  timelineTextLast: {
    paddingBottom: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 140,
    gap: 6,
    padding: 14,
    borderRadius: 18,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tileTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
  },
  tileSummary: {
    fontSize: 12.5,
    lineHeight: 17,
    color: c.textMuted,
  },
  pressed: {
    opacity: 0.85,
  },
  guide: {},
  guidePress: {
    padding: 14,
    gap: 10,
  },
  guideTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guideBar: {
    width: 4,
    alignSelf: 'stretch',
    minHeight: 20,
    borderRadius: 2,
    backgroundColor: c.hairline,
  },
  guideBarOpen: {
    backgroundColor: c.accent,
  },
  guideTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
  },
  guideBody: {
    fontSize: 14,
    lineHeight: 21,
    color: c.textSecondary,
    paddingLeft: 16,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: c.textMuted,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: c.accentSoft,
  },
  footerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerCopy: {
    flex: 1,
    gap: 2,
  },
  footerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
  },
  footerText: {
    fontSize: 13,
    lineHeight: 18,
    color: c.textSecondary,
  },
}));
