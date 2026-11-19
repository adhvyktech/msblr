export const PERMS = [
  'members.view_private', 'members.edit', 'registrations.approve', 'logins.approve',
  'payments.verify', 'receipts.view', 'receipts.export', 'businesses.approve',
  'events.post', 'highlights.post', 'trusts.edit', 'contacts.edit', 'banners.edit',
  'ads.manage', 'ads.approve', 'notifications.send', 'reports.view', 'audit.view',
  'roles.manage', 'settings.edit', 'dashboard.view',
] as const;
export type Perm = (typeof PERMS)[number];

export const ROLE_NAMES = ['super_admin', 'admin', 'finance', 'content', 'ad_manager', 'head', 'family_viewer', 'advertiser'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_PERMS: Record<RoleName, readonly Perm[]> = {
  super_admin: PERMS,
  admin: PERMS.filter((p) => p !== 'roles.manage' && p !== 'settings.edit'),
  finance: ['payments.verify', 'receipts.view', 'receipts.export', 'reports.view', 'dashboard.view'],
  content: ['events.post', 'highlights.post', 'dashboard.view'],
  ad_manager: ['ads.manage', 'ads.approve', 'banners.edit', 'reports.view', 'dashboard.view'],
  head: [],
  family_viewer: [],
  advertiser: [],
};
export const STAFF_ROLES: readonly RoleName[] = ['super_admin', 'admin', 'finance', 'content', 'ad_manager'];
