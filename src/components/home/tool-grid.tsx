import { StyleSheet, View } from 'react-native';

import { ToolTile } from '@/components/home/tool-tile';
import type { HomeToolId } from '@/components/home/home-tools';
import { HomeLayout } from '@/constants/ui';

export function ToolGrid({
  ids,
  columns = HomeLayout.gridColumns,
}: {
  ids: readonly HomeToolId[];
  columns?: 3 | 4;
}) {
  const minHeight =
    columns === 4 ? HomeLayout.labelTypeTileHeight : HomeLayout.tileHeight;

  return (
    <View style={styles.row}>
      {ids.map((id) => (
        <ToolTile key={id} id={id} minHeight={minHeight} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: HomeLayout.gap,
    width: '100%',
  },
});
