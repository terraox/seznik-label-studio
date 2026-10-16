import Ionicons from '@expo/vector-icons/Ionicons';

import { HOME_TOOLS, type HomeToolId } from '@/components/home/home-tools';
import { HomeLayout } from '@/constants/ui';
import { C, useThemeRefresh } from '@/theme';

export function ToolIcon({ id, color = C.accent }: { id: HomeToolId; color?: string }) {
  useThemeRefresh();
  return <Ionicons name={HOME_TOOLS[id].icon} size={HomeLayout.iconSize} color={color} />;
}
