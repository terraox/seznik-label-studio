import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { useState, type ReactNode } from 'react';
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
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useTranslation, type TranslationKey } from '@/lib/i18n';
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
                startWalkthrough();
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
