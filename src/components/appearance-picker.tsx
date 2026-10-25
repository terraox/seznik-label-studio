import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { androidRipple } from '@/constants/ui';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import {
  cardElevation,
  makeStyles,
  useColors,
  type AppearancePreference,
} from '@/theme';

const OPTIONS: { value: AppearancePreference; key: TranslationKey }[] = [
  { value: 'system', key: 'setting.appearanceSystem' },
  { value: 'light', key: 'setting.appearanceLight' },
  { value: 'dark', key: 'setting.appearanceDark' },
];

function ScreenChrome({ tone }: { tone: 'light' | 'dark' }) {
  const styles = useStyles();
  const light = tone === 'light';
  return (
    <View style={styles.chrome}>
      <View
        style={[
          styles.chromeBar,
          styles.chromeBarTop,
          light ? styles.chromeLight : styles.chromeDark,
        ]}
      />
      <View
        style={[
          styles.chromeBar,
          styles.chromeBarBody,
          light ? styles.chromeLightSoft : styles.chromeDarkSoft,
        ]}
      />
    </View>
  );
}

/**
 * Top of a Samsung / generic phone only — cropped by the tile so it peeks
 * up from the bottom edge (matches the reference; not a full device).
 */
function PeekPhone({ mode }: { mode: AppearancePreference }) {
  const styles = useStyles();

  return (
    <View style={styles.phone}>
      {mode === 'system' ? (
        <View style={styles.screenSplit}>
          <View style={[styles.screenHalf, styles.screenLight]}>
            <ScreenChrome tone="light" />
          </View>
          <View style={[styles.screenHalf, styles.screenDark]}>
            <ScreenChrome tone="dark" />
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.screenFull,
            mode === 'light' ? styles.screenLight : styles.screenDark,
          ]}>
          <ScreenChrome tone={mode} />
        </View>
      )}
      {/* Centered hole-punch (not Dynamic Island) */}
      <View style={styles.punch} />
    </View>
  );
}

function TileFill({ mode }: { mode: AppearancePreference }) {
  const styles = useStyles();
  if (mode === 'system') {
    return (
      <View style={styles.fillSplit} pointerEvents="none">
        <View style={[styles.fillHalf, styles.fillLight]} />
        <View style={[styles.fillHalf, styles.fillDark]} />
      </View>
    );
  }
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        mode === 'light' ? styles.fillLight : styles.fillDark,
      ]}
    />
  );
}

export function AppearancePicker({
  value,
  onChange,
}: {
  value: AppearancePreference;
  onChange: (next: AppearancePreference) => void;
}) {
  const styles = useStyles();
  const c = useColors();
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      {OPTIONS.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t(opt.key)}
            onPress={() => onChange(opt.value)}
            android_ripple={androidRipple}
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
            <View style={[styles.tile, selected && styles.tileSelected]}>
              <TileFill mode={opt.value} />
              <View style={styles.phoneSlot} pointerEvents="none">
                <PeekPhone mode={opt.value} />
              </View>
              {selected ? (
                <View style={styles.checkBadge}>
                  <AppIcon
                    name="checkmark"
                    tintColor={c.onAccent}
                    size={12}
                    weight="semibold"
                  />
                </View>
              ) : null}
            </View>
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}>
              {t(opt.key)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Phone is taller than the visible tile so the bottom is clipped. */
const PHONE_W = 64;
const PHONE_H = 110;
const PHONE_R = 14;
const SCREEN_INSET = 3;
const SCREEN_R = 11;
const PUNCH = 8;

const useStyles = makeStyles((c, scheme) => ({
  card: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 12,
    gap: 10,
    ...cardElevation(c, scheme),
  },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  optionPressed: {
    opacity: 0.88,
  },
  tile: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 108,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  tileSelected: {
    borderColor: c.accent,
  },
  fillSplit: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  fillHalf: {
    flex: 1,
  },
  fillLight: {
    backgroundColor: '#E5E5EA', // theme-fixed: light tile fill
  },
  fillDark: {
    backgroundColor: '#3A3A3C', // theme-fixed: dark tile fill
  },
  /** Full-width slot so the phone can sit centered while hanging off the bottom. */
  phoneSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -40,
    height: PHONE_H,
    alignItems: 'center',
  },
  /** Top peeks into the tile; bottom is cropped by tile overflow. */
  phone: {
    width: PHONE_W,
    height: PHONE_H,
    borderRadius: PHONE_R,
    backgroundColor: '#111111', // theme-fixed: device bezel
    padding: SCREEN_INSET,
    overflow: 'hidden',
  },
  screenFull: {
    flex: 1,
    borderRadius: SCREEN_R,
    overflow: 'hidden',
  },
  screenSplit: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: SCREEN_R,
    overflow: 'hidden',
  },
  screenHalf: {
    flex: 1,
  },
  screenLight: {
    backgroundColor: '#FFFFFF', // theme-fixed: light screen
  },
  screenDark: {
    backgroundColor: '#1C1C1E', // theme-fixed: dark screen
  },
  punch: {
    position: 'absolute',
    top: 10,
    left: (PHONE_W - PUNCH) / 2,
    width: PUNCH,
    height: PUNCH,
    borderRadius: PUNCH / 2,
    backgroundColor: '#000000', // theme-fixed: hole-punch camera
    zIndex: 2,
  },
  chrome: {
    paddingTop: 22,
    paddingHorizontal: 7,
    gap: 6,
  },
  chromeBar: {
    borderRadius: 5,
  },
  chromeBarTop: {
    height: 8,
    width: '100%',
  },
  chromeBarBody: {
    height: 36,
    width: '100%',
  },
  chromeLight: {
    backgroundColor: '#D1D1D6', // theme-fixed: light chrome
  },
  chromeLightSoft: {
    backgroundColor: '#E5E5EA', // theme-fixed: light chrome soft
  },
  chromeDark: {
    backgroundColor: '#48484A', // theme-fixed: dark chrome
  },
  chromeDarkSoft: {
    backgroundColor: '#2C2C2E', // theme-fixed: dark chrome soft
  },
  checkBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: c.textMuted,
    textAlign: 'center',
  },
  labelSelected: {
    color: c.text,
    fontWeight: '600',
  },
}));
