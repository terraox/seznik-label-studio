import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { AlignGlyph } from '@/components/editor/text-align-buttons';
import type { TextAlign } from '@/components/editor/types';

export type AppIconName = string;

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

/** Android has no SF Symbols; Ionicons `text` is "Aa". Use the SVG align glyphs instead. */
const ALIGN_GLYPH: Record<string, TextAlign> = {
  'text.alignleft': 'left',
  'text.aligncenter': 'center',
  'text.alignright': 'right',
  'text.justify': 'justify',
};

const ION: Record<string, IoniconsName> = {
  bluetooth: 'bluetooth',
  'exclamationmark.triangle.fill': 'warning',
  'align.horizontal.center': 'swap-horizontal-outline',
  'align.vertical.bottom': 'arrow-down-outline',
  'align.vertical.center': 'swap-vertical-outline',
  'align.vertical.top': 'arrow-up-outline',
  'antenna.radiowaves.left.and.right': 'wifi-outline',
  'arrow.clockwise': 'refresh-outline',
  'arrow.counterclockwise': 'arrow-undo-outline',
  'arrow.down': 'arrow-down-outline',
  'arrow.down.right.and.arrow.up.left': 'scan-outline',
  'arrow.left.and.right': 'swap-horizontal-outline',
  'arrow.left.to.line': 'arrow-back-outline',
  'arrow.right.to.line': 'arrow-forward-outline',
  'arrow.up': 'arrow-up-outline',
  'arrow.up.and.down': 'swap-vertical-outline',
  'arrow.up.left.and.arrow.down.right': 'expand-outline',
  'arrow.up.right.square': 'open-outline',
  'arrow.uturn.backward': 'arrow-undo-outline',
  'arrow.uturn.forward': 'arrow-redo-outline',
  'arrowtriangle.down.fill': 'chevron-down',
  'arrowtriangle.left.fill': 'chevron-back',
  'arrowtriangle.right.fill': 'chevron-forward',
  'arrowtriangle.up.fill': 'chevron-up',
  bag: 'bag-outline',
  'bag.fill': 'bag',
  'bolt.fill': 'flash',
  'battery.0': 'battery-dead',
  'battery.25': 'battery-half',
  'battery.50': 'battery-half',
  'battery.75': 'battery-full',
  'battery.100': 'battery-full',
  barcode: 'barcode-outline',
  'barcode.viewfinder': 'barcode-outline',
  character: 'text-outline',
  'circle.lefthalf.filled': 'contrast-outline',
  checkmark: 'checkmark',
  'checkmark.shield.fill': 'shield-checkmark',
  'checkmark.square': 'checkbox-outline',
  'chevron.left': 'chevron-back',
  'chevron.right': 'chevron-forward',
  clock: 'time-outline',
  'clock.arrow.circlepath': 'time-outline',
  'doc.text': 'document-text-outline',
  eye: 'eye-outline',
  'face.smiling': 'happy-outline',
  'eye.slash': 'eye-off-outline',
  ellipsis: 'ellipsis-horizontal',
  folder: 'folder-outline',
  'flashlight.off.fill': 'flash-outline',
  'flashlight.on.fill': 'flash',
  gearshape: 'settings-outline',
  'gearshape.fill': 'settings',
  globe: 'globe-outline',
  hexagon: 'stop-outline',
  'house.fill': 'home',
  'icloud.and.arrow.up': 'cloud-upload-outline',
  'info.circle': 'information-circle-outline',
  'line.diagonal': 'remove-outline',
  link: 'link-outline',
  'list.number': 'list-outline',
  'lock.fill': 'lock-closed',
  lock: 'lock-closed-outline',
  'lock.open': 'lock-open-outline',
  magnifyingglass: 'search-outline',
  mic: 'mic-outline',
  person: 'person-outline',
  photo: 'image-outline',
  'photo.artframe': 'images-outline',
  'photo.on.rectangle': 'images-outline',
  'phone.fill': 'call-outline',
  'sun.max': 'sunny-outline',
  calendar: 'calendar-outline',
  trophy: 'trophy-outline',
  plus: 'add',
  minus: 'remove',
  'arrow.up.and.down.and.arrow.left.and.right': 'move-outline',
  'plus.circle': 'add-circle-outline',
  'plus.rectangle': 'add-outline',
  'plus.square': 'add-circle-outline',
  printer: 'print-outline',
  'printer.fill': 'print',
  qrcode: 'qr-code-outline',
  'qrcode.viewfinder': 'qr-code-outline',
  'questionmark.circle.fill': 'help-circle',
  'rectangle.dashed': 'crop-outline',
  'rectangle.portrait.and.arrow.right': 'log-out-outline',
  signature: 'pencil-outline',
  'slider.horizontal.3': 'options-outline',
  share: 'share-social-outline',
  'share.social': 'share-social-outline',
  'share.social.fill': 'share-social',
  'square.and.arrow.down.on.square': 'download-outline',
  'square.and.arrow.up': 'share-outline',
  'square.and.pencil': 'create-outline',
  'square.dashed': 'square-outline',
  'square.grid.2x2': 'grid-outline',
  'square.grid.2x2.fill': 'grid',
  'square.on.circle': 'shapes-outline',
  'square.on.square': 'copy-outline',
  'square.stack.3d.up.fill': 'albums',
  tablecells: 'grid-outline',
  'tablecells.badge.ellipsis': 'grid-outline',
  tag: 'pricetag-outline',
  'tag.fill': 'pricetag',
  textformat: 'text-outline',
  'tray.and.arrow.down': 'download-outline',
  'tray.and.arrow.down.fill': 'download',
  trash: 'trash-outline',
  viewfinder: 'scan-outline',
  xmark: 'close-outline',
};

export function AppIcon({
  name,
  tintColor,
  size = 22,
  weight,
  pointerEvents,
  style,
}: {
  name: AppIconName;
  tintColor?: string;
  size?: number;
  weight?: SymbolViewProps['weight'];
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only';
  style?: StyleProp<ViewStyle>;
}) {
  // No SF Symbol for Bluetooth, so every platform uses the Ionicons glyph.
  if (Platform.OS === 'ios' && name !== 'bluetooth') {
    return (
      <SymbolView
        name={name as SymbolViewProps['name']}
        tintColor={tintColor}
        size={size}
        weight={weight}
        pointerEvents={pointerEvents}
        style={style}
      />
    );
  }

  const alignKind = ALIGN_GLYPH[name];
  if (alignKind) {
    return (
      <View
        pointerEvents={pointerEvents ?? 'auto'}
        style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <AlignGlyph kind={alignKind} color={tintColor ?? '#6B7280'} size={size} />
      </View>
    );
  }

  const glyph = ION[name] ?? 'ellipse-outline';
  return (
    <View
      pointerEvents={pointerEvents ?? 'auto'}
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons name={glyph} size={size} color={tintColor} />
    </View>
  );
}
