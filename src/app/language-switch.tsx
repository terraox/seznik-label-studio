import { useMemo } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsStackHeader } from '@/components/settings-stack-header';
import { INDIAN_LANGUAGES } from '@/constants/indian-languages';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings-store';
import { cardElevation, themedStyles, useThemeRefresh } from '@/theme';

export default function LanguageSwitchScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const selectedCode = useSettingsStore((s) => s.language);
  const setSelectedCode = useSettingsStore((s) => s.setLanguage);

  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);
  const selectedLanguage = useMemo(
    () => INDIAN_LANGUAGES.find((lang) => lang.code === selectedCode),
    [selectedCode]
  );

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Language Switch" />

      <View style={[styles.banner, { width: contentWidth }]}>
        <Text style={styles.bannerTitle}>Indian Language Package</Text>
        <Text style={styles.bannerSub}>
          {INDIAN_LANGUAGES.length} languages • {selectedLanguage?.name ?? 'English'} active
        </Text>
      </View>

      <FlatList
        data={INDIAN_LANGUAGES}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{
          paddingHorizontal: Spacing.three,
          paddingBottom: insets.bottom + Spacing.four,
          alignItems: 'center',
        }}
        renderItem={({ item }) => {
          const active = item.code === selectedCode;
          return (
            <Pressable
              onPress={() => setSelectedCode(item.code)}
              style={({ pressed }) => [
                styles.row,
                { width: contentWidth },
                active && styles.rowActive,
                pressed && styles.pressed,
              ]}>
              <View style={styles.rowMain}>
                <Text style={[styles.native, active && styles.nativeActive]}>{item.native}</Text>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.region}>{item.region}</Text>
              </View>
              {active ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
  },
  banner: {
    backgroundColor: c.surface,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    marginTop: Spacing.three,
    marginBottom: Spacing.two,
    ...cardElevation(c, scheme),
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: c.text,
  },
  bannerSub: {
    marginTop: 4,
    fontSize: 13,
    color: c.textMuted,
  },
  row: {
    backgroundColor: c.surface,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    marginBottom: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    ...cardElevation(c, scheme),
  },
  rowActive: {
    borderWidth: 1.5,
    borderColor: c.accent,
  },
  rowMain: {
    flex: 1,
  },
  native: {
    fontSize: 18,
    fontWeight: '500',
    color: c.text,
  },
  nativeActive: {
    color: c.accent,
  },
  name: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: c.textSecondary,
  },
  region: {
    marginTop: 2,
    fontSize: 12,
    color: c.textMuted,
  },
  check: {
    fontSize: 18,
    fontWeight: '500',
    color: c.accent,
    marginLeft: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
}));
