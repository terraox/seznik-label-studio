import { composeUpsDocument, createLabelDocument } from '@/lib/label-document';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Alert,
} from 'react-native';
import { TextInput } from '@/components/ui/text-input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect as SvgRect, Stop, SvgXml } from 'react-native-svg';

import { IosAlertModal, IosAlertInput } from '@/components/ui/ios-alert-modal';
import { ShareNodeIcon } from '@/components/home-icons';
import { LabelPreview } from '@/components/label-preview';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { createIndustryTemplateDocument } from '@/constants/template-documents';
import { JEWELRY_DIECUT_PREVIEW_SHEET } from '@/constants/jewelry-diecut';
import { useTemplateCatalogStore, type CatalogTemplate } from '@/stores/template-catalog-store';
import { sampleToElements } from '@/lib/template-sample-elements';
import { useAuthStore } from '@/stores/auth-store';
import { useLabelStore } from '@/stores/label-store';
import { useOpenLabelFile } from '@/lib/label-share/use-open-label-file';
import { useTranslation } from '@/lib/i18n';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

function formatCatalogMm(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function catalogDimensions(widthMm: number, heightMm: number): string {
  return `${formatCatalogMm(widthMm)} x ${formatCatalogMm(heightMm)}`;
}

const CatalogCardBanner = memo(function CatalogCardBanner({
  id,
  name,
  widthMm,
  heightMm,
  category,
  showCategory,
}: {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  category: string;
  showCategory: boolean;
}) {
  useThemeRefresh();
  const [bannerSize, setBannerSize] = useState({ w: 0, h: 38 });
  const gradientId = `catalog-hdr-${id}`;
  return (
    <View
      style={styles.cardHeaderBanner}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (Math.abs(width - bannerSize.w) > 1 || Math.abs(height - bannerSize.h) > 1) {
          setBannerSize({ w: width, h: height });
        }
      }}>
      {bannerSize.w > 0 ? (
        <Svg
          pointerEvents="none"
          width={bannerSize.w}
          height={bannerSize.h}
          style={StyleSheet.absoluteFillObject}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#1EB8C8" /* theme-fixed: card banner gradient, white text */ />
              <Stop offset="1" stopColor="#2E78B8" /* theme-fixed: card banner gradient, white text */ />
            </LinearGradient>
          </Defs>
          <SvgRect width={bannerSize.w} height={bannerSize.h} fill={`url(#${gradientId})`} />
        </Svg>
      ) : null}
      <View style={styles.bannerLeft}>
        {showCategory ? (
          <Text numberOfLines={1} style={styles.bannerCategory}>
            {category}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={styles.bannerTitle}>
          {name}
        </Text>
      </View>
      <Text style={styles.bannerDimensions}>{catalogDimensions(widthMm, heightMm)}</Text>
    </View>
  );
});

/** The template's own SVG, drawn at the label's proportions on the card. */
const TemplatePreview = memo(function TemplatePreview({ item }: { item: CatalogTemplate }) {
  useThemeRefresh();
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
  onPress,
}: {
  item: CatalogTemplate;
  category: string;
  showCategory: boolean;
  cardMaxWidth: number;
  onPress: (item: CatalogTemplate) => void;
}) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.templateCard,
        { maxWidth: cardMaxWidth, width: '100%' },
        pressed && styles.cardPressed,
      ]}>
      <CatalogCardBanner
        id={item.id}
        name={item.name}
        widthMm={item.widthMm}
        heightMm={item.heightMm}
        category={category}
        showCategory={showCategory}
      />
      <TemplatePreview item={item} />
      <View style={styles.cardFooter}>
        <View style={styles.footerClock}>
          <AppIcon name="clock" tintColor={C.accent} size={17} />
        </View>
        <ShareNodeIcon color={C.accent} size={20} />
      </View>
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

  const layoutWidth = Math.min(windowWidth, MaxContentWidth);
  const templateCardMaxWidth = Math.min(520, layoutWidth - 124);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'local' | 'industry' | 'cloud'>('industry');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [localGroup, setLocalGroup] = useState<string>('All');
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [newGroupVisible, setNewGroupVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [loginVisible, setLoginVisible] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginName, setLoginName] = useState('');

  const documents = useLabelStore((s) => s.documents);
  const groups = useLabelStore((s) => s.groups);
  const addGroup = useLabelStore((s) => s.addGroup);
  const deleteDocument = useLabelStore((s) => s.deleteDocument);
  const cloudProfile = useLabelStore((s) => s.cloudProfile);
  const cloudTemplates = useLabelStore((s) => s.cloudTemplates);
  const signIn = useLabelStore((s) => s.signIn);
  const signOut = useLabelStore((s) => s.signOut);
  const deleteCloudTemplate = useLabelStore((s) => s.deleteCloudTemplate);
  const upsertDocument = useLabelStore((s) => s.upsertDocument);
  const ensureLocalDocument = useLabelStore((s) => s.ensureLocalDocument);
  const { t } = useTranslation();
  const catalogCategories = useTemplateCatalogStore((s) => s.categories);
  const catalogTemplates = useTemplateCatalogStore((s) => s.templates);
  const refreshCatalog = useTemplateCatalogStore((s) => s.refresh);
  const authToken = useAuthStore((s) => s.token);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog, authToken]);

  const activeCategoryId = catalogCategories.some((c) => c.id === selectedCategory)
    ? selectedCategory
    : (catalogCategories[0]?.id ?? '');
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

  const visibleCloudTemplates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cloudTemplates;
    return cloudTemplates.filter((t) => t.name.toLowerCase().includes(q));
  }, [cloudTemplates, searchQuery]);

  const handleEditCloudTemplate = (tpl: (typeof cloudTemplates)[number]) => {
    const local = ensureLocalDocument(tpl.id);
    if (!local) return;
    router.push({ pathname: '/edit', params: { labelId: local.id } });
  };

  const handleDeleteCloudTemplate = (tpl: (typeof cloudTemplates)[number]) => {
    Alert.alert('Delete Cloud Template', `Delete "${tpl.name}" from cloud sync?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCloudTemplate(tpl.id) },
    ]);
  };

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
          (categoryNames.get(t.categoryId) ?? '').toLowerCase().includes(q),
      );
    }
    return catalogTemplates.filter((t) => t.categoryId === activeCategoryId);
  }, [searchQuery, activeCategoryId, catalogTemplates, categoryNames]);

  const [choiceFor, setChoiceFor] = useState<CatalogTemplate | null>(null);

  const openTemplate = useCallback(
    (template: CatalogTemplate, withSample: boolean) => {
      const category = categoryNames.get(template.categoryId) ?? '';
      const isJewellery = /jewel/i.test(template.name);
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
      const layout = Array.isArray(template.sampleLayout) ? template.sampleLayout : [];
      if (!withSample) doc.elements = [];
      else if (layout.length) doc.elements = sampleToElements(layout, template.widthMm, template.heightMm);
      upsertDocument(doc);
      router.push({
        pathname: '/edit',
        params: { labelId: doc.id },
      });
    },
    [router, upsertDocument, categoryNames],
  );

  /** Templates with sample content (and jewellery, which has its own) ask: empty label or with data. */
  const handleSelectTemplate = useCallback(
    (template: CatalogTemplate) => {
      const hasSample = (Array.isArray(template.sampleLayout) && template.sampleLayout.length > 0) || /jewel/i.test(template.name);
      if (hasSample) setChoiceFor(template);
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

  const handleLogin = () => {
    const email = loginEmail.trim();
    if (!email) return;
    signIn(email, loginName.trim() || email.split('@')[0]);
    setLoginVisible(false);
    setLoginEmail('');
    setLoginName('');
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

          {/* Right Action Icons: Scanner, Sort */}
          <View style={styles.headerIcons}>
            <Pressable
              hitSlop={8}
              accessibilityLabel="Open label file"
              onPress={() => void openLabelFile()}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.cardPressed]}>
              <AppIcon name="tray.and.arrow.down" tintColor={C.onHeader} size={21} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => router.push('/scan')}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.cardPressed]}>
              <AppIcon name="qrcode.viewfinder" tintColor={C.onHeader} size={21} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => setSortNewestFirst((v) => !v)}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.cardPressed]}>
              <AppIcon
                name={sortNewestFirst ? 'arrow.down' : 'arrow.up'}
                tintColor={C.onHeader}
                size={19}
              />
            </Pressable>
          </View>
        </View>

        {/* Header Tabs: Local (0) | Industry (13) | Cloud */}
        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setActiveTab('local')}
            style={[styles.tabItem, activeTab === 'local' && styles.tabItemActive]}>
            <Text style={[styles.tabText, activeTab === 'local' && styles.tabTextActive]}>
              {t('template.local')} ({documents.length})
            </Text>
            {activeTab === 'local' && <View style={styles.tabIndicator} />}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('industry')}
            style={[styles.tabItem, activeTab === 'industry' && styles.tabItemActive]}>
            <Text style={[styles.tabText, activeTab === 'industry' && styles.tabTextActive]}>
              {t('template.industry')} ({catalogTemplates.length})
            </Text>
            {activeTab === 'industry' && <View style={styles.tabIndicator} />}
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('cloud')}
            style={[styles.tabItem, activeTab === 'cloud' && styles.tabItemActive]}>
            <Text style={[styles.tabText, activeTab === 'cloud' && styles.tabTextActive]}>
              {t('template.cloud')}
            </Text>
            {activeTab === 'cloud' && <View style={styles.tabIndicator} />}
          </Pressable>
        </View>
      </View>

      {activeTab === 'cloud' ? (
        cloudProfile ? (
          <ScrollView
            style={styles.cloudSignedInScroll}
            contentContainerStyle={[styles.cloudSignedInContent, { paddingBottom: tabPad }]}
            showsVerticalScrollIndicator={false}>
            <View style={styles.cloudProfileCard}>
              <View style={styles.cloudAvatar}>
                <Text style={styles.cloudAvatarText}>
                  {cloudProfile.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.cloudProfileInfo}>
                <Text style={styles.cloudProfileName}>{cloudProfile.name}</Text>
                <Text style={styles.cloudProfileEmail}>{cloudProfile.email}</Text>
              </View>
              <Pressable
                onPress={() =>
                  Alert.alert('Sign Out', 'Sign out from cloud sync?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign Out', style: 'destructive', onPress: signOut },
                  ])
                }
                style={({ pressed }) => [styles.cloudSignOutBtn, pressed && styles.cardPressed]}>
                <Text style={styles.cloudSignOutText}>Sign Out</Text>
              </Pressable>
            </View>

            <Text style={styles.cloudSectionTitle}>
              Saved on this device ({cloudTemplates.length})
            </Text>

            {visibleCloudTemplates.length === 0 ? (
              <View style={styles.cloudEmptyCard}>
                <AppIcon name="icloud.and.arrow.up" tintColor={C.textMuted} size={30} />
                <Text style={styles.cloudEmptyText}>
                  {searchQuery.trim()
                    ? 'No synced templates match your search.'
                    : 'No synced templates yet. Use Upload on the Home screen or in the editor to sync a label.'}
                </Text>
              </View>
            ) : (
              visibleCloudTemplates.map((tpl) => (
                <View key={tpl.id} style={styles.localCard}>
                  <View style={styles.cardHeaderBanner}>
                    <View style={styles.bannerLeft}>
                      <Text numberOfLines={1} style={styles.bannerTitle}>
                        {tpl.name}
                      </Text>
                    </View>
                    <Text style={styles.bannerDimensions}>
                      {catalogDimensions(tpl.widthMm, tpl.heightMm)}
                    </Text>
                  </View>
                  <LabelPreview document={composeUpsDocument(tpl)} catalogStock />
                  <View style={styles.cardFooter}>
                    <Pressable hitSlop={10} onPress={() => handleEditCloudTemplate(tpl)}>
                      <AppIcon name="square.and.pencil" tintColor={C.accent} size={19} />
                    </Pressable>
                    <Pressable hitSlop={10} onPress={() => handleDeleteCloudTemplate(tpl)}>
                      <AppIcon name="trash" tintColor={C.danger} size={18} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        ) : (
        <View style={styles.cloudContent}>
          <Pressable
            style={({ pressed }) => [styles.cloudLoginBtn, pressed && styles.cardPressed]}
            onPress={() => setLoginVisible(true)}>
            <Text style={styles.cloudLoginText}>Login</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.cloudPublicBtn, pressed && styles.cardPressed]}
            onPress={() => {
              setSearchQuery('');
              setActiveTab('industry');
            }}>
            <Text style={styles.cloudPublicText}>Public Access</Text>
          </Pressable>

          <Text style={styles.cloudDescription}>
            We provide the function of sharing label templates online. Through &apos;Online Sharing&apos;,
            you can obtain the label templates shared by others with you in real time, and you can also
            share your own label templates with others. To use this function, please click
            &apos;Login&apos;.
          </Text>
        </View>
        )
      ) : (
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
            catalogCategories.map((cat) => {
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
                    <View style={styles.cardHeaderBanner}>
                      <View style={styles.bannerLeft}>
                        <Text numberOfLines={1} style={styles.bannerTitle}>
                          {docItem.name}
                        </Text>
                      </View>
                      <Text style={styles.bannerDimensions}>
                        {catalogDimensions(docItem.widthMm, docItem.heightMm)}
                      </Text>
                    </View>
                    <LabelPreview document={composeUpsDocument(docItem)} catalogStock />
                    <View style={styles.cardFooter}>
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
            style={styles.templatesScroll}
            contentContainerStyle={[
              styles.templatesContent,
              {
                paddingBottom: tabPad,
                alignItems: 'center',
              },
            ]}
            showsVerticalScrollIndicator={false}>
            {filteredTemplates.map((item) => (
              <IndustryTemplateCard
                key={item.id}
                item={item}
                category={categoryNames.get(item.categoryId) ?? ''}
                showCategory={!!searchQuery.trim()}
                cardMaxWidth={templateCardMaxWidth}
                onPress={handleSelectTemplate}
              />
            ))}

            {filteredTemplates.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No templates found</Text>
              </View>
            )}
          </ScrollView>
          )}
        </View>
      </View>
      )}
      </View>

      <IosAlertModal
        visible={choiceFor !== null}
        onClose={() => setChoiceFor(null)}
        title={choiceFor?.name ?? ''}
        message="Start with an empty label, or with sample data you can edit?"
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setChoiceFor(null) },
          {
            text: 'Empty label',
            style: 'default',
            onPress: () => {
              const t = choiceFor;
              setChoiceFor(null);
              if (t) openTemplate(t, false);
            },
          },
          {
            text: 'With sample data',
            style: 'default',
            bold: true,
            onPress: () => {
              const t = choiceFor;
              setChoiceFor(null);
              if (t) openTemplate(t, true);
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

      <IosAlertModal
        visible={loginVisible}
        onClose={() => setLoginVisible(false)}
        title="Cloud Login"
        message="Saved on this phone only — there is no remote cloud account yet."
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setLoginVisible(false) },
          { text: 'Login', style: 'default', bold: true, onPress: handleLogin },
        ]}>
        <IosAlertInput
          value={loginEmail}
          onChangeText={setLoginEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoFocus
        />
        <IosAlertInput
          value={loginName}
          onChangeText={setLoginName}
          placeholder="Display name (optional)"
          style={{ marginTop: 8 }}
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
    height: 36,
    backgroundColor: scheme === 'light' ? '#3C6182' : c.fillStrong, // theme-fixed: light keeps the navy search pill
    borderRadius: 18,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    color: c.onAccent,
    fontSize: 14.5,
    fontWeight: '500',
    textAlign: 'center',
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
    justifyContent: 'space-around',
    paddingTop: 6,
  },
  tabItem: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    position: 'relative',
  },
  tabItemActive: {},
  tabText: {
    color: c.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: c.onAccent,
    fontWeight: '500',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    width: 60,
    backgroundColor: c.surface,
    borderRadius: 2,
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
    height: 38,
    width: '100%',
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryItemActive: {
    backgroundColor: c.surface,
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
    fontWeight: '600',
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
    borderRadius: 12,
    overflow: 'hidden',
    ...cardElevation(c, scheme),
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardHeaderBanner: {
    backgroundColor: c.accentFill,
    overflow: 'hidden',
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bannerLeft: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  bannerTitle: {
    color: c.onAccent,
    fontSize: 14,
    fontWeight: '500',
  },
  bannerCategory: {
    color: 'rgba(255,255,255,0.88)', // theme-fixed: white text on the banner gradient
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  bannerSubtitle: {
    color: c.onAccent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 1,
  },
  bannerDimensions: {
    color: c.onAccent,
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 0,
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

  // Card Footer
  cardFooter: {
    backgroundColor: c.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 18,
  },
  footerClock: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: c.textMuted,
    fontSize: 14,
  },
  cloudContent: {
    flex: 1,
    width: '100%',
    backgroundColor: c.surface,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
  },
  cloudLoginBtn: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cloudLoginText: {
    color: c.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  cloudPublicBtn: {
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: c.accent,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  cloudPublicText: {
    color: c.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  cloudDescription: {
    width: '100%',
    maxWidth: 340,
    fontSize: 14,
    lineHeight: 22,
    color: c.textMuted,
    textAlign: 'left',
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
  cloudSignedInScroll: {
    flex: 1,
  },
  cloudSignedInContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  cloudProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    ...cardElevation(c, scheme),
  },
  cloudAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.accentFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudAvatarText: {
    color: c.onAccent,
    fontSize: 18,
    fontWeight: '500',
  },
  cloudProfileInfo: {
    flex: 1,
  },
  cloudProfileName: {
    fontSize: 15.5,
    fontWeight: '600',
    color: c.text,
  },
  cloudProfileEmail: {
    fontSize: 12.5,
    color: c.textMuted,
    marginTop: 1,
  },
  cloudSignOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: c.dangerSoft,
  },
  cloudSignOutText: {
    color: c.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  cloudSectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  cloudEmptyCard: {
    backgroundColor: c.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...cardElevation(c, scheme),
  },
  cloudEmptyText: {
    color: c.textMuted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
}));
