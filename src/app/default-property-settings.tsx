import { Redirect } from 'expo-router';

/** Same screen as Advanced → Default Property Settings (`editing-settings` route). */
export default function DefaultPropertySettingsScreen() {
  return <Redirect href="/editing-settings" />;
}

