import { useRouter } from 'expo-router';

import { AppearancePicker } from '@/components/appearance-picker';
import { AuthScreen, PrimaryButton } from '@/components/auth/auth-ui';
import { useSettingsStore } from '@/stores/settings-store';

/** First screen of a fresh install: pick light, dark or system before logging in. */
export default function ChooseThemeScreen() {
  const router = useRouter();
  const appearance = useSettingsStore((s) => s.appearance);
  const setAppearance = useSettingsStore((s) => s.setAppearance);
  const setThemeChosen = useSettingsStore((s) => s.setThemeChosen);

  const onContinue = () => {
    setThemeChosen(true);
    // The welcome screen unlocks once the theme is chosen; go straight to it.
    setTimeout(() => router.replace('/welcome'), 0);
  };

  return (
    <AuthScreen
      title="Choose your look"
      subtitle="Pick a theme for Seznik. You can change it any time in Settings."
      footer={<PrimaryButton label="Continue" arrow onPress={onContinue} />}
    >
      <AppearancePicker value={appearance} onChange={setAppearance} />
    </AuthScreen>
  );
}
