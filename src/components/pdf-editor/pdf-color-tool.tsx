import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PdfScopeSelector } from '@/components/pdf-editor/pdf-scope-selector';

import { parsePageRange, type PageScope, type PdfColorMode } from '@/lib/pdf-editor/session';
import { themedStyles, useThemeRefresh } from '@/theme';

const MODES: { id: PdfColorMode; label: string; help: string }[] = [
  { id: 'Original', label: 'Original', help: 'Keep the PDF colors.' },
  { id: 'B & W', label: 'B & W', help: 'Solid black and white. Best for text and barcodes.' },
  { id: 'Halftone', label: 'Halftone', help: 'Dithered grays for photos. Print uses the printer bridge.' },
];

export function PdfColorTool({
  value,
  pageCount,
  onChange,
}: {
  value: PdfColorMode;
  pageCount: number;
  onChange: (mode: PdfColorMode, scope: PageScope) => void;
}) {
  useThemeRefresh();
  const [scope, setScope] = useState<PageScope>({ mode: pageCount < 2 ? 'this' : 'all' });
  const help = MODES.find((mode) => mode.id === value)?.help;
  const rangeError =
    scope.mode === 'range' ? parsePageRange(String(scope.start), String(scope.end), pageCount).error : undefined;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {MODES.map((mode) => (
          <Pressable
            key={mode.id}
            onPress={() => onChange(mode.id, scope)}
            style={[styles.btn, value === mode.id && styles.btnOn]}>
            <Text style={[styles.btnText, value === mode.id && styles.btnTextOn]}>{mode.label}</Text>
          </Pressable>
        ))}
      </View>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      <PdfScopeSelector
        scope={scope}
        pageCount={pageCount}
        rangeError={rangeError}
        onChange={(next) => {
          const resolved =
            next.mode === 'range'
              ? {
                  mode: 'range' as const,
                  start: parsePageRange(String(next.start), String(next.end), pageCount).start,
                  end: parsePageRange(String(next.start), String(next.end), pageCount).end,
                }
              : next;
          setScope(resolved);
          onChange(value, resolved);
        }}
      />
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.hairline,
  },
  btnOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  btnText: { fontSize: 13, color: c.textSecondary },
  btnTextOn: { color: c.accent, fontWeight: '700' },
  help: { fontSize: 12, color: c.textMuted },
}));
