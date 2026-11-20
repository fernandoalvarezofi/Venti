/** Roles dentro de una organización y los permisos que otorgan. */
export const ORG_ROLES = ['owner', 'admin', 'manager', 'finance', 'sales', 'access_staff', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PERMISSIONS = [
  'org.manage',
  'members.manage',
  'events.read',
  'events.write',
  'events.publish',
  'inventory.write',
  'tickets.courtesy',
  'tickets.read',
  'finance.read',
  'finance.write',
  'access.scan',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<OrgRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'org.manage'),
  manager: ['events.read', 'events.write', 'events.publish', 'inventory.write', 'tickets.courtesy', 'tickets.read', 'access.scan'],
  finance: ['events.read', 'tickets.read', 'finance.read', 'finance.write', 'audit.read'],
  sales: ['events.read', 'tickets.read'],
  access_staff: ['events.read', 'access.scan'],
  viewer: ['events.read'],
};

export function roleHas(role: OrgRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsOf(role: OrgRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
