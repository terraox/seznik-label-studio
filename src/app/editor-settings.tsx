import { Alert } from 'react-native';
import { useEffect } from 'react';

import {
  SettingsActionCard,
  SettingsCard,
  SettingsColorRow,
  SettingsScreenShell,
  SettingsStepperRow,
  SettingsToggleGroup,
  SettingsToggleRow,
} from '@/components/settings-ui';
import { clampGridSpacingMm } from '@/lib/editor/canvas-grid';
import { requestEditorGridToggle } from '@/lib/editor/editor-grid-toggle';
import {
  EDITOR_BORDER_SELECTION_COLORS,
  EDITOR_GRID_COLORS,
  EDITOR_TABLE_SELECTION_COLORS,
  useSettingsStore,
} from '@/stores/settings-store';

function gridColorIndex(hex: string): number {
  const idx = EDITOR_GRID_COLORS.indexOf(hex as (typeof EDITOR_GRID_COLORS)[number]);
  return idx >= 0 ? idx : 0;
}

export default function EditorSettingsScreen() {
  const editor = useSettingsStore((s) => s.editor);
  const {
    showColumnName,
    highlightColumnName,
    pictureAdsorption,
    editorGrid,
    editorGridSpacingMm,
    editorGridColor,
    borderColorIndex: storedBorderColorIndex,
    tableColorIndex: storedTableColorIndex,
  } = editor;
  const borderColorIndex = Math.max(
    0,
    Math.min(EDITOR_BORDER_SELECTION_COLORS.length - 1, storedBorderColorIndex),
  );
  const tableColorIndex = Math.max(
    0,
    Math.min(EDITOR_TABLE_SELECTION_COLORS.length - 1, storedTableColorIndex),
  );
  const patchEditor = useSettingsStore((s) => s.patchEditor);
  const restoreEditorDefaults = useSettingsStore((s) => s.restoreEditorDefaults);

  const setEditorGrid = (v: boolean) => requestEditorGridToggle(v, patchEditor);

  useEffect(() => {
    if (storedBorderColorIndex !== borderColorIndex || storedTableColorIndex !== tableColorIndex) {
      patchEditor({
        ...(storedBorderColorIndex !== borderColorIndex ? { borderColorIndex } : {}),
        ...(storedTableColorIndex !== tableColorIndex ? { tableColorIndex } : {}),
      });
    }
  }, [storedBorderColorIndex, storedTableColorIndex, borderColorIndex, tableColorIndex, patchEditor]);

  const restoreDefaults = () => {
    restoreEditorDefaults();
    Alert.alert('Defaults Restored', 'Editor settings have been reset.');
  };

  return (
    <SettingsScreenShell title="Editor Settings">
      <SettingsCard>
        <SettingsToggleRow
          label="Display Data Column Name"
          value={showColumnName}
          onValueChange={(v) => patchEditor({ showColumnName: v })}
          showDivider
        />
        <SettingsToggleRow
          label="Highlight Data Column Name"
          value={highlightColumnName}
          onValueChange={(v) => patchEditor({ highlightColumnName: v })}
        />
      </SettingsCard>

      <SettingsToggleGroup
        label="Picture Adsorption"
        value={pictureAdsorption}
        onValueChange={(v) => patchEditor({ pictureAdsorption: v })}
        description="Place a Image or Logo close to the QR code and it will automatically be displayed in the center of the QR code."
      />

      <SettingsCard>
        <SettingsToggleRow
          label="Editor Grid"
          value={editorGrid}
          onValueChange={setEditorGrid}
          showDivider={editorGrid}
        />
        {editorGrid ? (
          <>
            <SettingsStepperRow
              label="Size of Grid"
              value={`${editorGridSpacingMm.toFixed(2)} mm`}
              minusDisabled={editorGridSpacingMm <= 1}
              onMinus={() =>
                patchEditor({
                  editorGridSpacingMm: clampGridSpacingMm(editorGridSpacingMm - 0.5),
                })
              }
              onPlus={() =>
                patchEditor({
                  editorGridSpacingMm: clampGridSpacingMm(editorGridSpacingMm + 0.5),
                })
              }
              showDivider
            />
            <SettingsColorRow
              label="Color of Grid"
              colors={[...EDITOR_GRID_COLORS]}
              selectedIndex={gridColorIndex(editorGridColor)}
              onSelect={(index) =>
                patchEditor({ editorGridColor: EDITOR_GRID_COLORS[index] ?? EDITOR_GRID_COLORS[0] })
              }
            />
          </>
        ) : null}
      </SettingsCard>

      <SettingsCard>
        <SettingsColorRow
          label="Color of The Selected Border"
          colors={[...EDITOR_BORDER_SELECTION_COLORS]}
          selectedIndex={borderColorIndex}
          onSelect={(v) =>
            patchEditor({
              borderColorIndex: Math.max(0, Math.min(EDITOR_BORDER_SELECTION_COLORS.length - 1, v)),
            })
          }
          showDivider
        />
        <SettingsColorRow
          label="Color of The Selected Table Cell"
          colors={[...EDITOR_TABLE_SELECTION_COLORS]}
          selectedIndex={tableColorIndex}
          onSelect={(v) =>
            patchEditor({
              tableColorIndex: Math.max(0, Math.min(EDITOR_TABLE_SELECTION_COLORS.length - 1, v)),
            })
          }
        />
      </SettingsCard>

      <SettingsActionCard label="Restore Defaults" danger onPress={restoreDefaults} />
    </SettingsScreenShell>
  );
}
