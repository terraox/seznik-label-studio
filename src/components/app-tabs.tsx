import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { Palette } from '@/constants/ui';
import { useTranslation } from '@/lib/i18n';

const TAB_INACTIVE = '#7A8794';

export default function AppTabs() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Palette.accent,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarStyle: styles.bar,
        tabBarBackground: () => (
          <View style={styles.barBackground} pointerEvents="none">
            <View style={styles.gloss} />
            <View style={styles.topHairline} />
          </View>
        ),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="template"
        options={{
          title: t('tab.template'),
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: t('tab.shop'),
          tabBarIcon: ({ color, size }) => <Ionicons name="bag-handle" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="help"
        options={{
          title: t('tab.help'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="help-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="setting"
        options={{
          title: t('tab.setting'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 84 : 62,
    paddingTop: 4,
    ...(Platform.OS === 'android' ? { elevation: 10 } : null),
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#0B1F33',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        }
      : null),
  },
  barBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    experimental_backgroundImage:
      'linear-gradient(180deg, #FFFFFF 0%, #F7FAFC 55%, #F0F4F8 100%)',
  },
  gloss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(23, 166, 184, 0.35)',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: Platform.OS === 'ios' ? 0 : 4,
  },
  item: {
    paddingTop: 2,
  },
});
