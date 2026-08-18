import {
  createPermissionChecker,
  type PermissionPolicy,
} from "@business-web/auth";

/**
 * Lebtig role vocabulary from the current Lovable source snapshot.
 * Database/RLS remains the authority; this policy is the shared application model.
 */
export type LebtigRole = "admin" | "moderator";

export type LebtigPermission =
  | "content:edit"
  | "content:publish"
  | "media:manage"
  | "inquiries:manage"
  | "inquiries:delete"
  | "pages:manage"
  | "settings:manage"
  | "users:manage";

export const lebtigRolePermissions: PermissionPolicy<LebtigRole, LebtigPermission> = {
  admin: new Set([
    "content:edit",
    "content:publish",
    "media:manage",
    "inquiries:manage",
    "inquiries:delete",
    "pages:manage",
    "settings:manage",
    "users:manage",
  ]),
  moderator: new Set([
    "content:edit",
    "content:publish",
    "media:manage",
    "inquiries:manage",
  ]),
};

export const hasLebtigPermission = createPermissionChecker(lebtigRolePermissions);
