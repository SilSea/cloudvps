import type { RoleName, AuthUser } from "../types";

// Used as a `beforeHandle` hook inside `.guard()`. Returns a response object
// to short-circuit the handler; returning nothing lets the request through.

// Blocks unauthenticated requests (no valid Bearer token).
export const requireAuth = ({ user, set }: { user: AuthUser | null; set: any }) => {
  if (!user) {
    set.status = 401;
    return { success: false, message: "Unauthorized" };
  }
};

// Returns a guard function that checks for a specific set of allowed roles.
// 401 when there is no user at all; 403 when the user's role is not permitted.
export const requireRoles =
  (...roles: RoleName[]) =>
  ({ user, set }: { user: AuthUser | null; set: any }) => {
    if (!user) {
      set.status = 401;
      return { success: false, message: "Unauthorized" };
    }
    if (!roles.includes(user.role)) {
      set.status = 403;
      return { success: false, message: "Forbidden" };
    }
  };
