import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { ShareNodeIcon } from '@/components/home-icons';
import { CATALOG_STOCK_LINER, LabelPreview } from '@/components/label-preview';
import { androidRipple, HomeLayout, scaleFont } from '@/constants/ui';
import { composeUpsDocument, type LabelDocument } from '@/lib/label-document';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type ContinueCardProps = {
  document: LabelDocument;
  onDelete: () => void;
};

function ActionItem({
  icon,
  label,
  disabled,
  onPress,
  customIcon,
}: {
  icon?: AppIconName;
  label: string;
  disabled?: boolean;
  onPress?: () => void;
  customIcon?: ReactNode;
}) {
  useThemeRefresh();
  const color = disabled ? C.textDisabled : C.accent;

  return (
    <View style={styles.actionItem}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        hitSlop={8}
        android_ripple={androidRipple}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.actionPressable,
          pressed && !disabled && styles.pressed,
        ]}>
        {customIcon ? (
          customIcon
        ) : icon ? (
          <AppIcon name={icon} tintColor={color} size={23} pointerEvents="none" />
        ) : null}
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
          style={[styles.actionLabel, { color: disabled ? C.textDisabled : C.textSecondary }]}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

export function ContinueCard({ document, onDelete }: ContinueCardProps) {
  useThemeRefresh();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Multi-up labels edit one panel at a time; show the whole row as it prints, not panel 1.
  const previewDocument = useMemo(
    () => ((document.ups?.columns ?? 0) >= 2 ? composeUpsDocument(document) : document),
    [document],
  );

  const sizeLabel = `${document.widthMm.toFixed(0)} x ${document.heightMm.toFixed(0)} (${document.paperType})`;

  const handleDelete = () => {
    Alert.alert('Delete Label', `Delete "${document.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={styles.cardFrame}>
    <View style={styles.card}>
      <View style={[styles.headingBar, width < 360 && styles.headingBarStacked]}>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
          style={[styles.headingTitle, { fontSize: scaleFont(width, 14.5, 0.85, 1.05) }]}>
          {document.name}
        </Text>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
          style={[
            styles.headingSize,
            width < 360 && styles.headingSizeStacked,
            { fontSize: scaleFont(width, 13, 0.85, 1.05) },
          ]}>
          {sizeLabel}
        </Text>
      </View>

      {/* catalogStock uses HiFi paint-then-scale so QR/text stay visible at card size */}
      <View style={styles.previewStage}>
        <LabelPreview
          document={previewDocument}
          catalogStock
          maxHeight={HomeLayout.continuePreviewMaxHeight}
        />
      </View>

      <View style={styles.actionRow}>
        <ActionItem
          icon="square.and.pencil"
          label="Edit"
          onPress={() =>
            router.push({ pathname: '/edit', params: { labelId: document.id } })
          }
        />
        <ActionItem
          icon="printer"
          label="Print"
          onPress={() =>
            router.push({ pathname: '/print', params: { labelId: document.id } })
          }
        />
        <ActionItem icon="trash" label="Delete" onPress={handleDelete} />
        <ActionItem
          customIcon={<ShareNodeIcon color={C.accent} size={24} />}
          label="Share"
          onPress={() =>
            router.push({ pathname: '/share', params: { labelId: document.id } })
          }
        />
      </View>
    </View>
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  // Shadow stays on the outer view. overflow:hidden on the same view as the light-mode
  // Android boxShadow hides the whole card.
  cardFrame: {
    borderRadius: 16,
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
    ...(scheme === 'light'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }
      : null),
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  headingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: c.header,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 46,
  },
  headingBarStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  headingTitle: {
    color: c.onAccent,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  headingSize: {
    color: 'rgba(255, 255, 255, 0.88)', // theme-fixed: white on preview overlay
    fontWeight: '500',
    flexShrink: 0,
    maxWidth: '48%',
    textAlign: 'right',
  },
  headingSizeStacked: {
    maxWidth: '100%',
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  previewStage: {
    width: '100%',
    backgroundColor: CATALOG_STOCK_LINER,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E7EE', // theme-fixed: light preview (previewStage)
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: c.surface,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  actionItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  actionPressable: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  actionLabel: {
    fontSize: 12.5,
    fontWeight: '500',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
}));
