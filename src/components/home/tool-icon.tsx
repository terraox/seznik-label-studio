import Ionicons from '@expo/vector-icons/Ionicons';

import { HOME_TOOLS, type HomeToolId } from '@/components/home/home-tools';
import { HomeLayout, Palette } from '@/constants/ui';

export function ToolIcon({ id, color = Palette.accent }: { id: HomeToolId; color?: string }) {
  return <Ionicons name={HOME_TOOLS[id].icon} size={HomeLayout.iconSize} color={color} />;
}
