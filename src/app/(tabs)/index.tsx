import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { BuyFromUsStrip } from '@/components/home/buy-from-us-strip';
import { ContinueCard } from '@/components/home/continue-card';
import { HeroCard } from '@/components/home/hero-card';
import { HomeHeader } from '@/components/home/home-header';
import {
  CREATE_GRID_TOOLS,
  FILE_TOOLS,
  LABEL_TYPE_TOOLS,
} from '@/components/home/home-tools';
import { SectionHeading } from '@/components/home/section-heading';
import { ToolGrid } from '@/components/home/tool-grid';
import { MaxContentWidth } from '@/constants/theme';
import { HomeLayout } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { SampleContinueCard } from '@/components/home/sample-continue-card';
import { setWalkthroughScroller } from '@/lib/walkthrough/registry';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWalkthroughStore } from '@/stores/walkthrough-store';
import { themedStyles, useThemeRefresh } from '@/theme';

export default function HomeScreen() {
  useThemeRefresh();
  // Tab bar inset only — no extra bottom padding so content can fit one screen.
  const tabPad = useTabBarPadding(0);
  const documents = useLabelStore((s) => s.documents);
  const deleteDocument = useLabelStore((s) => s.deleteDocument);
  const uploadToCloud = useLabelStore((s) => s.uploadToCloud);

  const [viewportH, setViewportH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const scrollEnabled = contentH > viewportH + 1;

  const recentLabel = useMemo(
    () =>
      documents.length > 0
        ? [...documents].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        : null,
    [documents],
  );

  const hasLabels = documents.length > 0;

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const startWalkthrough = useWalkthroughStore((s) => s.start);

  useEffect(() => {
    setWalkthroughScroller((dy) =>
      scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + dy), animated: false }),
    );
    return () => setWalkthroughScroller(null);
  }, []);

  // First launch: auto-start once persisted settings have loaded.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const maybeStart = () => {
      if (useSettingsStore.getState().tutorialSeen) return;
      timer = setTimeout(startWalkthrough, 700);
    };
    if (useSettingsStore.persist.hasHydrated()) maybeStart();
    const unsub = useSettingsStore.persist.onFinishHydration(maybeStart);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [startWalkthrough]);

  const tourActive = useWalkthroughStore((s) => s.active);

  return (
    <View style={styles.root}>
      <HomeHeader />

      <ScrollView
        ref={scrollRef}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={scrollEnabled}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContentH(h)}>
        <View style={styles.inner}>
          <WalkthroughTarget id="home.newLabel">
            <HeroCard compact={hasLabels} />
          </WalkthroughTarget>

          {recentLabel ? (
            <View style={styles.section}>
              <SectionHeading>Last edited label</SectionHeading>
              <WalkthroughTarget id="home.lastEdited">
              <ContinueCard
                document={recentLabel}
                onDelete={() => deleteDocument(recentLabel.id)}
                onUpload={() => {
                  uploadToCloud(recentLabel);
                  Alert.alert(
                    'Template saved',
                    `"${recentLabel.name}" is in Select Existing Template and Template → Cloud.`,
                  );
                }}
              />
              </WalkthroughTarget>
            </View>
          ) : null}

          {!recentLabel && tourActive ? (
            <View style={styles.section}>
              <SectionHeading>Last edited label</SectionHeading>
              <WalkthroughTarget id="home.lastEdited">
                <SampleContinueCard />
              </WalkthroughTarget>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeading>Print from file</SectionHeading>
            <WalkthroughTarget id="home.fromFile">
              <ToolGrid ids={FILE_TOOLS} columns={3} />
            </WalkthroughTarget>
          </View>

          <View style={styles.section}>
            <SectionHeading>More ways to create</SectionHeading>
            <WalkthroughTarget id="home.create">
              <ToolGrid ids={CREATE_GRID_TOOLS} columns={3} />
            </WalkthroughTarget>
          </View>

          <View style={styles.section}>
            <SectionHeading>Label types</SectionHeading>
            <WalkthroughTarget id="home.labelTypes">
              <ToolGrid ids={LABEL_TYPE_TOOLS} columns={4} />
            </WalkthroughTarget>
          </View>

          <WalkthroughTarget id="home.shop">
            <BuyFromUsStrip />
          </WalkthroughTarget>
        </View>
      </ScrollView>

    </View>
  );
}

const styles = themedStyles((c) => ({
  root: {
    flex: 1,
    backgroundColor: c.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: HomeLayout.screenPad,
    paddingTop: HomeLayout.contentPadTop,
    alignItems: 'center',
    flexGrow: 1,
  },
  inner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: HomeLayout.sectionGap,
  },
  section: {
    width: '100%',
  },
}));
