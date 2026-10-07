import { Platform } from 'react-native';

import type { FontRail } from '@/lib/fonts/types';

export type { FontRail };

export interface FontLibraryItem {
  id: string;
  name: string;
  /** expo-font / Skia family. File-backed catalog faces use this key after download. */
  family?: string;
  category: FontRail;
  sample: string;
  sampleNative?: string;
  source: 'bundled' | 'catalog';
  /** OFL face fetched on demand. Absent for faces already in the app binary. */
  downloadUrl?: string;
}

const FONTSOURCE = 'https://cdn.jsdelivr.net/fontsource/fonts';

function fontsourceTtf(pkg: string): string {
  return `${FONTSOURCE}/${pkg}@5.3.0/latin-400-normal.ttf`;
}

export const FONT_RAILS: { id: FontRail; label: string }[] = [
  { id: 'common', label: 'Common Font' },
  { id: 'normal', label: 'Normal Fonts' },
  { id: 'creative', label: 'Other Creative Fonts' },
  { id: 'indian', label: 'Indian Script' },
];

export const FONT_LIBRARY: FontLibraryItem[] = [
  {
    id: 'system',
    name: 'System Default',
    family: undefined,
    category: 'common',
    sample: 'Label Print Preview Aa',
    source: 'bundled',
  },
  {
    id: 'inter',
    name: 'Inter',
    family: 'Inter_400Regular',
    category: 'common',
    sample: 'Clean modern sans-serif text',
    source: 'bundled',
  },
  {
    id: 'serif',
    name: Platform.OS === 'ios' ? 'Georgia' : 'Serif',
    family: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    category: 'common',
    sample: 'Classic serif label text',
    source: 'bundled',
  },
  {
    id: 'mono',
    name: 'Monospace',
    family: 'RobotoMono_400Regular',
    category: 'common',
    sample: 'CODE-128 BARCODE 001',
    source: 'bundled',
  },
  {
    id: 'roboto',
    name: 'Roboto',
    family: 'Roboto_400Regular',
    category: 'normal',
    sample: 'Roboto regular body text',
    source: 'bundled',
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    family: 'OpenSans_400Regular',
    category: 'normal',
    sample: 'Open Sans friendly labels',
    source: 'bundled',
  },
  {
    id: 'lato',
    name: 'Lato',
    family: 'Lato_400Regular',
    category: 'normal',
    sample: 'Lato semi-rounded letters',
    source: 'bundled',
  },
  {
    id: 'didact-gothic',
    name: 'Didact Gothic',
    family: 'DidactGothic_400Regular',
    category: 'normal',
    sample: 'Didact Gothic',
    source: 'catalog',
    downloadUrl: fontsourceTtf('didact-gothic'),
  },
  {
    id: 'noto-sans',
    name: 'Noto Sans',
    family: 'NotoSans_400Regular',
    category: 'normal',
    sample: 'Noto Sans',
    source: 'catalog',
    downloadUrl: fontsourceTtf('noto-sans'),
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    family: 'Montserrat_600SemiBold',
    category: 'creative',
    sample: 'MONTserrat HEADLINE',
    source: 'bundled',
  },
  {
    id: 'playfair',
    name: 'Playfair Display',
    family: 'PlayfairDisplay_700Bold',
    category: 'creative',
    sample: 'Playfair elegant serif',
    source: 'bundled',
  },
  {
    id: 'oswald',
    name: 'Oswald',
    family: 'Oswald_500Medium',
    category: 'creative',
    sample: 'OSWALD CONDENSED TITLE',
    source: 'bundled',
  },
  {
    id: 'pacifico',
    name: 'Pacifico',
    family: 'Pacifico_400Regular',
    category: 'creative',
    sample: 'Pacifico',
    source: 'catalog',
    downloadUrl: fontsourceTtf('pacifico'),
  },
  {
    id: 'dancing-script',
    name: 'Dancing Script',
    family: 'DancingScript_400Regular',
    category: 'creative',
    sample: 'Dancing Script',
    source: 'catalog',
    downloadUrl: fontsourceTtf('dancing-script'),
  },
  {
    id: 'great-vibes',
    name: 'Great Vibes',
    family: 'GreatVibes_400Regular',
    category: 'creative',
    sample: 'Great Vibes',
    source: 'catalog',
    downloadUrl: fontsourceTtf('great-vibes'),
  },
  {
    id: 'satisfy',
    name: 'Satisfy',
    family: 'Satisfy_400Regular',
    category: 'creative',
    sample: 'Satisfy',
    source: 'catalog',
    downloadUrl: fontsourceTtf('satisfy'),
  },
  {
    id: 'caveat',
    name: 'Caveat',
    family: 'Caveat_400Regular',
    category: 'creative',
    sample: 'Caveat',
    source: 'catalog',
    downloadUrl: fontsourceTtf('caveat'),
  },
  {
    id: 'permanent-marker',
    name: 'Permanent Marker',
    family: 'PermanentMarker_400Regular',
    category: 'creative',
    sample: 'Permanent Marker',
    source: 'catalog',
    downloadUrl: fontsourceTtf('permanent-marker'),
  },
  {
    id: 'lobster',
    name: 'Lobster',
    family: 'Lobster_400Regular',
    category: 'creative',
    sample: 'Lobster',
    source: 'catalog',
    downloadUrl: fontsourceTtf('lobster'),
  },
  {
    id: 'indie-flower',
    name: 'Indie Flower',
    family: 'IndieFlower_400Regular',
    category: 'creative',
    sample: 'Indie Flower',
    source: 'catalog',
    downloadUrl: fontsourceTtf('indie-flower'),
  },
  {
    id: 'noto-devanagari',
    name: 'Noto Sans Devanagari',
    family: 'NotoSansDevanagari_400Regular',
    category: 'indian',
    sample: 'हिन्दी लेबल पाठ',
    sampleNative: 'हिन्दी',
    source: 'bundled',
  },
  {
    id: 'noto-tamil',
    name: 'Noto Sans Tamil',
    family: 'NotoSansTamil_400Regular',
    category: 'indian',
    sample: 'தமிழ் லேபிள் உரை',
    sampleNative: 'தமிழ்',
    source: 'bundled',
  },
  {
    id: 'noto-bengali',
    name: 'Noto Sans Bengali',
    family: 'NotoSansBengali_400Regular',
    category: 'indian',
    sample: 'বাংলা লেবেল টেক্সট',
    sampleNative: 'বাংলা',
    source: 'bundled',
  },
  {
    id: 'noto-telugu',
    name: 'Noto Sans Telugu',
    family: 'NotoSansTelugu_400Regular',
    category: 'indian',
    sample: 'తెలుగు లేబుల్ టెక్స్ట్',
    sampleNative: 'తెలుగు',
    source: 'bundled',
  },
  {
    id: 'noto-kannada',
    name: 'Noto Sans Kannada',
    family: 'NotoSansKannada_400Regular',
    category: 'indian',
    sample: 'ಕನ್ನಡ ಲೇಬಲ್ ಪಠ್ಯ',
    sampleNative: 'ಕನ್ನಡ',
    source: 'bundled',
  },
  {
    id: 'noto-malayalam',
    name: 'Noto Sans Malayalam',
    family: 'NotoSansMalayalam_400Regular',
    category: 'indian',
    sample: 'മലയാളം ലേബൽ ടെക്സ്റ്റ്',
    sampleNative: 'മലയാളം',
    source: 'bundled',
  },
  {
    id: 'noto-gujarati',
    name: 'Noto Sans Gujarati',
    family: 'NotoSansGujarati_400Regular',
    category: 'indian',
    sample: 'ગુજરાતી લેબલ ટેક્સ્ટ',
    sampleNative: 'ગુજરાતી',
    source: 'bundled',
  },
  {
    id: 'noto-gurmukhi',
    name: 'Noto Sans Gurmukhi',
    family: 'NotoSansGurmukhi_400Regular',
    category: 'indian',
    sample: 'ਪੰਜਾਬੀ ਲੇਬਲ ਟੈਕਸਟ',
    sampleNative: 'ਪੰਜਾਬੀ',
    source: 'bundled',
  },
];
