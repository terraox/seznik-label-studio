import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { registerWalkthroughTarget } from '@/lib/walkthrough/registry';
import { useTranslation } from '@/lib/i18n';
import { makeStyles, useColors } from '@/theme';

const ANDROID_BAR_HEIGHT = 62;

/** Selected tab reads bold in the accent colour; the others stay lighter and muted. */
function tabLabel({ focused, color, children }: { focused: boolean; color: string; children: string }) {
  return (
    <Text
      numberOfLines={1}
      style={{
        color,
        fontSize: 11,
        fontWeight: focused ? '700' : '500',
        marginBottom: Platform.OS === 'ios' ? 0 : 4,
      }}>
      {children}
    </Text>
  );
}

export default function AppTabs() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useStyles();
  // Grow the bar by the system navigation inset (3-button or gesture bar) so it is never covered.
  const barStyle = Platform.OS === 'android'
    ? [styles.bar, { height: ANDROID_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]
    : styles.bar;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabel: tabLabel,
        tabBarItemStyle: styles.item,
        tabBarStyle: barStyle,
        tabBarBackground: () => (
          <View
            ref={(node) => registerWalkthroughTarget('tabs.bar', node)}
            collapsable={false}
            style={styles.barBackground}
            pointerEvents="none">
            <View style={styles.gloss} />
            <View style={styles.topHairline} />
          </View>
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="template"
        options={{
          title: t('tab.template'),
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: t('tab.shop'),
          tabBarIcon: ({ color, size }) => <Ionicons name="bag-handle" size={size + 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: t('tab.help'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="help-circle" size={size + 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="setting"
        options={{
          title: t('tab.setting'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size + 2} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const useStyles = makeStyles((c, scheme) => ({
  bar: {
    backgroundColor: c.surface,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 84 : ANDROID_BAR_HEIGHT,
    paddingTop: 4,
    ...(Platform.OS === 'android' ? { elevation: 10 } : null),
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: c.shadow,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        }
      : null),
  },
  barBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.surface,
    overflow: 'hidden',
    // Light keeps its soft white gradient; dark is a flat surface.
    ...(scheme === 'light'
      ? { experimental_backgroundImage: 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFC 55%, #F0F4F8 100%)' } // theme-fixed: light-only gradient
      : null),
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: scheme === 'light' ? 'rgba(255, 255, 255, 0.85)' : 'transparent', // theme-fixed: light-only gloss
  },
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: scheme === 'light' ? 'rgba(23, 166, 184, 0.35)' : c.hairline, // theme-fixed: light teal hairline
  },
  item: {
    paddingTop: 4,
    gap: 2,
  },
}));
