import { useState } from 'react';
import { Alert, Image, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { requestPinWidget } from 'react-native-android-widget';

import { AppIcon } from '@/components/app-icon';
import { SettingsNote, SettingsScreenShell } from '@/components/settings-ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { makeStyles, useColors } from '@/theme';

type WidgetOption = {
  name: string;
  title: string;
  description: string;
  preview: number;
};

const WIDGETS: WidgetOption[] = [
  {
    name: 'SeznikFeatures',
    title: 'Seznik tools',
    description: 'New label, PDF, shipping, Excel, and serial shortcuts.',
    preview: require('../../assets/widget-previews/seznikfeatures.png'),
  },
  {
    name: 'SeznikShipping',
    title: 'Seznik shipping',
    description: 'Open Amazon, Flipkart, or Meesho shipping labels.',
    preview: require('../../assets/widget-previews/seznikshipping.png'),
  },
];

const MANUAL_HELP = 'Long-press an empty spot on your home screen, tap Widgets, then pick Seznik.';

export default function WidgetsScreen() {
  const styles = useStyles();
  const c = useColors();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width - Spacing.three * 2, MaxContentWidth);
  const previewWidth = contentWidth - 28 - 2; // card padding and border
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (widget: WidgetOption) => {
    if (busy) return;
    setBusy(widget.name);
    try {
      const supported = Platform.OS === 'android' && (await requestPinWidget({ widgetName: widget.name }));
      if (!supported) Alert.alert('Add manually', `Your launcher can't add this directly.\n\n${MANUAL_HELP}`);
    } catch {
      Alert.alert('Add manually', `Could not open the add dialog.\n\n${MANUAL_HELP}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingsScreenShell title="Widgets">
      <View style={[styles.list, { width: contentWidth }]}>
        {WIDGETS.map((widget) => (
          <View key={widget.name} style={styles.card}>
            <Image source={widget.preview} style={[styles.preview, { width: previewWidth, height: previewWidth / 2 }]} resizeMode="contain" />
            <Text style={styles.title}>{widget.title}</Text>
            <Text style={styles.description}>{widget.description}</Text>
            <Pressable
              onPress={() => void add(widget)}
              disabled={busy !== null}
              android_ripple={androidRipple}
              style={({ pressed }) => [styles.button, (pressed || busy === widget.name) && styles.pressed]}>
              {busy === widget.name ? null : <AppIcon name="plus" tintColor={c.onAccent} size={16} weight="bold" />}
              <Text style={styles.buttonText}>{busy === widget.name ? 'Adding…' : 'Add widget'}</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={{ width: contentWidth }}>
        <SettingsNote>{MANUAL_HELP}</SettingsNote>
      </View>
    </SettingsScreenShell>
  );
}

const useStyles = makeStyles((c) => ({
  list: { gap: 14 },
  card: {
    backgroundColor: c.raised,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  preview: { borderRadius: 10, backgroundColor: c.surface },
  title: { marginTop: 12, fontSize: 16, fontWeight: '700', color: c.text },
  description: { marginTop: 2, fontSize: 13, color: c.textSecondary },
  button: {
    marginTop: 14,
    height: 46,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: c.accentFill,
    overflow: 'hidden',
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: c.onAccent },
  pressed: { opacity: 0.7 },
}));
