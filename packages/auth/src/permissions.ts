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

const rolePermissions: Record<StaffRole, ReadonlySet<Permission>> = {
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

export function hasPermission(role: StaffRole, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}
