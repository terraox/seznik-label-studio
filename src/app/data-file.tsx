import { AppIcon } from '@/components/app-icon';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { editorBridge } from '@/constants/editor-bridge';
import { cardShadow, Palette, Type } from '@/constants/ui';
import { IosAlertModal, IosAlertInput } from '@/components/ui/ios-alert-modal';
import { useExcelImportFlow, type ExcelImportSuccess } from '@/lib/use-excel-import-flow';
import { stageImportedFile } from '@/lib/user-files/stage-import';
import { useDataStore, type ImportedExcelFile } from '@/stores/data-store';

const TABS = ['All', 'Excel', 'PDF', 'CSV', 'Remote Data'] as const;

interface ImportedDataFile {
  id: string;
  name: string;
  type: 'Excel' | 'PDF' | 'CSV' | 'Other';
  sizeBytes?: number;
  uri: string;
  importedAt: number;
  excel?: ImportedExcelFile;
}

const GRID_COLUMNS = 3;
const GRID_GAP = 10;
const GRID_PAD = 12;

function formatSizeCompact(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)}M` : `${mb.toFixed(1).replace(/\.0$/, '')}M`;
}

function DataFileTypeIcon({ type }: { type: ImportedDataFile['type'] | 'URL' }) {
  if (type === 'Excel' || type === 'CSV') {
    return (
      <View style={styles.typeIconExcel}>
        <View style={styles.excelSheet} />
        <Text style={styles.typeIconLetter}>X</Text>
      </View>
    );
  }
  if (type === 'PDF') {
    return (
      <View style={styles.typeIconPdf}>
        <Text style={styles.typeIconPdfLabel}>PDF</Text>
      </View>
    );
  }
  if (type === 'URL') {
    return (
      <View style={styles.typeIconUrl}>
        <Text style={styles.typeIconUrlLabel}>URL</Text>
      </View>
    );
  }
  return (
    <View style={styles.typeIconOther}>
      <AppIcon name="doc.text" tintColor="#64748B" size={18} />
    </View>
  );
}

function DataFileGridTile({
  name,
  type,
  sizeBytes,
  width,
  editing,
  onPress,
}: {
  name: string;
  type: ImportedDataFile['type'] | 'URL';
  sizeBytes?: number;
  width: number;
  editing: boolean;
  onPress: () => void;
}) {
  const sizeLabel = formatSizeCompact(sizeBytes);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridTile,
        { width },
        editing && styles.gridTileEditing,
        pressed && styles.pressed,
      ]}>
      <View style={styles.gridTileTop}>
        <DataFileTypeIcon type={type} />
        {sizeLabel ? <Text style={styles.gridSize}>{sizeLabel}</Text> : <View />}
      </View>
      <View style={styles.gridNameWrap}>
        <Text style={styles.gridName} numberOfLines={4}>
          {name}
        </Text>
      </View>
      {editing ? (
        <View style={styles.gridEditBadge}>
          <AppIcon name="trash" tintColor="#DC2626" size={14} />
        </View>
      ) : null}
    </Pressable>
  );
}

function EmptyIllustration() {
  return (
    <View style={styles.illustration}>
      <View style={styles.boxBack} />
      <View style={styles.boxFront} />
      <View style={styles.boxFlapLeft} />
      <View style={styles.boxFlapRight} />
      <View style={styles.plane}>
        <View style={styles.planeBody} />
        <View style={styles.planeWing} />
      </View>
      <View style={styles.trail}>
        <View style={[styles.trailDot, { opacity: 0.35 }]} />
        <View style={[styles.trailDot, { opacity: 0.55 }]} />
        <View style={[styles.trailDot, { opacity: 0.75 }]} />
      </View>
    </View>
  );
}

function inferFileType(name: string): ImportedDataFile['type'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') return 'Excel';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'csv') return 'CSV';
  return 'Other';
}

export default function DataFileScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{
    type?: string | string[];
    from?: string | string[];
    labelId?: string | string[];
  }>();
  const paramType = Array.isArray(params.type) ? params.type[0] : params.type;
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const returnToLabelSettings = fromParam === 'label-settings';
  const initialTab = (paramType as (typeof TABS)[number]) || 'All';
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>(
    TABS.includes(initialTab) ? initialTab : 'All',
  );
  const [editing, setEditing] = useState(false);

  const gridTileWidth = Math.floor(
    (Math.min(windowWidth, MaxContentWidth) - GRID_PAD * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS,
  );

  const excelFiles = useDataStore((s) => s.excelFiles);
  const pdfFiles = useDataStore((s) => s.pdfFiles);
  const addExcelFile = useDataStore((s) => s.addExcelFile);
  const addPdfFile = useDataStore((s) => s.addPdfFile);
  const removeExcelFile = useDataStore((s) => s.removeExcelFile);
  const removePdfFile = useDataStore((s) => s.removePdfFile);
  const remoteLinks = useDataStore((s) => s.remoteLinks);
  const addRemoteLink = useDataStore((s) => s.addRemoteLink);
  const removeRemoteLink = useDataStore((s) => s.removeRemoteLink);
  const setActiveExcelFile = useDataStore((s) => s.setActiveExcelFile);
  const [importing, setImporting] = useState(false);
  const { importExcelFromFile, pickDocumentWithSource, excelImportModal, documentSourceSheet } =
    useExcelImportFlow();
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const files = useMemo<ImportedDataFile[]>(() => {
    const excel: ImportedDataFile[] = excelFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel',
      uri: f.uri,
      sizeBytes: f.sizeBytes,
      importedAt: f.importedAt,
      excel: f,
    }));
    const pdf: ImportedDataFile[] = pdfFiles.map((f) => ({
      id: f.id,
      name: f.name,
      type: 'PDF',
      sizeBytes: f.sizeBytes,
      uri: f.uri,
      importedAt: f.importedAt,
    }));
    return [...excel, ...pdf].sort((a, b) => b.importedAt - a.importedAt);
  }, [excelFiles, pdfFiles]);

  const finishExcelImport = async (imported: ExcelImportSuccess) => {
    const storedUri = await stageImportedFile('excel', imported.uri, imported.name);
    const entry = addExcelFile({
      name: imported.name,
      uri: storedUri,
      sizeBytes: imported.size,
      sheets: imported.sheets,
      activeSheetIndex: 0,
      hasHeaderRow: imported.hasHeaderRow,
      dataStartRow: imported.dataStartRow,
    });
    const sheet = imported.sheets[0];
    Alert.alert(
      'File Imported',
      `"${imported.name}" parsed: ${sheet?.rows.length ?? 0} rows, ${sheet?.columns.length ?? 0} columns. It is now the active data source for data-bound labels.`,
      [
        { text: 'OK' },
        {
          text: 'Print',
          onPress: () =>
            router.push({
              pathname: '/excel-data-preview',
              params: { excelFileId: entry.id },
            }),
        },
      ],
    );
  };

  const finishPdfImport = async (file: { name: string; uri: string; size?: number }) => {
    const storedUri = await stageImportedFile('pdf', file.uri, file.name);
    addPdfFile({ name: file.name, uri: storedUri, sizeBytes: file.size ?? 0 });
    Alert.alert('File Imported', `"${file.name}" was imported successfully.`, [
      { text: 'OK' },
      {
        text: 'Edit PDF',
        onPress: () =>
          router.push({
            pathname: '/pdf',
            params: { docName: file.name, docUri: storedUri },
          }),
      },
    ]);
  };

  const handleImportFile = async () => {
    if (importing) return;
    setImporting(true);
    try {
      if (activeTab === 'Excel' || activeTab === 'CSV') {
        const picked = await pickDocumentWithSource({ preset: activeTab === 'CSV' ? 'csv' : 'excel' });
        if (!picked.ok) {
          if (picked.reason === 'invalid') {
            Alert.alert(
              'Invalid File',
              activeTab === 'CSV'
                ? 'Please choose a CSV file.'
                : 'Please choose an Excel workbook (.xlsx / .xls) or CSV file.',
            );
          }
          return;
        }
        const imported = await importExcelFromFile(picked);
        if (imported) await finishExcelImport(imported);
        return;
      }

      const picked = await pickDocumentWithSource({ preset: activeTab === 'PDF' ? 'pdf' : 'any' });
      if (!picked.ok) {
        if (picked.reason === 'invalid') Alert.alert('Invalid File', 'Please choose a PDF document.');
        return;
      }

      const fileType = inferFileType(picked.name);
      if (fileType === 'PDF') {
        await finishPdfImport(picked);
        return;
      }
      if (fileType === 'Excel' || fileType === 'CSV') {
        const imported = await importExcelFromFile(picked);
        if (imported) await finishExcelImport(imported);
        return;
      }
      Alert.alert('Invalid File', 'Please choose an Excel workbook, CSV, or PDF.');
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Unable to pick or parse the document.',
      );
    } finally {
      setImporting(false);
    }
  };

  const filteredFiles = files.filter((f) => {
    if (activeTab === 'All') return true;
    if (activeTab === 'Remote Data') return false;
    if (activeTab === 'Excel') return f.type === 'Excel' || f.type === 'CSV';
    return f.type === activeTab;
  });

  const handleCreateLink = () => {
    setLinkName('');
    setLinkUrl('');
    setShowLinkModal(true);
  };

  const confirmCreateLink = () => {
    const name = linkName.trim();
    const url = linkUrl.trim();
    if (!name) {
      Alert.alert('Name Required', 'Enter a name for this data link.');
      return;
    }
    if (!url || !/^https?:\/\//i.test(url)) {
      Alert.alert('Invalid URL', 'Enter a valid http:// or https:// URL.');
      return;
    }
    addRemoteLink({ name, url });
    setShowLinkModal(false);
    Alert.alert('Link Saved', `"${name}" was added to Remote Data.`);
  };

  const openRemoteLink = (url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Unavailable', 'Could not open this link on your device.'),
    );
  };

  const handleFooterPress = () => {
    if (activeTab === 'Remote Data') {
      handleCreateLink();
      return;
    }
    handleImportFile();
  };

  const openFile = (item: ImportedDataFile) => {
    if (returnToLabelSettings) {
      if (!item.excel) return;
      editorBridge.dataSourceFileId = item.excel.id;
      router.back();
      return;
    }
    if (item.excel) {
      setActiveExcelFile(item.excel.id);
      router.push({
        pathname: '/excel-data-preview',
        params: { excelFileId: item.excel.id },
      });
    } else if (item.type === 'PDF') {
      router.push({
        pathname: '/pdf',
        params: { docName: item.name, docUri: item.uri },
      });
    } else {
      router.push({
        pathname: '/print',
        params: { docName: item.name, docUri: item.uri, docType: item.type },
      });
    }
  };

  const confirmRemoveFile = (item: ImportedDataFile) => {
    Alert.alert('Remove File', `Remove "${item.name}" from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => (item.excel ? removeExcelFile(item.id) : removePdfFile(item.id)),
      },
    ]);
  };

  const handleFileTilePress = (item: ImportedDataFile) => {
    if (editing) {
      confirmRemoveFile(item);
      return;
    }
    openFile(item);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <AppIcon name="chevron.left" tintColor="#FFFFFF" size={22} />
        </Pressable>

        <Text style={styles.headerTitle}>Data File</Text>
        <Pressable
          onPress={() => setEditing((v) => !v)}
          hitSlop={8}
          style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}>
          <Text style={[styles.editBtnText, editing && styles.editBtnTextActive]}>
            {editing ? 'Done' : 'Edit'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = tab === activeTab;
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={({ pressed }) => [styles.tabItem, active && styles.tabItemActive, pressed && styles.pressed]}>
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}>
                {tab}
              </Text>
              {active ? <View style={styles.tabIndicator} /> : <View style={styles.tabIndicatorSpacer} />}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {activeTab === 'Remote Data' ? (
          remoteLinks.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyIllustration />
              <Text style={styles.emptyText}>No remote data links yet</Text>
              <Text style={styles.emptyHint}>
                Save a URL to a shared spreadsheet or CSV hosted online for quick access.
              </Text>
            </View>
          ) : (
            <FlatList
              data={remoteLinks}
              keyExtractor={(item) => item.id}
              numColumns={GRID_COLUMNS}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.gridContent}
              renderItem={({ item }) => (
                <DataFileGridTile
                  name={item.name}
                  type="URL"
                  width={gridTileWidth}
                  editing={editing}
                  onPress={() => {
                    if (editing) {
                      Alert.alert('Remove Link', `Remove "${item.name}"?`, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => removeRemoteLink(item.id),
                        },
                      ]);
                      return;
                    }
                    openRemoteLink(item.url);
                  }}
                />
              )}
            />
          )
        ) : filteredFiles.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyIllustration />
            <Text style={styles.emptyText}>No data file was found</Text>
            {activeTab === 'Excel' || activeTab === 'All' ? (
              <Text style={styles.emptyHint}>
                Import an Excel workbook (.xlsx / .xls) or CSV to use as label data.
              </Text>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filteredFiles}
            keyExtractor={(item) => item.id}
            numColumns={GRID_COLUMNS}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            renderItem={({ item }) => (
              <DataFileGridTile
                name={item.name}
                type={item.type}
                sizeBytes={item.sizeBytes}
                width={gridTileWidth}
                editing={editing}
                onPress={() => handleFileTilePress(item)}
              />
            )}
          />
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        <Pressable
          onPress={handleFooterPress}
          style={({ pressed }) => [styles.importBtn, pressed && styles.pressed]}>
          <Text style={styles.importBtnText}>
            {activeTab === 'Remote Data' ? 'Create Link' : 'Import File'}
          </Text>
        </Pressable>
      </View>

      <IosAlertModal
        visible={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        title="Create Data Link"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setShowLinkModal(false) },
          { text: 'Save', style: 'default', bold: true, onPress: confirmCreateLink },
        ]}>
        <IosAlertInput
          value={linkName}
          onChangeText={setLinkName}
          placeholder="Link name"
          autoFocus
        />
        <IosAlertInput
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="https://example.com/data.csv"
          autoCapitalize="none"
          keyboardType="url"
          style={{ marginTop: 8 }}
        />
      </IosAlertModal>
      {documentSourceSheet}
      {excelImportModal}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '500',
  },
  editBtn: {
    width: 52,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  editBtnText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '500',
  },
  editBtnTextActive: {
    fontWeight: '700',
  },
  tabBar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    backgroundColor: Palette.header,
    flexDirection: 'row',
    paddingBottom: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 6,
    minWidth: 0,
  },
  tabItemActive: {},
  tabText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  tabIndicator: {
    marginTop: 8,
    alignSelf: 'stretch',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  tabIndicatorSpacer: {
    marginTop: 8,
    height: 3,
  },
  body: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  illustration: {
    width: 160,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxBack: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#B8DDF5',
    borderRadius: 4,
  },
  boxFront: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#9ECAE8',
    borderTopWidth: 2,
    borderTopColor: '#7FB8DC',
    borderRadius: 4,
  },
  boxFlapLeft: {
    position: 'absolute',
    bottom: 68,
    left: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7',
    transform: [{ skewX: '-24deg' }],
    borderTopLeftRadius: 3,
  },
  boxFlapRight: {
    position: 'absolute',
    bottom: 68,
    right: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7',
    transform: [{ skewX: '24deg' }],
    borderTopRightRadius: 3,
  },
  plane: {
    position: 'absolute',
    top: 8,
    right: 18,
    width: 34,
    height: 34,
    transform: [{ rotate: '-18deg' }],
  },
  planeBody: {
    position: 'absolute',
    top: 14,
    left: 0,
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8',
  },
  planeWing: {
    position: 'absolute',
    top: 8,
    left: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#8EC5E8',
  },
  trail: {
    position: 'absolute',
    top: 24,
    right: 52,
    flexDirection: 'row',
    gap: 5,
    transform: [{ rotate: '-18deg' }],
  },
  trailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8',
  },
  emptyText: {
    color: '#8E97A1',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyHint: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  gridContent: {
    paddingHorizontal: GRID_PAD,
    paddingTop: GRID_PAD,
    paddingBottom: GRID_PAD,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridTile: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    minHeight: 118,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    ...cardShadow,
  },
  gridTileEditing: {
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  gridTileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  gridSize: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
    maxWidth: '50%',
    textAlign: 'right',
  },
  gridNameWrap: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  gridName: {
    fontSize: 12,
    lineHeight: 16,
    color: '#334155',
    textAlign: 'center',
    fontWeight: '500',
  },
  gridEditBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 4,
  },
  typeIconPdf: {
    width: 26,
    height: 30,
    borderRadius: 3,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 3,
  },
  typeIconPdfLabel: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  typeIconExcel: {
    width: 26,
    height: 30,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  excelSheet: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 14,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderTopLeftRadius: 2,
  },
  typeIconLetter: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  typeIconUrl: {
    width: 26,
    height: 30,
    borderRadius: 3,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIconUrlLabel: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '800',
  },
  typeIconOther: {
    width: 26,
    height: 30,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: Spacing.two,
    backgroundColor: '#F4F5F7',
  },
  importBtn: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  importBtnText: {
    color: '#FFFFFF',
    ...Type.button,
  },
  pressed: {
    opacity: 0.65,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalSaveBtn: {
    backgroundColor: '#17A6B8',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
