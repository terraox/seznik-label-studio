import { StyleSheet, View } from 'react-native';

import { ToolTile } from '@/components/home/tool-tile';
import type { HomeToolId } from '@/components/home/home-tools';
import { HomeLayout } from '@/constants/ui';

/** One row of tiles; the row shares its width equally, so 3 or 4 ids both fill it. */
export function ToolGrid({ ids }: { ids: readonly HomeToolId[] }) {
  const minHeight = HomeLayout.tileHeight;

  return (
    <View style={styles.row} /* layout-ok: tiles flex to share the row */>
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
