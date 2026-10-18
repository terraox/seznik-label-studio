/**
 * Who may do what. Pure (no server imports) so the API and the desk screens share one table.
 *
 *   superadmin  everything
 *   support     users (with phone numbers), block / unblock, feedback; library read-only
 *   content     clipart / template library only; never sees phone numbers
 *   viewer      read-only dashboards; phone numbers masked   (extra role: the old "viewer")
 */
export const ROLE_IDS = ['superadmin', 'support', 'content', 'viewer'] as const;
export type Role = (typeof ROLE_IDS)[number];

export type Permission =
  | 'overview.view'
  | 'analytics.view'
  | 'users.view'
  | 'users.phones'
  | 'users.block'
  | 'users.export'
  | 'printers.edit'
  | 'audit.view'
  | 'config.view'
  | 'config.edit'
  | 'admins.manage'
  | 'catalog.view'
  | 'catalog.edit'
  | 'feedback.view'
  | 'feedback.edit'
  | 'desk.reset';

const ALL: Permission[] = [
  'overview.view', 'analytics.view', 'users.view', 'users.phones', 'users.block', 'users.export', 'printers.edit',
  'audit.view', 'config.view', 'config.edit', 'admins.manage', 'catalog.view', 'catalog.edit',
  'feedback.view', 'feedback.edit', 'desk.reset',
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  superadmin: new Set(ALL),
  support: new Set<Permission>([
    'overview.view', 'analytics.view', 'users.view', 'users.phones', 'users.block', 'printers.edit',
    'config.view', 'catalog.view', 'feedback.view', 'feedback.edit',
  ]),
  content: new Set<Permission>(['overview.view', 'analytics.view', 'catalog.view', 'catalog.edit', 'feedback.view']),
  viewer: new Set<Permission>(['overview.view', 'analytics.view', 'users.view', 'catalog.view', 'feedback.view']),
};

export function can(role: string | undefined | null, permission: Permission): boolean {
  return MATRIX[normalizeRole(role)].has(permission);
}

/** Maps the old names (owner / editor) and anything unknown to a current role. Unknown = least access. */
export function normalizeRole(raw: string | undefined | null): Role {
  if (raw === 'owner') return 'superadmin';
  if (raw === 'editor') return 'support';
  return (ROLE_IDS as readonly string[]).includes(raw ?? '') ? (raw as Role) : 'viewer';
}

export const ROLE_INFO: { id: Role; label: string; hint: string }[] = [
  { id: 'superadmin', label: 'Super admin', hint: 'Everything, including team, exports and the audit log' },
  { id: 'support', label: 'Support', hint: 'Users with phone numbers, block / unblock, feedback' },
  { id: 'content', label: 'Content', hint: 'Clipart and template library only; no phone numbers' },
  { id: 'viewer', label: 'Viewer', hint: 'Read-only dashboards; phone numbers hidden' },
];
