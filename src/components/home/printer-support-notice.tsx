import { Image, Modal, Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { CONSUMER_PRINTER_LIST } from '@/constants/printer-models';
import { PRINTER_PHOTOS } from '@/constants/printer-photos';
import { Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { themedStyles, useColors, useThemeRefresh } from '@/theme';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';

const NOTICE_LOGO = require('../../../assets/images/notice/logo.png');

/** One-time welcome card on first launch: which printers work today, and where to send feedback. */
export function PrinterSupportNotice({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  useThemeRefresh();
  const c = useColors();
  return (
    <Modal supportedOrientations={ALL_ORIENTATIONS} visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.band}>
            <Image source={NOTICE_LOGO} style={styles.logo} resizeMode="contain" fadeDuration={0} />
            <Text style={styles.subtitle}>Printers we support today</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.row}>
              {CONSUMER_PRINTER_LIST.map((p) => (
                <View key={p.id} style={styles.printer}>
                  <View style={styles.stage}>
                    <Image source={PRINTER_PHOTOS[p.id]} style={styles.photo} resizeMode="contain" fadeDuration={0} />
                  </View>
                  <Text style={[styles.printerName, { color: p.accent }]} numberOfLines={1}>
                    {p.shortName}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.text}>
              Sez Print works with the Tejas, Rudra and Josh printers right now. Our team is
              constantly working to add more printers and features to the app.
            </Text>

            <View style={styles.tip}>
              <AppIcon name="square.and.pencil" tintColor={c.accentStrong} size={18} />
              <Text style={styles.tipText}>
                Have a suggestion or a complaint? Send it to us from{' '}
                <Text style={styles.tipStrong}>Settings › Suggestions & Complaints</Text>.
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              android_ripple={androidRipple}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
              <Text style={styles.btnText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  backdrop: {
    flex: 1,
    backgroundColor: c.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.surface,
    borderRadius: 24,
    overflow: 'hidden',
  },
  band: {
    backgroundColor: c.header,
    alignItems: 'center',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: 4,
  },
  logo: { width: 84, height: 84, borderRadius: 18, marginBottom: 4 },
  subtitle: { fontSize: 13, color: c.onHeader, opacity: 0.8 },
  body: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', gap: 10 },
  printer: { flex: 1, gap: 6, alignItems: 'center' },
  stage: {
    width: '100%',
    height: 96,
    borderRadius: 14,
    backgroundColor: '#050505', // theme-fixed: black backdrop for the printer photo
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  printerName: { fontSize: 13, fontWeight: '700' },
  text: { fontSize: 14, lineHeight: 21, color: c.textSecondary, textAlign: 'center' },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: c.accentSoft,
    borderRadius: 14,
    padding: Spacing.three,
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19, color: c.text },
  tipStrong: { fontWeight: '700' },
  btn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: c.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.9 },
}));
