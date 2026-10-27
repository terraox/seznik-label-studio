import { composeUpsDocument, createLabelDocument, type LabelElement } from '@/lib/label-document';
import type { AcrossMode } from '@/lib/across';
import { useFocusEffect, useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useCallback, useMemo, useRef, useState, memo } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Alert,
} from 'react-native';
import { TextInput } from '@/components/ui/text-input';
import { FadeInItem, PopOnActive } from '@/components/ui/motion';
import { EmptyState } from '@/components/ui/empty-state';
import { TipBanner } from '@/components/ui/tip-banner';
import { TemplateQuickView } from '@/components/template-quick-view';
import { useTipsStore } from '@/stores/tips-store';
import { Skeleton } from '@/components/ui/skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { IosAlertModal, IosAlertInput } from '@/components/ui/ios-alert-modal';
import { TemplateRequestModal, type TemplateRequestDraft } from '@/components/template-request-form';
import { trackFeatureClick, trackTemplateRequest } from '@/lib/telemetry/events';
import { LabelPreview } from '@/components/label-preview';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { createIndustryTemplateDocument } from '@/constants/template-documents';
import { JEWELRY_DIECUT_PREVIEW_SHEET } from '@/constants/jewelry-diecut';
import { useTemplateCatalogStore, type CatalogTemplate } from '@/stores/template-catalog-store';
import { sampleToElements } from '@/lib/template-sample-elements';
import type { SampleElement } from '@/lib/template-sample';
import { useAuthStore } from '@/stores/auth-store';
import { useLabelStore } from '@/stores/label-store';
import { useSavedSetupStore } from '@/stores/saved-setup-store';
import { useOpenLabelFile } from '@/lib/label-share/use-open-label-file';
import { useTranslation } from '@/lib/i18n';
import { templateLayout } from '@/lib/layout/screen-sizes';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

function formatCatalogMm(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function catalogDimensions(widthMm: number, heightMm: number): string {
  return `${formatCatalogMm(widthMm)} x ${formatCatalogMm(heightMm)}`;
}

const CatalogCardInfo = memo(function CatalogCardInfo({
  name,
  widthMm,
  heightMm,
  category,
  showCategory,
}: {
  name: string;
  widthMm: number;
  heightMm: number;
  category: string;
  showCategory: boolean;
}) {
  useThemeRefresh();
  return (
    <View style={styles.cardInfo}>
      <View style={styles.infoText}>
        {showCategory && category ? (
          <Text numberOfLines={1} style={styles.infoCategory}>
            {category}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={styles.infoTitle}>
          {name}
        </Text>
      </View>
      <View style={styles.sizeChip}>
        <Text style={styles.sizeChipText}>{catalogDimensions(widthMm, heightMm)} mm</Text>
      </View>
    </View>
  );
});

/** The Industry list's first entry: every published template, whatever its categories. */
const ALL_CATEGORY = '__all__';
/** Listed right under All, only while at least one template is starred. */
const FAVORITES_CATEGORY = '__favorites__';

/** The sample content stored for the template, or the built-in starter when none was stored yet. */
/** Two-up catalogue sheets can be edited together on one canvas or one label at a time (cable and jewellery sheets keep their own layout). */
function isTwoUpTemplate(t: CatalogTemplate): boolean {
  return /2up|two up/i.test(t.name) && !/cable|jewel/i.test(t.name);
}

/** Off: the built-in rat-tail die-cut forced 54 x 96 mm, so jewellery now opens at the size set in the admin panel, drawn from its own SVG. */
function isJewellerySheetTemplate(_t: CatalogTemplate): boolean {
  return false;
}

function templateSampleLayout(t: CatalogTemplate): SampleElement[] {
  // Only a design the admin saved with the template. No made-up starter content.
  if (Array.isArray(t.sampleLayout) && t.sampleLayout.length > 0) return t.sampleLayout as SampleElement[];
  return [];
}

/** The template's own SVG with its sample content on top, drawn by the same renderer as the editor. */
const TemplatePreview = memo(function TemplatePreview({ item }: { item: CatalogTemplate }) {
  useThemeRefresh();
  const sampleDoc = useMemo(() => {
    if (isJewellerySheetTemplate(item)) {
      return createIndustryTemplateDocument({
        name: item.name,
        category: 'Jewelry',
        widthMm: item.widthMm,
        heightMm: item.heightMm,
        previewType: JEWELRY_DIECUT_PREVIEW_SHEET,
      });
    }
    const layout = templateSampleLayout(item);
    if (layout.length === 0) return null;
    const singleCircle = /circle/i.test(item.name) && !/2up|two up/i.test(item.name);
    const doc = createLabelDocument({
      name: item.name,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      ...(singleCircle ? { mediaShape: 'circle' as const } : { background: { type: 'none' as const } }),
    });
    if (!singleCircle) doc.templateSvg = { xml: item.svgCode };
    doc.elements = sampleToElements(layout, item.widthMm, item.heightMm);
    return doc;
  }, [item]);
  if (sampleDoc) return <LabelPreview document={sampleDoc} catalogStock showMeasure />;
  return (
    <View style={styles.svgPreviewWrap}>
      <View style={{ width: '100%', aspectRatio: item.widthMm / item.heightMm, maxHeight: 220 }}>
        <SvgXml xml={item.svgCode} width="100%" height="100%" />
      </View>
    </View>
  );
});

const IndustryTemplateCard = memo(function IndustryTemplateCard({
  item,
  category,
  showCategory,
  cardMaxWidth,
  isFavorite,
  onPress,
  onLongPress,
  onToggleFavorite,
}: {
  item: CatalogTemplate;
  category: string;
  showCategory: boolean;
  cardMaxWidth: number;
  isFavorite: boolean;
  onPress: (item: CatalogTemplate) => void;
  onLongPress: (item: CatalogTemplate) => void;
  onToggleFavorite: (id: string) => void;
}) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.templateCard,
        { maxWidth: cardMaxWidth, width: '100%' },
        pressed && styles.cardPressed,
      ]}>
      <View>
        <TemplatePreview item={item} />
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
          onPress={() => onToggleFavorite(item.id)}
          style={({ pressed }) => [styles.favoriteBadge, pressed && styles.cardPressed]}>
          <PopOnActive active={isFavorite}>
            <AppIcon name={isFavorite ? 'star.fill' : 'star'} tintColor={isFavorite ? C.warning : C.textMuted} size={18} />
          </PopOnActive>
        </Pressable>
      </View>
      <CatalogCardInfo
        name={item.name}
        widthMm={item.widthMm}
        heightMm={item.heightMm}
        category={category}
        showCategory={showCategory}
      />
    </Pressable>
  );
});

function TemplateLocalEmptyIllustration() {
  useThemeRefresh();
  return (
    <View style={styles.localEmptyIllustration}>
      <View style={styles.localEmptyBoxBack} />
      <View style={styles.localEmptyBoxFront} />
      <View style={styles.localEmptyFlapLeft} />
      <View style={styles.localEmptyFlapRight} />
      <View style={styles.localEmptyPlane}>
        <View style={styles.localEmptyPlaneBody} />
        <View style={styles.localEmptyPlaneWing} />
      </View>
      <View style={styles.localEmptyTrail}>
        <View style={[styles.localEmptyTrailDot, { opacity: 0.35 }]} />
        <View style={[styles.localEmptyTrailDot, { opacity: 0.55 }]} />
        <View style={[styles.localEmptyTrailDot, { opacity: 0.75 }]} />
      </View>
    </View>
  );
}

export default function TemplateScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const tabPad = useTabBarPadding(Spacing.six);
  const router = useRouter();
  const { openLabelFile, documentSourceSheet } = useOpenLabelFile('push');
  const { width: windowWidth } = useWindowDimensions();

  const { layoutWidth, cardMaxWidth: templateCardMaxWidth } = templateLayout(windowWidth);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'local' | 'industry'>('industry');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [localGroup, setLocalGroup] = useState<string>('All');
  const [sortNewestFirst] = useState(true);
  const [newGroupVisible, setNewGroupVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const documents = useLabelStore((s) => s.documents);
  const groups = useLabelStore((s) => s.groups);
  const addGroup = useLabelStore((s) => s.addGroup);
  // Labels an Excel saved setup was made from get a "Saved setup" mark in the Local list.
  const savedSetups = useSavedSetupStore((s) => s.setups);
  const setupLabelIds = useMemo(
    () => new Set(savedSetups.flatMap((s) => (s.sourceLabelId ? [s.sourceLabelId] : []))),
    [savedSetups],
  );
  const deleteDocument = useLabelStore((s) => s.deleteDocument);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const { t } = useTranslation();
  const catalogCategories = useTemplateCatalogStore((s) => s.categories);
  const catalogTemplates = useTemplateCatalogStore((s) => s.templates);
  const refreshCatalog = useTemplateCatalogStore((s) => s.refresh);
  const authToken = useAuthStore((s) => s.token);

  const catalogLoading = useTemplateCatalogStore((s) => s.loading);
  const favoriteIds = useTemplateCatalogStore((s) => s.favoriteIds);
  const toggleFavorite = useTemplateCatalogStore((s) => s.toggleFavorite);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const hasFavorites = catalogTemplates.some((t) => favoriteSet.has(t.id));
  // Only starring counts as a tap on the feature; un-starring is undoing it.
  const onToggleFavorite = useCallback(
    (id: string) => {
      if (!useTemplateCatalogStore.getState().favoriteIds.includes(id)) {
        trackFeatureClick('templates.favourite');
        useTipsStore.getState().markSeen('templates.star');
      }
      toggleFavorite(id);
    },
    [toggleFavorite],
  );

  // The tab stays mounted, so fetch again every time it comes into view: templates published
  // in the admin since the last visit show up without restarting the app.
  useFocusEffect(
    useCallback(() => {
      void refreshCatalog();
    }, [refreshCatalog, authToken]),
  );

  // "All" comes first and is the default, then Favourites while any are starred; an admin
  // category only while it still exists.
  const activeCategoryId =
    (selectedCategory === FAVORITES_CATEGORY && hasFavorites) ||
    catalogCategories.some((c) => c.id === selectedCategory)
      ? selectedCategory
      : ALL_CATEGORY;
  const categoryNames = useMemo(
    () => new Map(catalogCategories.map((c) => [c.id, c.name])),
    [catalogCategories],
  );

  const localDocuments = useMemo(() => {
    const sorted = [...documents].sort((a, b) =>
      sortNewestFirst ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt,
    );
    let list = sorted;
    if (localGroup === 'Ungrouped') list = sorted.filter((d) => !d.groupId);
    else if (localGroup !== 'All') list = sorted.filter((d) => d.groupId === localGroup);
    const q = searchQuery.toLowerCase().trim();
    if (q) list = list.filter((d) => d.name.toLowerCase().includes(q));
    return list;
  }, [documents, localGroup, searchQuery, sortNewestFirst]);

  const rightScrollRef = useRef<ScrollView>(null);

  const handleCategoryPress = (category: string) => {
    setSelectedCategory(category);
    rightScrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // Filter templates by selected category or search query
  const filteredTemplates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      return catalogTemplates.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          `${t.widthMm} x ${t.heightMm}`.includes(q) ||
          t.categoryIds.some((id) => (categoryNames.get(id) ?? '').toLowerCase().includes(q)),
      );
    }
    if (activeCategoryId === ALL_CATEGORY) return catalogTemplates;
    if (activeCategoryId === FAVORITES_CATEGORY) return catalogTemplates.filter((t) => favoriteSet.has(t.id));
    return catalogTemplates.filter((t) => t.categoryIds.includes(activeCategoryId));
  }, [searchQuery, activeCategoryId, catalogTemplates, categoryNames, favoriteSet]);

  const [quickView, setQuickView] = useState<CatalogTemplate | null>(null);
  const [choiceFor, setChoiceFor] = useState<{ template: CatalogTemplate; mode: AcrossMode } | null>(null);
  const [arrangeFor, setArrangeFor] = useState<CatalogTemplate | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const sendTemplateRequest = (draft: TemplateRequestDraft) => {
    setRequestOpen(false);
    // Queued on the phone and sent to the admin desk's Template requests with the next batch of events.
    trackTemplateRequest({ ...draft, searchText: searchQuery });
    Alert.alert('Request sent', 'Thank you. We will add this label to the templates.');
  };

  /** The 2-up sheet as labels edited one at a time: one cell-sized label with a panel per column. */
  const openSeparate = useCallback(
    (template: CatalogTemplate, withSample: boolean) => {
      const columns = 2;
      const cellW = template.widthMm / columns;
      const round = /circle/i.test(template.name) && Math.abs(cellW - template.heightMm) < 0.01;
      const doc = createLabelDocument({
        name: template.name,
        widthMm: cellW,
        heightMm: template.heightMm,
        ...(round ? { mediaShape: 'circle' as const } : {}),
        background: { type: 'color', color: '#FFFFFF' }, // theme-fixed: label paper colour (document data)
      });
      const all = withSample ? sampleToElements(templateSampleLayout(template), template.widthMm, template.heightMm) : [];
      const panels: LabelElement[][] = Array.from({ length: columns }, (_, i) =>
        all
          .filter((el) => Math.min(columns - 1, Math.max(0, Math.floor((el.left + el.width / 2) / cellW))) === i)
          .map((el) => ({ ...el, left: el.left - i * cellW })),
      );
      doc.ups = { columns, columnSpacingMm: 0, batchEdit: false, activeIndex: 0, panels };
      doc.elements = panels[0];
      doc.templateCategory = 'Multi-UP';
      upsertDocument(doc);
      router.push({ pathname: '/edit', params: { labelId: doc.id } });
    },
    [router, upsertDocument],
  );

  const openTemplate = useCallback(
    (template: CatalogTemplate, withSample: boolean, mode: AcrossMode = 'together') => {
      if (mode === 'separate' && isTwoUpTemplate(template)) {
        openSeparate(template, withSample);
        return;
      }
      const category = categoryNames.get(template.categoryIds[0] ?? '') ?? '';
      const isJewellery = isJewellerySheetTemplate(template);
      const singleCircle = /circle/i.test(template.name) && !/2up|two up/i.test(template.name);
      const doc = isJewellery
        ? createIndustryTemplateDocument({
            name: template.name,
            category,
            widthMm: template.widthMm,
            heightMm: template.heightMm,
            previewType: JEWELRY_DIECUT_PREVIEW_SHEET,
          })
        : createLabelDocument({
            name: template.name,
            widthMm: template.widthMm,
            heightMm: template.heightMm,
            ...(singleCircle
              ? { mediaShape: 'circle' as const }
              : { background: { type: 'none' as const } }),
          });
      // Every other shape (rounded, 2-up circles, cable) is drawn from the template's own SVG.
      if (!isJewellery && !singleCircle) doc.templateSvg = { xml: template.svgCode };
      const layout = templateSampleLayout(template);
      if (!withSample) doc.elements = [];
      else if (!isJewellery && layout.length) doc.elements = sampleToElements(layout, template.widthMm, template.heightMm);
      // Edited together, the cells are still known so borders can go one per label or around all.
      if (isTwoUpTemplate(template)) {
        doc.across = { columns: 2, gapMm: 0, ...(/circle/i.test(template.name) ? { round: true } : {}) };
      }
      upsertDocument(doc);
      router.push({
        pathname: '/edit',
        params: { labelId: doc.id },
      });
    },
    [router, upsertDocument, categoryNames, openSeparate],
  );

  /** Templates with sample content (and jewellery, which has its own) ask: empty label or with data. */
  const handleSelectTemplate = useCallback(
    (template: CatalogTemplate) => {
      trackFeatureClick('templates.open');
      if (isTwoUpTemplate(template)) {
        setArrangeFor(template);
        return;
      }
      const hasSample = templateSampleLayout(template).length > 0 || isJewellerySheetTemplate(template);
      if (hasSample) setChoiceFor({ template, mode: 'together' });
      else openTemplate(template, false);
    },
    [openTemplate],
  );

  const handleCreateGroup = () => {
    const name = newGroupName.trim();
    if (name) addGroup(name);
    setNewGroupName('');
    setNewGroupVisible(false);
  };

  const handleDeleteLocal = (id: string, name: string) => {
    Alert.alert('Delete Label', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDocument(id) },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.layoutShell, { maxWidth: MaxContentWidth, width: layoutWidth }]}>
      {/* Navy Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
        {/* Top Search & Actions Row */}
        <View style={styles.topRow}>
          {/* Search Pill */}
          <View style={styles.searchPill}>
            <AppIcon name="magnifyingglass" tintColor={C.onHeader} size={17} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Template"
              placeholderTextColor="#8EA9C2" // theme-fixed: placeholder on the search pill
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Import a .seznik label file */}
          <View style={styles.headerIcons}>
            <Pressable
              hitSlop={8}
              accessibilityLabel="Open label file"
              onPress={() => void openLabelFile()}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.cardPressed]}>
              <AppIcon name="tray.and.arrow.down" tintColor={C.onHeader} size={21} />
            </Pressable>
          </View>
        </View>

        {/* Header Tabs: Local | Industry */}
        <View style={styles.tabRow}>
          {(
            [
              { key: 'local', label: `${t('template.local')} (${documents.length})` },
              { key: 'industry', label: `${t('template.industry')} (${catalogTemplates.length})` },
            ] as const
          ).map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}>
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {/* Left Category Sidebar */}
        <View style={styles.sidebar}>
          <ScrollView
            style={styles.sidebarScroll}
            contentContainerStyle={[styles.sidebarContent, { paddingBottom: tabPad }]}
            showsVerticalScrollIndicator={false}>
            {activeTab === 'local' ? (
              <>
                <Pressable
                  style={({ pressed }) => [styles.localNewGroupBtn, pressed && styles.cardPressed]}
                  onPress={() => setNewGroupVisible(true)}>
                  <View style={styles.localNewGroupIconWrap}>
                    <AppIcon name="square.stack.3d.up.fill" tintColor="#FFFFFF" size={22} /* theme-fixed: white icon on accent button */ />
                  </View>
                  <Text style={styles.localNewGroupText}>New Group</Text>
                </Pressable>

                <Pressable
                  onPress={() => setLocalGroup('All')}
                  style={[styles.categoryItem, localGroup === 'All' && styles.categoryItemActive]}>
                  <Text
                    style={[
                      styles.categoryItemText,
                      localGroup === 'All' && styles.categoryItemTextActive,
                    ]}>
                    All
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setLocalGroup('Ungrouped')}
                  style={[styles.categoryItem, localGroup === 'Ungrouped' && styles.categoryItemActive]}>
                  <Text
                    style={[
                      styles.categoryItemText,
                      localGroup === 'Ungrouped' && styles.categoryItemTextActive,
                    ]}>
                    Ungrouped
                  </Text>
                </Pressable>

                {groups.map((group) => (
                  <Pressable
                    key={group.id}
                    onPress={() => setLocalGroup(group.id)}
                    style={[styles.categoryItem, localGroup === group.id && styles.categoryItemActive]}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={[
                        styles.categoryItemText,
                        localGroup === group.id && styles.categoryItemTextActive,
                      ]}>
                      {group.name}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : (
            [
              { id: ALL_CATEGORY, name: 'All' },
              ...(hasFavorites ? [{ id: FAVORITES_CATEGORY, name: 'Favourites' }] : []),
              ...catalogCategories,
            ].map((cat) => {
              const isSelected = activeCategoryId === cat.id;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => handleCategoryPress(cat.id)}
                  style={[styles.categoryItem, isSelected && styles.categoryItemActive]}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={[styles.categoryItemText, isSelected && styles.categoryItemTextActive]}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })
            )}
          </ScrollView>
        </View>

        {/* Right Templates List */}
        <View style={styles.contentArea}>
          {activeTab === 'local' ? (
            localDocuments.length === 0 ? (
              <View style={styles.localEmptyWrap}>
                <TemplateLocalEmptyIllustration />
                <Text style={styles.localEmptyText}>No label template was found</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.templatesScroll}
                contentContainerStyle={[
                  styles.templatesContent,
                  { paddingBottom: tabPad, alignItems: 'center' },
                ]}
                showsVerticalScrollIndicator={false}>
                {localDocuments.map((docItem) => (
                  <Pressable
                    key={docItem.id}
                    onPress={() =>
                      router.push({ pathname: '/edit', params: { labelId: docItem.id } })
                    }
                    style={({ pressed }) => [
                      styles.templateCard,
                      { maxWidth: templateCardMaxWidth, width: '100%' },
                      pressed && styles.cardPressed,
                    ]}>
                    <LabelPreview document={composeUpsDocument(docItem)} catalogStock />
                    <CatalogCardInfo
                      name={docItem.name}
                      widthMm={docItem.widthMm}
                      heightMm={docItem.heightMm}
                      category=""
                      showCategory={false}
                    />
                    <View style={styles.cardFooter}>
                      {setupLabelIds.has(docItem.id) ? (
                        <View style={styles.setupBadge} accessibilityLabel="Saved setup">
                          <AppIcon name="bolt.fill" tintColor={C.accent} size={12} />
                          <Text style={styles.setupBadgeText}>Saved setup</Text>
                        </View>
                      ) : null}
                      <Pressable
                        hitSlop={8}
                        onPress={() =>
                          router.push({ pathname: '/print', params: { labelId: docItem.id } })
                        }>
                        <AppIcon name="printer" tintColor={C.textSecondary} size={18} />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        accessibilityLabel="Export"
                        onPress={() =>
                          router.push({ pathname: '/share', params: { labelId: docItem.id } })
                        }>
                        <AppIcon name="square.and.arrow.up" tintColor={C.accent} size={18} />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => handleDeleteLocal(docItem.id, docItem.name)}>
                        <AppIcon name="trash" tintColor={C.danger} size={18} />
                      </Pressable>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )
          ) : (
          <ScrollView
            ref={rightScrollRef}
            refreshControl={
              <RefreshControl refreshing={catalogLoading} onRefresh={() => void refreshCatalog()} tintColor={C.accent} />
            }
            style={styles.templatesScroll}
            contentContainerStyle={[
              styles.templatesContent,
              {
                paddingBottom: tabPad,
                alignItems: 'center',
              },
            ]}
            showsVerticalScrollIndicator={false}>
            {activeTab === 'industry' && !searchQuery.trim() ? (
              <View style={[styles.tipSlot, { maxWidth: templateCardMaxWidth }]}>
                <TipBanner id="templates.star" text="Tap the star to save a template. Press and hold a card for a quick look." />
              </View>
            ) : null}

            {filteredTemplates.map((item, index) => (
              <FadeInItem key={`${activeCategoryId}-${item.id}`} index={index} style={styles.cardSlot}>
              <IndustryTemplateCard
                item={item}
                category={item.categoryIds
                  .map((id) => categoryNames.get(id))
                  .filter(Boolean)
                  .join(', ')}
                showCategory={!!searchQuery.trim()}
                cardMaxWidth={templateCardMaxWidth}
                isFavorite={favoriteSet.has(item.id)}
                onPress={handleSelectTemplate}
                onLongPress={(tpl) => setQuickView(tpl)}
                onToggleFavorite={onToggleFavorite}
              />
              </FadeInItem>
            ))}

            {catalogLoading && catalogTemplates.length === 0
              ? [0, 1, 2].map((n) => (
                  <View key={n} style={[styles.templateCard, { maxWidth: templateCardMaxWidth, width: '100%' }]}>
                    <Skeleton style={styles.skeletonPreview} />
                    <View style={styles.skeletonInfo}>
                      <Skeleton style={styles.skeletonTitle} />
                      <Skeleton style={styles.skeletonChip} />
                    </View>
                  </View>
                ))
              : null}

            {filteredTemplates.length === 0 && !(catalogLoading && catalogTemplates.length === 0) && (
              <EmptyState
                icon="magnifyingglass"
                title={searchQuery.trim() ? `No templates match “${searchQuery.trim()}”` : 'No templates here yet'}
                hint={searchQuery.trim() ? 'Try a shorter word, or ask us for the label you need below.' : 'Pull down to refresh, or pick another category.'}
              />
            )}

            {!catalogLoading || catalogTemplates.length > 0 ? (
              <Pressable
                onPress={() => {
                  trackFeatureClick('templates.request');
                  setRequestOpen(true);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.requestCard,
                  { maxWidth: templateCardMaxWidth, width: '100%' },
                  pressed && styles.cardPressed,
                ]}>
                <View style={styles.requestText}>
                  <Text style={styles.requestTitle}>Can’t find your template?</Text>
                  <Text style={styles.requestSub}>Tell us what label you need and we will add it.</Text>
                </View>
                <Text style={styles.requestAction}>Request</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          )}
        </View>
      </View>
      </View>

      <TemplateQuickView
        visible={quickView !== null}
        title={quickView?.name ?? ''}
        size={quickView ? `${catalogDimensions(quickView.widthMm, quickView.heightMm)} mm` : ''}
        isFavorite={quickView ? favoriteSet.has(quickView.id) : false}
        onClose={() => setQuickView(null)}
        onToggleFavorite={() => quickView && onToggleFavorite(quickView.id)}
        onOpen={() => {
          const tpl = quickView;
          setQuickView(null);
          if (tpl) handleSelectTemplate(tpl);
        }}>
        {quickView ? <TemplatePreview item={quickView} /> : null}
      </TemplateQuickView>

      <TemplateRequestModal
        visible={requestOpen}
        onCancel={() => setRequestOpen(false)}
        onSubmit={sendTemplateRequest}
      />

      <IosAlertModal
        visible={arrangeFor !== null}
        onClose={() => setArrangeFor(null)}
        title={arrangeFor?.name ?? ''}
        message="Edit the labels across together on one canvas, or each label on its own?"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setArrangeFor(null) },
          {
            text: 'Each separately',
            style: 'default',
            onPress: () => {
              const t = arrangeFor;
              setArrangeFor(null);
              if (t) setChoiceFor({ template: t, mode: 'separate' });
            },
          },
          {
            text: 'All together',
            style: 'default',
            bold: true,
            onPress: () => {
              const t = arrangeFor;
              setArrangeFor(null);
              if (t) setChoiceFor({ template: t, mode: 'together' });
            },
          },
        ]}
      />

      <IosAlertModal
        visible={choiceFor !== null}
        onClose={() => setChoiceFor(null)}
        title={choiceFor?.template.name ?? ''}
        message="Start with an empty label, or with sample data you can edit?"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setChoiceFor(null) },
          {
            text: 'Empty label',
            style: 'default',
            onPress: () => {
              const t = choiceFor;
              setChoiceFor(null);
              if (t) openTemplate(t.template, false, t.mode);
            },
          },
          {
            text: 'With sample data',
            style: 'default',
            bold: true,
            onPress: () => {
              const t = choiceFor;
              setChoiceFor(null);
              if (t) openTemplate(t.template, true, t.mode);
            },
          },
        ]}
      />

      <IosAlertModal
        visible={newGroupVisible}
        onClose={() => setNewGroupVisible(false)}
        title="New Group"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setNewGroupVisible(false) },
          { text: 'Create', style: 'default', bold: true, onPress: handleCreateGroup },
        ]}>
        <IosAlertInput
          value={newGroupName}
          onChangeText={setNewGroupName}
          placeholder="Group name"
          autoFocus
        />
      </IosAlertModal>

      {documentSourceSheet}
    </View>
  );
}

const styles = themedStyles((c, scheme) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
  },
  layoutShell: {
    flex: 1,
    width: '100%',
  },
  header: {
    backgroundColor: c.header,
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  searchPill: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: scheme === 'light' ? '#3C6182' : c.fillStrong, // theme-fixed: light keeps the navy search pill
    borderRadius: 20,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: c.onAccent,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    minWidth: 38,
    minHeight: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    marginTop: 2,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.18)', // theme-fixed: recessed track behind the header tabs
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: c.surface,
  },
  tabText: {
    color: c.onHeader,
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: c.accent,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  // Sidebar
  sidebar: {
    width: 104,
    backgroundColor: c.fill,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: c.hairline,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarContent: {
    paddingVertical: 6,
  },
  svgPreviewWrap: {
    backgroundColor: c.canvasArea,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  categoryGroup: {
    marginBottom: 4,
  },
  groupHeaderWrap: {
    height: 38,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeaderText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: c.brandInk,
    textAlign: 'center',
    includeFontPadding: false,
  },
  categoryItem: {
    minHeight: 40,
    marginHorizontal: 6,
    marginVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryItemActive: {
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  categoryItemText: {
    fontSize: 13.5,
    fontWeight: '500',
    color: c.textSecondary,
    textAlign: 'center',
    includeFontPadding: false,
  },
  categoryItemTextActive: {
    color: c.accent,
    fontWeight: '700',
  },
  // Right Content Area
  contentArea: {
    flex: 1,
    backgroundColor: c.bg,
  },
  templatesScroll: {
    flex: 1,
  },
  templatesContent: {
    padding: 10,
    gap: 14,
  },
  templateCard: {
    backgroundColor: c.surface,
    borderRadius: 16,
    overflow: 'hidden',
    ...cardElevation(c, scheme),
  },
  tipSlot: {
    width: '100%',
  },
  cardSlot: {
    width: '100%',
    alignItems: 'center',
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  infoText: {
    flex: 1,
    minWidth: 0,
  },
  infoTitle: {
    color: c.text,
    fontSize: 14.5,
    fontWeight: '600',
  },
  infoCategory: {
    color: c.accentInk,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  sizeChip: {
    flexShrink: 0,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: c.accentFill,
  },
  sizeChipText: {
    color: c.onAccent,
    fontSize: 12,
    fontWeight: '600',
  },
  favoriteBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
    ...cardElevation(c, scheme),
  },
  // Preview Canvas

  // --- SUPERMARKET STYLES ---

  // --- FOOD STYLES ---

  // --- APPLIANCES STYLES ---

  // --- STORAGE LABEL STYLES ---

  // --- FILE LABEL STYLES ---

  // --- ASSET TAG STYLES ---

  // --- SCHOOL STYLES ---

  // --- MATERIAL STYLES ---

  // --- RACKING STYLES ---

  // --- LABORATORY STYLES ---

  // --- CABLE SPECIFIC STYLES ---

  // --- OTHER SPECIFIC STYLES ---

  // Card Footer (saved labels only)
  setupBadge: {
    marginRight: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: c.accentSoft,
  },
  setupBadgeText: { fontSize: 11, fontWeight: '700', color: c.accent },
  cardFooter: {
    backgroundColor: c.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  skeletonPreview: { height: 150, borderRadius: 0 },
  skeletonInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  skeletonTitle: { flex: 1, height: 14 },
  skeletonChip: { width: 70, height: 22, borderRadius: 11 },
  emptyState: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: c.textMuted,
    fontSize: 14,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.accent,
    backgroundColor: c.surface,
  },
  requestText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  requestTitle: {
    color: c.text,
    fontSize: 15,
    fontWeight: '600',
  },
  requestSub: {
    color: c.textSecondary,
    fontSize: 13,
  },
  requestAction: {
    color: c.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  localNewGroupBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 6,
  },
  localNewGroupIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  localNewGroupText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    textAlign: 'center',
  },
  localEmptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 24,
  },
  localEmptyText: {
    color: c.textMuted,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  localEmptyIllustration: {
    width: 160,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localEmptyBoxBack: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#B8DDF5', // theme-fixed: light preview (localEmptyBoxBack)
    borderRadius: 4,
  },
  localEmptyBoxFront: {
    position: 'absolute',
    bottom: 18,
    width: 110,
    height: 62,
    backgroundColor: '#9ECAE8', // theme-fixed: light preview (localEmptyBoxFront)
    borderTopWidth: 2,
    borderTopColor: '#7FB8DC', // theme-fixed: light preview (localEmptyBoxFront)
    borderRadius: 4,
  },
  localEmptyFlapLeft: {
    position: 'absolute',
    bottom: 68,
    left: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7', // theme-fixed: light preview (localEmptyFlapLeft)
    transform: [{ skewX: '-24deg' }],
    borderTopLeftRadius: 3,
  },
  localEmptyFlapRight: {
    position: 'absolute',
    bottom: 68,
    right: 28,
    width: 52,
    height: 28,
    backgroundColor: '#C5E4F7', // theme-fixed: light preview (localEmptyFlapRight)
    transform: [{ skewX: '24deg' }],
    borderTopRightRadius: 3,
  },
  localEmptyPlane: {
    position: 'absolute',
    top: 8,
    right: 18,
    width: 34,
    height: 34,
    transform: [{ rotate: '-18deg' }],
  },
  localEmptyPlaneBody: {
    position: 'absolute',
    top: 14,
    left: 0,
    width: 28,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8', // theme-fixed: light preview (localEmptyPlaneBody)
  },
  localEmptyPlaneWing: {
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
    borderBottomColor: '#8EC5E8', // theme-fixed: light preview (localEmptyPlaneWing)
  },
  localEmptyTrail: {
    position: 'absolute',
    top: 24,
    right: 52,
    flexDirection: 'row',
    gap: 5,
    transform: [{ rotate: '-18deg' }],
  },
  localEmptyTrailDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8EC5E8', // theme-fixed: light preview (localEmptyTrailDot)
  },
  localCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 14,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    ...cardElevation(c, scheme),
  },
}));
