import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { HOME_TOOLS, type HomeTool, type HomeToolId } from '@/components/home/home-tools';
import { HomeLayout } from '@/constants/ui';
import { C, useThemeRefresh } from '@/theme';

export function ToolIcon({ id, color = C.accent }: { id: HomeToolId; color?: string }) {
  useThemeRefresh();
  const tool: HomeTool = HOME_TOOLS[id];
  if (tool.materialIcon) {
    return <MaterialCommunityIcons name={tool.materialIcon} size={HomeLayout.iconSize} color={color} />;
  }
  return <Ionicons name={tool.icon} size={HomeLayout.iconSize} color={color} />;
}
