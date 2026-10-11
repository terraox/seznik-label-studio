import { StyleSheet, Text, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { cardShadow, Palette } from '@/constants/ui';

const ACTIONS: { icon: AppIconName; label: string }[] = [
  { icon: 'square.and.pencil', label: 'Edit' },
  { icon: 'printer', label: 'Print' },
  { icon: 'trash', label: 'Delete' },
  { icon: 'icloud.and.arrow.up', label: 'Upload' },
];

/**
 * Ghost version of ContinueCard, rendered only while the walkthrough runs and the
 * user has no labels yet, so the step has something real to point at.
 */
export function SampleContinueCard() {
  return (
    <View style={styles.card} pointerEvents="none">
      <View style={styles.headingBar}>
        <Text style={styles.title}>Sample label</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>SAMPLE</Text>
        </View>
      </View>
      <View style={styles.stage}>
        <View style={styles.label}>
          <View style={[styles.line, { width: '60%' }]} />
          <View style={[styles.line, { width: '40%' }]} />
          <View style={styles.qr} />
        </View>
      </View>
      <View style={styles.actionRow}>
        {ACTIONS.map((a) => (
          <View key={a.label} style={styles.action}>
            <AppIcon name={a.icon} tintColor={Palette.accent} size={23} />
            <Text style={styles.actionLabel}>{a.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Palette.accent,
    ...cardShadow,
  },
  headingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Palette.header,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
  },
  title: { color: '#FFFFFF', fontWeight: '600', fontSize: 14.5 },
  badge: {
    backgroundColor: Palette.accent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  stage: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9EDF3',
  },
  label: {
    width: 190,
    height: 84,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 10,
    gap: 8,
  },
  line: { height: 8, borderRadius: 4, backgroundColor: '#CBD3DC' },
  qr: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 34,
    height: 34,
    borderRadius: 3,
    backgroundColor: '#CBD3DC',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionLabel: { fontSize: 12.5, fontWeight: '500', color: Palette.actionText },
});
