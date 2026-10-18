import { prisma } from './prisma';

export type AppRuntimeConfig = {
  /** Where a blocked user can reach the admin. Empty until the owner fills it in. */
  adminContact: { email: string | null; phone: string | null; whatsapp: string | null };
  /** Builds below this must update (0 = no limit). */
  minAppBuild: number;
  /** When true, requests without an X-App-Build header (pre-tracking builds) are refused at login. */
  legacyCutoff: boolean;
};

const DEFAULTS: AppRuntimeConfig = {
  adminContact: { email: null, phone: null, whatsapp: null },
  minAppBuild: 0,
  legacyCutoff: false,
};

export async function readAppConfig(): Promise<AppRuntimeConfig> {
  const rows = await prisma.appConfig.findMany();
  const config: AppRuntimeConfig = { ...DEFAULTS, adminContact: { ...DEFAULTS.adminContact } };
  for (const row of rows) {
    if (row.key === 'adminContact' && row.value && typeof row.value === 'object') {
      Object.assign(config.adminContact, row.value);
    }
    if (row.key === 'minAppBuild' && typeof row.value === 'number') config.minAppBuild = row.value;
    if (row.key === 'legacyCutoff' && typeof row.value === 'boolean') config.legacyCutoff = row.value;
  }
  return config;
}
