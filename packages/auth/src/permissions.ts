export type PermissionPolicy<Role extends string, PermissionName extends string> = Readonly<
  Record<Role, ReadonlySet<PermissionName>>
>;

export function createPermissionChecker<Role extends string, PermissionName extends string>(
  policy: PermissionPolicy<Role, PermissionName>,
): (role: Role, permission: PermissionName) => boolean {
  return (role, permission) => policy[role]?.has(permission) ?? false;
}

export type StaffRole = "admin" | "staff";

export type Permission =
  | "orders:operate"
  | "shop:pause"
  | "availability:snooze"
  | "menu:edit"
  | "pricing:edit"
  | "cms:edit"
  | "users:manage"
  | "settings:manage";

export const mcelloRolePermissions: PermissionPolicy<StaffRole, Permission> = {
  admin: new Set([
    "orders:operate",
    "shop:pause",
    "availability:snooze",
    "menu:edit",
    "pricing:edit",
    "cms:edit",
    "users:manage",
    "settings:manage",
  ]),
  staff: new Set([
    "orders:operate",
    "shop:pause",
    "availability:snooze",
  ]),
};

export const hasPermission = createPermissionChecker(mcelloRolePermissions);
