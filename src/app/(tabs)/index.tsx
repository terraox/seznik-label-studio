import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

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
import { HomeLayout, Palette } from '@/constants/ui';
import { useTabBarPadding } from '@/hooks/use-tab-bar-padding';
import { useLabelStore } from '@/stores/label-store';

export default function HomeScreen() {
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

  return (
    <View style={styles.root}>
      <HomeHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabPad }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        scrollEnabled={scrollEnabled}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContentH(h)}>
        <View style={styles.inner}>
          <HeroCard compact={hasLabels} />

          {recentLabel ? (
            <View style={styles.section}>
              <SectionHeading>Last edited label</SectionHeading>
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
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeading>Print from file</SectionHeading>
            <ToolGrid ids={FILE_TOOLS} columns={3} />
          </View>

          <View style={styles.section}>
            <SectionHeading>More ways to create</SectionHeading>
            <ToolGrid ids={CREATE_GRID_TOOLS} columns={3} />
          </View>

          <View style={styles.section}>
            <SectionHeading>Label types</SectionHeading>
            <ToolGrid ids={LABEL_TYPE_TOOLS} columns={4} />
          </View>

          <BuyFromUsStrip />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Palette.screen,
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
});
