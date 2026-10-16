import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ui/action-sheet';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { copyImportIntoSezprint } from '@/lib/user-files/root';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
import { usePrintHistoryStore } from '@/stores/print-history-store';
import { printCounts, usePrintStatsStore } from '@/stores/print-stats-store';
import { useSettingsStore } from '@/stores/settings-store';
import {
  THEME_DARK_READY,
  cardElevation,
  headerBar,
  makeStyles,
  useColors,
  type AppearancePreference,
} from '@/theme';
// import { useAuthStore } from '@/stores/auth-store';
import { useWalkthroughStore } from '@/stores/walkthrough-store';

type IconName = AppIconName;

const APPEARANCE_OPTIONS: { value: AppearancePreference; key: TranslationKey }[] = [
  { value: 'system', key: 'setting.appearanceSystem' },
  { value: 'light', key: 'setting.appearanceLight' },
  { value: 'dark', key: 'setting.appearanceDark' },
];

/** Hidden in release builds until every screen supports dark mode (THEME_DARK_READY). */
const SHOW_APPEARANCE = THEME_DARK_READY || __DEV__;

function FontSettingIcon() {
  const styles = useStyles();
  return (
    <View style={styles.fontIconBox}>
      <Text style={styles.fontIconText}>A</Text>
    </View>
  );
}

function SettingRow({
  label,
  icon,
  customIcon,
  value,
  onPress,
  showDivider,
}: {
  label: string;
  icon?: IconName;
  customIcon?: ReactNode;
  /** Current choice, shown before the chevron. */
  value?: string;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  const c = useColors();
  const styles = useStyles();
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        android_ripple={androidRipple}
        style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}>
        <View style={styles.rowIcon}>
          {customIcon ??
            (icon ? <AppIcon name={icon} tintColor={c.textSecondary} size={22} /> : null)}
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        <AppIcon name="chevron.right" tintColor={c.textDisabled} size={14} weight="semibold" />
      </Pressable>
      {showDivider ? <View style={styles.divider} /> : null}
    </>
  );
}

const PROFILE_NAME = 'User';
const PROFILE_PHONE = 'XXXXX';

function ProfileCard() {
  const styles = useStyles();
  const c = useColors();
  const photoUri = useSettingsStore((s) => s.profilePhotoUri);
  const setPhotoUri = useSettingsStore((s) => s.setProfilePhotoUri);

  const byDay = usePrintStatsStore((s) => s.byDay);
  const lifetime = usePrintStatsStore((s) => s.lifetime);
  const seeded = usePrintStatsStore((s) => s.seeded);
  const historyCount = usePrintHistoryStore((s) => s.entries.length);
  useEffect(() => {
    // One-time: count prints that were already in history before counters existed.
    if (!seeded) usePrintStatsStore.getState().seed(usePrintHistoryStore.getState().entries);
  }, [seeded, historyCount]);
  const { today, week } = printCounts(byDay);

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const stored = await copyImportIntoSezprint(
        'images',
        result.assets[0].uri,
        `profile-photo-${Date.now()}.jpg`,
      );
      setPhotoUri(stored);
    } catch {
      Alert.alert('Photo', 'Could not add the photo. Please try again.');
    }
  };

  const onAvatarPress = () => {
    if (!photoUri) {
      void pickPhoto();
      return;
    }
    Alert.alert('Profile photo', undefined, [
      { text: 'Change photo', onPress: () => void pickPhoto() },
      { text: 'Remove photo', style: 'destructive', onPress: () => setPhotoUri(null) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.profileCard}>
      <View style={styles.profileTop}>
      <Pressable
        onPress={onAvatarPress}
        accessibilityRole="button"
        accessibilityLabel={photoUri ? 'Change profile photo' : 'Add profile photo'}
        style={({ pressed }) => [styles.avatarRing, pressed && styles.avatarPressed]}>
        <View style={styles.avatar}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarInitial}>{PROFILE_NAME.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.avatarBadge}>
          <AppIcon name="square.and.pencil" tintColor={c.onAccent} size={12} />
        </View>
      </Pressable>
      <View style={styles.profileCopy}>
        <Text style={styles.profileName} numberOfLines={1}>{PROFILE_NAME}</Text>
        <View style={styles.phonePill}>
          <AppIcon name="phone.fill" tintColor={c.textSecondary} size={12} />
          <Text style={styles.profilePhone} numberOfLines={1}>{PROFILE_PHONE}</Text>
        </View>
      </View>
      </View>
      <View style={styles.statsRow}>
        {(
          [
            { label: 'Today', value: today, icon: 'sun.max', tint: '#F59E0B' }, // theme-fixed: stat accent colour
            { label: 'Last 7 days', value: week, icon: 'calendar', tint: c.accentStrong },
            { label: 'Lifetime', value: lifetime, icon: 'trophy', tint: '#8B5CF6' }, // theme-fixed: stat accent colour
          ] as const
        ).map((st) => (
          <View key={st.label} style={styles.statTile}>
            <View style={[styles.statIcon, { backgroundColor: `${st.tint}22` }]}>
              <AppIcon name={st.icon} tintColor={st.tint} size={16} />
            </View>
            <Text style={styles.statValue}>{st.value}</Text>
            <Text style={styles.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SettingGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.group}>{children}</View>;
}

export default function SettingScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.four);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const startWalkthrough = useWalkthroughStore((s) => s.start);
  const appearance = useSettingsStore((s) => s.appearance);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const appearanceKey =
    APPEARANCE_OPTIONS.find((o) => o.value === appearance)?.key ?? 'setting.appearanceSystem';
  // const logout = useAuthStore((s) => s.logout);

  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);

  const handleFeedback = () => {
    const query = encodeURIComponent('sez print');
    const url =
      Platform.OS === 'ios'
        ? `https://apps.apple.com/search?term=${query}`
        : `https://play.google.com/store/search?q=${query}&c=apps`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Unavailable', 'Could not open the app store on this device.'),
    );
  };

  const handleAbout = () => {
    const version = Constants.expoConfig?.version ?? '1.0.0';
    Alert.alert(
      'Sez Print',
      `Version ${version}\n\nDesign and print labels on generic ESC/POS Bluetooth thermal printers. Supports barcodes, QR codes, tables, cliparts, data files, and 22 Indian languages.`,
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => undefined },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        <Text style={styles.headerTitle}>{t('setting.title')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabPad },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.inner, { width: contentWidth, maxWidth: MaxContentWidth }]}>
          <ProfileCard />

          <SettingGroup>
            <SettingRow
              label={t('setting.connectBluetoothPrinter')}
              icon="printer"
              onPress={() => router.push('/printer-connect')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.languageSwitch')}
              icon="globe"
              onPress={() => router.push('/language-switch')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.font')}
              customIcon={<FontSettingIcon />}
              onPress={() => router.push('/font-library')}
              showDivider
            />
            <SettingRow
              label={t('setting.clipart')}
              icon="square.grid.2x2"
              onPress={() => router.push('/clipart')}
              showDivider
            />
            <SettingRow
              label={t('setting.border')}
              icon="rectangle.dashed"
              onPress={() => router.push('/border-library')}
              showDivider
            />
            <SettingRow
              label={t('setting.dataFile')}
              icon="tablecells"
              onPress={() => router.push('/data-file?type=Excel')}
              showDivider
            />
            <SettingRow
              label={t('setting.printingHistory')}
              icon="clock.arrow.circlepath"
              onPress={() => router.push('/printing-history')}
            />
          </SettingGroup>

          {SHOW_APPEARANCE ? (
            <SettingGroup>
              <SettingRow
                label={t('setting.appearance')}
                icon="circle.lefthalf.filled"
                value={t(appearanceKey)}
                onPress={() => setAppearanceOpen(true)}
              />
            </SettingGroup>
          ) : null}

          <SettingGroup>
            <SettingRow
              label={t('setting.advancedSettings')}
              icon="gearshape"
              onPress={() => router.push('/advanced-settings')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.appPermissions')}
              icon="slider.horizontal.3"
              onPress={() => router.push('/app-permissions')}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.walkthrough')}
              icon="questionmark.circle.fill"
              onPress={() => {
                router.navigate('/');
                startWalkthrough('home');
              }}
              showDivider
            />
            <SettingRow
              label={t('setting.canvasWalkthrough')}
              icon="square.dashed"
              onPress={() => {
                // Opens a blank label so the tour has a canvas to point at.
                router.push('/edit');
                startWalkthrough('canvas');
              }}
              showDivider
            />
            <SettingRow
              label={t('setting.feedback')}
              icon="square.and.pencil"
              onPress={handleFeedback}
              showDivider
            />
            <SettingRow label={t('setting.aboutUs')} icon="info.circle" onPress={handleAbout} />
          </SettingGroup>

          {/* Log out hidden while login is switched off.
          <SettingGroup>
            <SettingRow
              label="Log out"
              icon="rectangle.portrait.and.arrow.right"
              onPress={handleLogout}
            />
          </SettingGroup>
          */}
        </View>
      </ScrollView>

      <ActionSheet
        visible={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
        items={APPEARANCE_OPTIONS.map((o) => ({
          label: t(o.key),
          selected: o.value === appearance,
          onPress: () => setAppearance(o.value),
        }))}
      />
    </View>
  );
}

const ICON_COL = 34;

const useStyles = makeStyles((c, scheme) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    ...headerBar(c, scheme),
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  headerTitle: {
    color: c.onHeader,
    fontSize: 17,
    fontWeight: '500',
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  inner: {
    width: '100%',
    gap: Spacing.two + 2,
  },
  group: {
    backgroundColor: c.surface,
    borderRadius: 10,
    ...cardElevation(c, scheme),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingRight: Spacing.three,
    overflow: 'hidden',
  },
  rowPressed: {
    backgroundColor: c.fill,
  },
  rowIcon: {
    width: ICON_COL + Spacing.three * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: c.text,
  },
  rowValue: {
    fontSize: 14,
    color: c.textMuted,
    marginRight: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
    marginLeft: ICON_COL + Spacing.three * 2,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: c.fill,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    paddingVertical: Spacing.two + 2,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: c.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: { fontSize: 11, fontWeight: '500', color: c.textMuted },
  profileCard: {
    gap: Spacing.three,
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.hairline,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    ...cardElevation(c, scheme),
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: c.accentStrong,
    padding: 3,
  },
  avatarPressed: { opacity: 0.85 },
  avatar: {
    flex: 1,
    borderRadius: 39,
    backgroundColor: c.header,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: c.onHeader },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: c.accentStrong,
    borderWidth: 2,
    borderColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCopy: { flex: 1, minWidth: 0, gap: 6 },
  profileName: { fontSize: 20, fontWeight: '700', color: c.text, letterSpacing: 0.2 },
  phonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: c.fill,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  profilePhone: {
    fontSize: 13,
    fontWeight: '500',
    color: c.textSecondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.6,
  },
  fontIconBox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontIconText: {
    fontSize: 18,
    fontWeight: '500',
    color: c.textSecondary,
    lineHeight: 20,
  },
}));
