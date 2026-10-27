import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { SettingsScreenShell } from '@/components/settings-ui';
import { helpTopic, type HelpBlock } from '@/lib/help/topics';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type Section = { heading: string | null; blocks: Exclude<HelpBlock, { type: 'heading' }>[] };

/** A heading starts a new section; anything before the first heading is the intro. */
function toSections(blocks: HelpBlock[]): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const block of blocks) {
    if (block.type === 'heading') {
      current = { heading: block.text, blocks: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: null, blocks: [] };
      sections.push(current);
    }
    current.blocks.push(block);
  }
  return sections;
}

/** "3. Design in the editor" -> number 3 and the title without it. */
function splitHeading(text: string): { no: string | null; title: string } {
  const m = /^(\d+)\.\s+(.*)$/.exec(text);
  return m ? { no: m[1], title: m[2] } : { no: null, title: text };
}

function Block({ block }: { block: Section['blocks'][number] }) {
  switch (block.type) {
    case 'text':
      return <Text style={styles.body}>{block.text}</Text>;
    case 'steps':
      return (
        <View>
          {block.items.map((item, i) => {
            const last = i === block.items.length - 1;
            return (
              <View key={item} style={styles.stepRow}>
                <View style={styles.rail}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>{i + 1}</Text>
                  </View>
                  {last ? null : <View style={styles.railLine} />}
                </View>
                <Text style={[styles.rowText, styles.stepText, last && styles.stepTextLast]}>{item}</Text>
              </View>
            );
          })}
        </View>
      );
    case 'bullets':
      return (
        <View style={styles.list}>
          {block.items.map((item) => (
            <View key={item} style={styles.row}>
              <View style={styles.check}>
                <AppIcon name="checkmark" tintColor={C.success} size={11} />
              </View>
              <Text style={styles.rowText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'tip':
      return (
        <View style={styles.tip}>
          <AppIcon name="info.circle" tintColor={C.onWarningSoft} size={18} />
          <View style={styles.tipCopy}>
            <Text style={styles.tipLabel}>Good to know</Text>
            <Text style={styles.tipText}>{block.text}</Text>
          </View>
        </View>
      );
  }
}

export default function HelpTopicScreen() {
  useThemeRefresh();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const topic = helpTopic(typeof id === 'string' ? id : undefined);
  const sections = useMemo(() => (topic ? toSections(topic.blocks) : []), [topic]);

  if (!topic) {
    return (
      <SettingsScreenShell title="Help">
        <Text style={styles.body}>This help page could not be found.</Text>
      </SettingsScreenShell>
    );
  }

  const sectionCount = sections.filter((section) => section.heading).length;

  return (
    <SettingsScreenShell title={topic.title}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <AppIcon name={topic.icon} tintColor={'#5CC4F0' /* theme-fixed: cyan icon on the navy hero */} size={26} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>
            {sectionCount > 0 ? `${sectionCount} ${sectionCount === 1 ? 'section' : 'sections'}` : 'Feature guide'}
          </Text>
          <Text style={styles.heroTitle}>{topic.title}</Text>
          <Text style={styles.heroSummary}>{topic.summary}</Text>
        </View>
      </View>

      {sections.map((section, i) => {
        const heading = section.heading ? splitHeading(section.heading) : null;
        return (
          <View key={i} style={styles.section}>
            {heading ? (
              <View style={styles.sectionHead}>
                {heading.no ? (
                  <View style={styles.sectionNo}>
                    <Text style={styles.sectionNoText}>{heading.no}</Text>
                  </View>
                ) : (
                  <View style={styles.sectionBar} />
                )}
                <Text style={styles.sectionTitle}>{heading.title}</Text>
              </View>
            ) : null}
            <View style={styles.sectionBody}>
              {section.blocks.map((block, j) => (
                <Block key={j} block={block} />
              ))}
            </View>
          </View>
        );
      })}
    </SettingsScreenShell>
  );
}

const styles = themedStyles((c, scheme) => ({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#2D3178', // theme-fixed: brand navy, same as the Home hero card
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(92,196,240,0.2)', // theme-fixed: icon tile on the navy hero
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1, gap: 2 },
  heroKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#5CC4F0', // theme-fixed: cyan kicker on the navy hero
  },
  heroTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3, color: c.onAccent },
  heroSummary: { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.86)' /* theme-fixed: summary on the navy hero */ },
  section: {
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderTopWidth: 3,
    borderTopColor: c.accent,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionNo: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: c.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionNoText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
  sectionBar: { width: 4, height: 22, borderRadius: 2, backgroundColor: c.accent },
  sectionTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: c.text },
  sectionBody: { gap: 12 },
  body: { fontSize: 14.5, lineHeight: 22, color: c.textSecondary },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowText: { flex: 1, fontSize: 14.5, lineHeight: 22, color: c.text },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepRow: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 26 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: c.accentInk, fontSize: 13, fontWeight: '800' },
  railLine: { flex: 1, width: 2, marginVertical: 3, borderRadius: 1, backgroundColor: c.hairline },
  stepText: { paddingTop: 2, paddingBottom: 14 },
  stepTextLast: { paddingBottom: 0 },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: c.warningSoft,
  },
  tipCopy: { flex: 1, gap: 2 },
  tipLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: c.onWarningSoft,
  },
  tipText: { fontSize: 14, lineHeight: 20, color: c.onWarningSoft },
}));
