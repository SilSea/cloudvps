import { describe, it, expect } from 'bun:test';
import { requireAuth, requireRoles } from '../../src/middlewares/rbac.middleware';
import type { AuthUser } from '../../src/types';

const user: AuthUser = {
  id: 1,
  email: 'user@example.com',
  role: 'users',
  status: true,
  is_verify: true,
};

describe('requireAuth', () => {
  it('sets status 401 and returns error body when user is null', () => {
    const set: any = {};
    const result = requireAuth({ user: null, set });
    expect(set.status).toBe(401);
    expect(result).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns undefined when user is present (allows request through)', () => {
    const set: any = {};
    const result = requireAuth({ user, set });
    expect(result).toBeUndefined();
    expect(set.status).toBeUndefined();
  });
});

describe('requireRoles', () => {
  it('sets status 401 when user is null', () => {
    const set: any = {};
    const result = requireRoles('admin')({ user: null, set });
    expect(set.status).toBe(401);
    expect(result).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('sets status 403 when user lacks the required role', () => {
    const set: any = {};
    const result = requireRoles('admin')({ user, set }); // user has role "users"
    expect(set.status).toBe(403);
    expect(result).toEqual({ success: false, message: 'Forbidden' });
  });

  it('returns undefined when user has the exact required role', () => {
    const set: any = {};
    const result = requireRoles('users')({ user, set });
    expect(result).toBeUndefined();
  });

  it('returns undefined when user role is among multiple allowed roles', () => {
    const set: any = {};
    const result = requireRoles('admin', 'users')({ user, set });
    expect(result).toBeUndefined();
  });
});
