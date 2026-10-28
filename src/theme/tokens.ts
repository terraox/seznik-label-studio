/**
 * Semantic colour tokens for the app UI, light and dark.
 *
 * Pure data (no react-native import) so node:test can load it.
 *
 * Never used for the label canvas, the elements on it, label previews, thumbnails or anything
 * that is captured for printing. Those keep their own fixed colours (see `LightScope`).
 */

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  /** Screen background. */
  bg: string;
  /** Cards, list groups, tab bar, tool sheets. */
  surface: string;
  /** Popups, menus, dialogs, bottom sheets. */
  raised: string;
  /** Input fills, segmented tracks, chips, row press. */
  fill: string;
  /** Selected segment, stronger fill. */
  fillStrong: string;
  /** Top bar. */
  header: string;
  /** Thin line under the top bar. */
  headerBorder: string;
  /** Text and icons on the top bar. */
  onHeader: string;
  text: string;
  textSecondary: string;
  /** Hints, placeholders, inactive tabs and icons. */
  textMuted: string;
  textDisabled: string;
  /** Input and outlined-button borders (≥3:1 on dark surfaces). */
  border: string;
  /** Dividers between rows (decorative). */
  hairline: string;
  /** Outline that separates cards and sheets from the page in dark mode (shadows vanish on black). */
  cardBorder: string;
  /** Accent for text, icons, selected states. */
  accent: string;
  /** Primary button fill. */
  accentFill: string;
  /** Hero / strong filled surfaces. */
  accentStrong: string;
  /** accentStrong used as text or icon colour (lifted in dark to stay readable). */
  accentInk: string;
  /** Text and icons on accentFill / accentStrong. */
  onAccent: string;
  /** Selected chip / row background. */
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  /** Solid red button / badge (white text). */
  dangerFill: string;
  success: string;
  successSoft: string;
  /** Solid green button / badge (white text). */
  successFill: string;
  /** Solid dark-grey button (white text). */
  neutralFill: string;
  /** Near-black button in light mode (white text); lifted grey in dark so the shape stays visible. */
  inkFill: string;
  /** Brand navy used as text or icon colour on light surfaces. */
  brandInk: string;
  warning: string;
  warningSoft: string;
  onWarningSoft: string;
  /** iOS-style dialog and sheet buttons. */
  link: string;
  /** Behind modals. */
  scrim: string;
  /** Pressed-state overlay on buttons inside popups. */
  pressedOverlay: string;
  /** Animated splash background. */
  splash: string;
  shadow: string;
  /** Area around the white label artboard in the editor. */
  canvasArea: string;
};

export const LightColors: ThemeColors = {
  bg: '#F4F7FB',
  surface: '#FFFFFF',
  raised: '#FFFFFF',
  fill: '#EEF2F8',
  fillStrong: '#E3E9F2',
  header: '#24275A',
  headerBorder: 'transparent',
  onHeader: '#FFFFFF',
  text: '#1D2140',
  textSecondary: '#4A5070',
  textMuted: '#666C88',
  textDisabled: '#A8ADC0',
  border: '#C9D1E0',
  hairline: '#E4E9F1',
  cardBorder: '#E1E7F0',
  accent: '#2DAFE5',
  accentFill: '#1878B8',
  accentStrong: '#1878B8',
  accentInk: '#1878B8',
  onAccent: '#FFFFFF',
  accentSoft: 'rgba(45, 175, 229, 0.13)',
  danger: '#C8493F',
  dangerSoft: '#FBE9E6',
  dangerFill: '#C8493F',
  success: '#18794A',
  successSoft: '#E8F6EE',
  successFill: '#2E9E63',
  neutralFill: '#525860',
  inkFill: '#24275A',
  brandInk: '#24275A',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  onWarningSoft: '#92400E',
  link: '#007AFF',
  scrim: 'rgba(0, 0, 0, 0.45)',
  pressedOverlay: 'rgba(0, 0, 0, 0.06)',
  splash: '#FEFEFE',
  shadow: '#1A1F3D',
  canvasArea: '#E8EDF5',
};

export const DarkColors: ThemeColors = {
  bg: '#000000',
  surface: '#121212',
  raised: '#1E1E1E',
  fill: '#1E1E1E',
  fillStrong: '#2A2A2A',
  header: '#24275A',
  headerBorder: '#2E2E2E',
  onHeader: '#FFFFFF',
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textMuted: '#8A8A8A',
  textDisabled: '#6B6B6B',
  border: '#6B6B6B',
  hairline: '#2E2E2E',
  cardBorder: '#333333',
  accent: '#5CC4F0',
  accentFill: '#1878B8',
  accentStrong: '#1878B8',
  accentInk: '#5CC4F0',
  onAccent: '#FFFFFF',
  accentSoft: 'rgba(92, 196, 240, 0.16)',
  danger: '#FF6B6B',
  dangerSoft: 'rgba(255, 107, 107, 0.16)',
  dangerFill: '#DC2626',
  success: '#4ADE80',
  successSoft: 'rgba(74, 222, 128, 0.14)',
  successFill: '#18794A',
  neutralFill: '#3A3A3A',
  inkFill: '#3A3A3A',
  brandInk: '#C6CCEB',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 191, 36, 0.16)',
  onWarningSoft: '#FBBF24',
  link: '#6CB4FF',
  scrim: 'rgba(0, 0, 0, 0.7)',
  pressedOverlay: 'rgba(255, 255, 255, 0.08)',
  splash: '#000000',
  shadow: '#000000',
  canvasArea: '#10151F',
};

export const ThemeTokens: Record<ColorScheme, ThemeColors> = {
  light: LightColors,
  dark: DarkColors,
};

/** User choice in Settings → Appearance. */
export type AppearancePreference = 'system' | 'light' | 'dark';

/**
 * Kill switch. While false, release builds always resolve to light (dev builds still honour the
 * Appearance setting). True since every screen was converted (G9).
 */
export const THEME_DARK_READY = true;
