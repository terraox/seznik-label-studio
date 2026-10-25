import Constants from 'expo-constants';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppearancePicker } from '@/components/appearance-picker';
import { SupportedPrintersSection } from '@/components/supported-printers-section';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { copyImportIntoSezprint } from '@/lib/user-files/root';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useTranslation } from '@/lib/i18n';
import { usePrintHistoryStore } from '@/stores/print-history-store';
import { DeleteAccountModal } from '@/components/delete-account-modal';
import { FeedbackFormModal } from '@/components/feedback-form';
import type { FeedbackPayload } from '@/lib/telemetry/events';
import { useFeedbackStore } from '@/stores/feedback-store';
import { printCounts, selectLifetime, usePrintStatsStore } from '@/stores/print-stats-store';
import { useSettingsStore } from '@/stores/settings-store';
import { trackFeatureClick } from '@/lib/telemetry/events';
import {
  THEME_DARK_READY,
  cardElevation,
  headerBar,
  makeStyles,
  useColors,
} from '@/theme';
import { useAuthStore } from '@/stores/auth-store';
import { useWalkthroughStore } from '@/stores/walkthrough-store';

type IconName = AppIconName;

/** Hidden in release builds until every screen supports dark mode (THEME_DARK_READY). */
const SHOW_APPEARANCE = THEME_DARK_READY || __DEV__;

function FontSettingIcon() {
  const styles = useStyles();
  return (
    <View style={styles.fontIconBox}>
      <Text allowFontScaling={false} style={styles.fontIconText}>A</Text>
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
  danger,
}: {
  label: string;
  icon?: IconName;
  customIcon?: ReactNode;
  /** Current choice, shown before the chevron. */
  value?: string;
  onPress?: () => void;
  showDivider?: boolean;
  danger?: boolean;
}) {
  const c = useColors();
  const styles = useStyles();
  const tint = danger ? c.danger : c.textSecondary;
  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        android_ripple={androidRipple}
        style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}>
        <View style={styles.rowIcon}>
          {customIcon ??
            (icon ? <AppIcon name={icon} tintColor={tint} size={22} /> : null)}
        </View>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        <AppIcon name="chevron.right" tintColor={c.textDisabled} size={14} weight="semibold" />
      </Pressable>
      {showDivider ? <View style={styles.divider} /> : null}
    </>
  );
}

/** 9876543210 -> +91 98765 43210. Anything that is not 10 digits is shown as saved. */
function formatMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : mobile;
}

function ProfileCard() {
  const styles = useStyles();
  const c = useColors();
  const user = useAuthStore((s) => s.user);
  const profileName = user?.name?.trim() || 'User';
  const profilePhone = user?.mobile ? formatMobile(user.mobile) : null;
  const photoUri = useSettingsStore((s) => s.profilePhotoUri);
  const setPhotoUri = useSettingsStore((s) => s.setProfilePhotoUri);

  const byDay = usePrintStatsStore((s) => s.byDay);
  const lifetime = usePrintStatsStore(selectLifetime);
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
            <Text style={styles.avatarInitial}>{profileName.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.avatarBadge}>
          <AppIcon name="square.and.pencil" tintColor={c.onAccent} size={12} />
        </View>
      </Pressable>
      <View style={styles.profileCopy}>
        <Text style={styles.profileName} numberOfLines={1}>{profileName}</Text>
        {profilePhone ? (
        <View style={styles.phonePill}>
          <AppIcon name="phone.fill" tintColor={c.textSecondary} size={12} />
          <Text style={styles.profilePhone} numberOfLines={1}>{profilePhone}</Text>
        </View>
        ) : null}
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
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const handleFeedback = () => {
    trackFeatureClick('settings.feedback');
    setFeedbackOpen(true);
  };
  const sendFeedback = (payload: FeedbackPayload) => {
    setFeedbackOpen(false);
    // Saved on the phone and sent to the admin desk's Feedback table with the next batch of events.
    useFeedbackStore.getState().submit(payload, selectLifetime(usePrintStatsStore.getState()));
    Alert.alert('Thank you', 'Your message has been sent.');
  };

  const handleAbout = () => {
    trackFeatureClick('settings.about');
    const version = Constants.expoConfig?.version ?? '1.0.0';
    Alert.alert(
      'Sez Print',
      `Version ${version}\n\nDesign and print labels on generic ESC/POS Bluetooth thermal printers. Supports barcodes, QR codes, tables, cliparts, data files, and 22 Indian languages.`,
    );
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleDeleteAccount = () => {
    trackFeatureClick('settings.delete_account');
    setDeleteOpen(true);
  };

  const confirmDeleteAccount = async (reason: string) => {
    setDeleteBusy(true);
    const result = await deleteAccount(reason);
    setDeleteBusy(false);
    if (!result.ok) {
      Alert.alert('Could not delete', result.error);
      return;
    }
    setDeleteOpen(false);
    Alert.alert('Account deleted', 'Your account has been permanently deleted.');
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
              onPress={() => {
                trackFeatureClick('settings.printer');
                router.push('/printer-connect');
              }}
            />
          </SettingGroup>

          <SupportedPrintersSection />

          <SettingGroup>
            <SettingRow
              label={t('setting.languageSwitch')}
              icon="globe"
              onPress={() => {
                trackFeatureClick('settings.language');
                router.push('/language-switch');
              }}
            />
          </SettingGroup>

          {SHOW_APPEARANCE ? (
            <View style={styles.appearanceBlock}>
              <Text style={styles.appearanceHeading}>{t('setting.appearance')}</Text>
              <AppearancePicker
                value={appearance}
                onChange={(next) => {
                  trackFeatureClick('settings.appearance');
                  setAppearance(next);
                }}
              />
            </View>
          ) : null}

          <SettingGroup>
            <SettingRow
              label={t('setting.font')}
              customIcon={<FontSettingIcon />}
              onPress={() => {
                trackFeatureClick('settings.fonts');
                router.push('/font-library');
              }}
              showDivider
            />
            <SettingRow
              label={t('setting.clipart')}
              icon="square.grid.2x2"
              onPress={() => {
                trackFeatureClick('settings.clipart');
                router.push('/clipart');
              }}
              showDivider
            />
            <SettingRow
              label={t('setting.border')}
              icon="rectangle.dashed"
              onPress={() => {
                trackFeatureClick('settings.borders');
                router.push('/border-library');
              }}
              showDivider
            />
            <SettingRow
              label={t('setting.dataFile')}
              icon="tablecells"
              onPress={() => {
                trackFeatureClick('settings.data_file');
                router.push('/data-file?type=Excel');
              }}
              showDivider
            />
            <SettingRow
              label={t('setting.printingHistory')}
              icon="clock.arrow.circlepath"
              onPress={() => {
                trackFeatureClick('settings.history');
                router.push('/printing-history');
              }}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.advancedSettings')}
              icon="gearshape"
              onPress={() => {
                trackFeatureClick('settings.advanced');
                router.push('/advanced-settings');
              }}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.appPermissions')}
              icon="slider.horizontal.3"
              onPress={() => {
                trackFeatureClick('settings.permissions');
                router.push('/app-permissions');
              }}
            />
          </SettingGroup>

          <SettingGroup>
            <SettingRow
              label={t('setting.walkthrough')}
              icon="questionmark.circle.fill"
              onPress={() => {
                trackFeatureClick('settings.walkthrough');
                router.navigate('/');
                startWalkthrough('home');
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

          <SettingGroup>
            <SettingRow
              label={t('setting.logOut')}
              icon="rectangle.portrait.and.arrow.right"
              onPress={handleLogout}
              showDivider
            />
            <SettingRow
              label={t('setting.deleteAccount')}
              icon="trash"
              danger
              onPress={handleDeleteAccount}
            />
          </SettingGroup>
        </View>
      </ScrollView>

      <FeedbackFormModal
        visible={feedbackOpen}
        onCancel={() => setFeedbackOpen(false)}
        onSubmit={sendFeedback}
      />

      <DeleteAccountModal
        visible={deleteOpen}
        busy={deleteBusy}
        onCancel={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
        }}
        onConfirm={(reason) => {
          void confirmDeleteAccount(reason);
        }}
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
  appearanceBlock: {
    gap: 8,
  },
  appearanceHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: c.text,
    paddingHorizontal: 2,
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
  rowLabelDanger: {
    color: c.danger,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 14,
    color: c.textMuted,
    marginRight: Spacing.two,
    flexShrink: 1,
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
    flexShrink: 1,
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
