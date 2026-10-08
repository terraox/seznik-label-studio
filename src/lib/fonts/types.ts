export type FontRail = 'common' | 'normal' | 'creative' | 'indian' | 'local';

export type InstalledFontRecord = {
  id: string;
  name: string;
  familyKey: string;
  fileUri: string;
  category: FontRail;
  source: 'downloaded' | 'imported';
};
