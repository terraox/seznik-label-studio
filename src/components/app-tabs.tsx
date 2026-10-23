import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { type ComponentProps } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { registerWalkthroughTarget } from '@/lib/walkthrough/registry';
import { useTranslation } from '@/lib/i18n';
import { makeStyles, useColors } from '@/theme';

const ANDROID_BAR_HEIGHT = 60;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Selected tab: filled icon in the brand ink. Others: outline icon, muted. Nothing else. */
function tabIcon(icon: IoniconName) {
  return function TabIcon({ focused, color }: { focused: boolean; color: string }) {
    return <Ionicons name={focused ? icon : (`${icon}-outline` as IoniconName)} size={24} color={color} />;
  };
}

function tabLabel({ focused, color, children }: { focused: boolean; color: string; children: string }) {
  return (
    <Text
      numberOfLines={1}
      style={{
        color,
        fontSize: 11,
        fontWeight: focused ? '600' : '400',
        marginBottom: Platform.OS === 'ios' ? 0 : 6,
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
        tabBarActiveTintColor: c.brandInk,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabel: tabLabel,
        tabBarItemStyle: styles.item,
        tabBarStyle: barStyle,
        tabBarBackground: () => (
          <View
            ref={(node) => registerWalkthroughTarget('tabs.bar', node)}
            collapsable={false}
            style={styles.barBackground}
            pointerEvents="none"
          />
        ),
      }}>
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="template" options={{ title: t('tab.template'), tabBarIcon: tabIcon('grid') }} />
      <Tabs.Screen name="shop" options={{ title: t('tab.shop'), tabBarIcon: tabIcon('bag-handle') }} />
      <Tabs.Screen name="help" options={{ title: t('tab.help'), tabBarIcon: tabIcon('help-circle') }} />
      <Tabs.Screen name="setting" options={{ title: t('tab.setting'), tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}

const useStyles = makeStyles((c) => ({
  bar: {
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
    height: Platform.OS === 'ios' ? 84 : ANDROID_BAR_HEIGHT,
    paddingTop: 6,
    elevation: 0,
    shadowOpacity: 0,
  },
  barBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.surface,
  },
  item: {
    gap: 2,
  },
}));
