import { useScheme, type ColorScheme } from '@/theme';

type AuthPalette = {
  bg: string;
  sheet: string;
  field: string;
  fieldFocus: string;
  border: string;
  text: string;
  label: string;
  subtitle: string;
  muted: string;
  placeholder: string;
  icon: string;
  accent: string;
  /** Blue used for text and links, readable on this theme's background. */
  link: string;
  accentDeep: string;
  accentSoft: string;
  error: string;
  success: string;
  grid: string;
  handle: string;
  track: string;
  chipOff: string;
  chipResend: string;
  segment: string;
  segmentOn: string;
  ruleBg: string;
  ruleBorder: string;
  ruleMetBg: string;
  ruleMetBorder: string;
  ruleMetText: string;
  bannerBg: string;
  bannerBorder: string;
  devBorder: string;
  /** Typed OTP box at rest, and the dimmed look the verify animation settles on. */
  otpRestBorder: string;
  otpRestFill: string;
  otpActiveFill: string;
  otpDimBorder: string;
  otpDimFill: string;
};

const DARK: AuthPalette = {
  bg: '#000000',
  sheet: '#0B0B0D',
  field: '#141417',
  fieldFocus: '#0D1B2E',
  border: '#2A2A2F',
  text: '#F5F5F7',
  label: '#D4D4D8',
  subtitle: '#A1A1AA',
  muted: '#8A8A92',
  placeholder: '#6B6B73',
  icon: '#6B6B73',
  accent: '#1A9BFF',
  link: '#4FC3FF',
  accentDeep: '#2563EB',
  accentSoft: '#4FC3FF',
  error: '#F87171',
  success: '#34D399',
  grid: 'rgba(255,255,255,0.07)',
  handle: '#35353A',
  track: '#26262A',
  chipOff: '#26262A',
  chipResend: '#24344F',
  segment: '#141417',
  segmentOn: '#2A2A2F',
  ruleBg: '#141417',
  ruleBorder: '#2A2A2F',
  ruleMetBg: '#12281F',
  ruleMetBorder: '#1F5C41',
  ruleMetText: '#6EE7B7',
  bannerBg: '#2A1717',
  bannerBorder: '#5B2323',
  devBorder: '#3F3F45',
  otpRestBorder: '#3F3F45',
  otpRestFill: '#242427',
  otpActiveFill: '#13202D',
  otpDimBorder: '#164A73',
  otpDimFill: '#13202D',
};

const LIGHT: AuthPalette = {
  bg: '#FFFFFF',
  sheet: '#FFFFFF',
  field: '#F5F7FA',
  fieldFocus: '#EEF6FF',
  border: '#DCE1EA',
  text: '#0B1220',
  label: '#2B3345',
  subtitle: '#5B6478',
  muted: '#5B6478',
  placeholder: '#98A1B3',
  icon: '#98A1B3',
  accent: '#1A9BFF',
  link: '#1670D6',
  accentDeep: '#2563EB',
  accentSoft: '#38B6FF',
  error: '#DC2626',
  success: '#059669',
  grid: 'rgba(15,23,42,0.07)',
  handle: '#D5DAE3',
  track: '#E3E8F0',
  chipOff: '#C5CCD9',
  chipResend: '#5B7391',
  segment: '#EEF1F6',
  segmentOn: '#FFFFFF',
  ruleBg: '#F5F7FA',
  ruleBorder: '#DCE1EA',
  ruleMetBg: '#E8F8F0',
  ruleMetBorder: '#9ADBBC',
  ruleMetText: '#047857',
  bannerBg: '#FEF2F2',
  bannerBorder: '#FECACA',
  devBorder: '#C5CCD9',
  otpRestBorder: '#B9C2D3',
  otpRestFill: '#FFFFFF',
  otpActiveFill: '#EEF6FF',
  otpDimBorder: '#9CCBF2',
  otpDimFill: '#EAF4FF',
};

export function authPalette(scheme: ColorScheme): AuthPalette {
  return scheme === 'dark' ? DARK : LIGHT;
}

/** Login / register colours: black with a white grid in dark mode, white in light mode. */
export function useAuthColors(): AuthPalette {
  return authPalette(useScheme());
}
