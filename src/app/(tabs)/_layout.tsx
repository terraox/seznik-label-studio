import { useMemo } from 'react';
import { View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { WalkthroughOverlay } from '@/components/walkthrough/walkthrough-overlay';
import { getHomeWalkthrough } from '@/lib/walkthrough/home-steps';
import { useLabelStore } from '@/stores/label-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWalkthroughStore } from '@/stores/walkthrough-store';

export default function TabsLayout() {
  const hasLabels = useLabelStore((s) => s.documents.length > 0);
  const steps = useMemo(() => getHomeWalkthrough(hasLabels), [hasLabels]);
  const stop = useWalkthroughStore((s) => s.stop);
  const setTutorialSeen = useSettingsStore((s) => s.setTutorialSeen);

  return (
    <View style={{ flex: 1 }}>
      <AppTabs />
      <WalkthroughOverlay
        steps={steps}
        onFinish={() => {
          setTutorialSeen(true);
          stop();
        }}
      />
    </View>
  );
}
