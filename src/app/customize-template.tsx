import { router } from 'expo-router';

import { TemplateChoiceSheet } from '@/components/template-choice-sheet';

export default function CustomizeTemplateScreen() {
  return (
    <TemplateChoiceSheet
      title="Please select the size method"
      onCreate={() =>
        router.replace({ pathname: '/new-label-setup', params: { focusSize: '1', isSingleCanvas: 'true' } })
      }
    />
  );
}
