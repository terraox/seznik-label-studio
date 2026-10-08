import { DefaultPropertySettingsFields } from '@/components/settings/default-property-settings-fields';
import { SettingsNote, SettingsScreenShell } from '@/components/settings-ui';

export default function EditingSettingsScreen() {
  return (
    <SettingsScreenShell title="Default Property Settings">
      <DefaultPropertySettingsFields />
      <SettingsNote>
        The default attribute refers to the default parameter used when creating or editing a
        label. By setting default properties, you can easily edit commonly used styles of labels.
      </SettingsNote>
    </SettingsScreenShell>
  );
}
