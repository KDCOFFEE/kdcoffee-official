import {
  adminPermissions,
  readAdminSession,
  type AdminPermission,
  type AdminSession,
} from "@/lib/adminAuth";

export { adminPermissions };
export type { AdminPermission, AdminSession };

export class AdminAuthorizationError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? "未授權" : "權限不足");
    this.name = "AdminAuthorizationError";
    this.status = status;
  }
}

export async function getAdminSession() {
  return readAdminSession();
}

export function hasAdminPermission(session: AdminSession | null, permission: AdminPermission) {
  return Boolean(session && !session.legacy && session.permissions.includes(permission));
}

export async function requireAdminAuthenticated(options?: { session: AdminSession | null }) {
  const session = options ? options.session : await getAdminSession();
  if (!session) throw new AdminAuthorizationError(401);
  return session;
}

export async function requireAdminPermission(
  permission: AdminPermission,
  options?: { session: AdminSession | null },
) {
  const session = await requireAdminAuthenticated(options);
  if (!hasAdminPermission(session, permission)) throw new AdminAuthorizationError(403);
  return session;
}
