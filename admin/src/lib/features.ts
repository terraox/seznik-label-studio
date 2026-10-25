/**
 * App sections whose taps are counted overall (no user attached). The app sends the key; the server
 * only accepts keys listed here, so a bad client cannot fill the table with new names.
 */
export type FeatureGroup = 'tab' | 'home' | 'templates' | 'settings';

export const FEATURE_GROUPS: { id: FeatureGroup; label: string }[] = [
  { id: 'tab', label: 'Bottom tabs' },
  { id: 'home', label: 'Home screen' },
  { id: 'templates', label: 'Templates' },
  { id: 'settings', label: 'Settings' },
];

export const FEATURES: Record<string, { label: string; group: FeatureGroup }> = {
  'tab.home': { label: 'Home tab', group: 'tab' },
  'tab.templates': { label: 'Templates tab', group: 'tab' },
  'tab.shop': { label: 'Shop tab', group: 'tab' },
  'tab.help': { label: 'Help tab', group: 'tab' },
  'tab.settings': { label: 'Settings tab', group: 'tab' },

  'home.new_label': { label: 'New label', group: 'home' },
  'home.upload_label': { label: 'Upload label', group: 'home' },
  'home.serial_labels': { label: 'Serial labels', group: 'home' },
  'home.shipping_labels': { label: 'Shipping labels', group: 'home' },
  'home.excel': { label: 'Excel', group: 'home' },
  'home.pdf': { label: 'PDF', group: 'home' },
  'home.import': { label: 'Import', group: 'home' },
  'home.banner': { label: 'Home banner', group: 'home' },
  'home.shop_strip': { label: 'Buy from us strip', group: 'home' },
  'home.continue': { label: 'Last edited label', group: 'home' },

  'templates.open': { label: 'Open a template', group: 'templates' },
  'templates.favourite': { label: 'Star a template', group: 'templates' },
  'templates.request': { label: 'Request a template', group: 'templates' },

  'settings.printer': { label: 'Connect printer', group: 'settings' },
  'settings.language': { label: 'Language', group: 'settings' },
  'settings.fonts': { label: 'Fonts', group: 'settings' },
  'settings.clipart': { label: 'Clipart', group: 'settings' },
  'settings.borders': { label: 'Borders', group: 'settings' },
  'settings.data_file': { label: 'Data files', group: 'settings' },
  'settings.history': { label: 'Printing history', group: 'settings' },
  'settings.appearance': { label: 'Appearance', group: 'settings' },
  'settings.advanced': { label: 'Advanced settings', group: 'settings' },
  'settings.permissions': { label: 'App permissions', group: 'settings' },
  'settings.walkthrough': { label: 'Walkthrough', group: 'settings' },
  'settings.feedback': { label: 'Feedback', group: 'settings' },
  'settings.about': { label: 'About us', group: 'settings' },
  'settings.delete_account': { label: 'Delete account', group: 'settings' },
};

export const FEATURE_KEYS = Object.keys(FEATURES);
