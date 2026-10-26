import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { SettingsScreenShell } from '@/components/settings-ui';
import { helpTopic, type HelpBlock } from '@/lib/help/topics';
import { C, themedStyles, useThemeRefresh } from '@/theme';

function Block({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'heading':
      return <Text style={styles.heading}>{block.text}</Text>;
    case 'text':
      return <Text style={styles.body}>{block.text}</Text>;
    case 'steps':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={item} style={styles.row}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{i + 1}</Text>
              </View>
              <Text style={styles.rowText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'bullets':
      return (
        <View style={styles.list}>
          {block.items.map((item) => (
            <View key={item} style={styles.row}>
              <View style={styles.dot} />
              <Text style={styles.rowText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'tip':
      return (
        <View style={styles.tip}>
          <AppIcon name="questionmark.circle.fill" tintColor={C.accentInk} size={18} />
          <Text style={styles.tipText}>{block.text}</Text>
        </View>
      );
  }
}

export default function HelpTopicScreen() {
  useThemeRefresh();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const topic = helpTopic(typeof id === 'string' ? id : undefined);

  if (!topic) {
    return (
      <SettingsScreenShell title="Help">
        <Text style={styles.body}>This help page could not be found.</Text>
      </SettingsScreenShell>
    );
  }

  return (
    <SettingsScreenShell title={topic.title}>
      <Text style={styles.summary}>{topic.summary}</Text>
      {topic.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </SettingsScreenShell>
  );
}

const styles = themedStyles((c) => ({
  summary: { fontSize: 15, lineHeight: 22, color: c.textSecondary },
  heading: { fontSize: 17, fontWeight: '700', color: c.text, marginTop: 6 },
  body: { fontSize: 14, lineHeight: 21, color: c.text },
  list: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowText: { flex: 1, fontSize: 14, lineHeight: 21, color: c.text },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.header,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  badgeText: { color: c.onAccent, fontSize: 12, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent, marginTop: 8, marginHorizontal: 9 },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: c.accentFill,
    borderRadius: 14,
    padding: 12,
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19, color: c.text },
}));
