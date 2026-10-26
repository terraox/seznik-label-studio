import type { ColorScheme } from '@/theme';

/** Colours for the welcome screen, one set per theme. */
export type WelcomePalette = {
  bg: string;
  text: string;
  subtitle: string;
  muted: string;
  link: string;
  /** Glow ring: cool body colour, warm highlight on the right, and the brightest rim. */
  glowCool: string;
  glowWarm: string;
  glowRim: string;
  glowOpacity: number;
  buttonBg: string;
  buttonText: string;
  buttonGlow: string;
  outlineBorder: string;
  outlineText: string;
  outlineFill: string;
  tileBg: string;
  tileBorder: string;
  grid: string;
};

const DARK: WelcomePalette = {
  bg: '#0A0B0E',
  text: '#FFFFFF',
  subtitle: '#B9BEC8',
  muted: '#8A909C',
  link: '#FFFFFF',
  glowCool: '#1F5BFF',
  glowWarm: '#E8DCC2',
  glowRim: '#8FB6FF',
  glowOpacity: 1,
  buttonBg: '#FFFFFF',
  buttonText: '#0A0B0E',
  buttonGlow: '#FFFFFF',
  outlineBorder: 'rgba(255,255,255,0.38)',
  outlineText: '#FFFFFF',
  outlineFill: 'rgba(255,255,255,0.06)',
  tileBg: '#16181D',
  tileBorder: '#2A2D35',
  grid: 'rgba(255,255,255,0.07)',
};

const LIGHT: WelcomePalette = {
  bg: '#FFFFFF',
  text: '#0B1220',
  subtitle: '#4C566B',
  muted: '#6B7488',
  link: '#1670D6',
  glowCool: '#4DA3FF',
  glowWarm: '#BFE6FF',
  glowRim: '#8CC8FF',
  glowOpacity: 0.85,
  buttonBg: '#1670D6',
  buttonText: '#FFFFFF',
  buttonGlow: '#1A9BFF',
  outlineBorder: '#1670D6',
  outlineText: '#1670D6',
  outlineFill: 'rgba(22,112,214,0.06)',
  tileBg: '#FFFFFF',
  tileBorder: '#DCE1EA',
  grid: 'rgba(15,23,42,0.07)',
};

export function welcomePalette(scheme: ColorScheme): WelcomePalette {
  return scheme === 'dark' ? DARK : LIGHT;
}
