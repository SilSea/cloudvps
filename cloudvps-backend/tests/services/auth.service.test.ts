import { mock, describe, it, expect, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// All mock.module calls are hoisted by Bun's test runner (like jest.mock),
// so they intercept imports before any module code executes.
// ---------------------------------------------------------------------------

mock.module('../../src/config/database', () => ({
  prisma: {
    users: {
      findUnique: mock(() => Promise.resolve(null)),
      update: mock(() => Promise.resolve({})),
    },
    policies: {
      findMany: mock(() => Promise.resolve([])),
    },
    consents: {
      findMany: mock(() => Promise.resolve([])),
    },
    roles: {
      findFirst: mock(() => Promise.resolve({ id: 1, role_name: 'users' })),
    },
    $transaction: mock(async (cb: any) =>
      cb({ users: { create: () => Promise.resolve({ id: 1, email: 'new@example.com' }) } })
    ),
  },
}));

mock.module('../../src/config/redis', () => ({
  redis: {
    setex: mock(() => Promise.resolve('OK')),
    get: mock(() => Promise.resolve(null)),
    del: mock(() => Promise.resolve(1)),
    set: mock(() => Promise.resolve('OK')),
  },
}));

mock.module('../../src/utils/hash', () => ({
  hashPassword: mock(() => Promise.resolve('hashed_pw')),
  verifyPassword: mock(() => Promise.resolve(true)),
}));

mock.module('../../src/utils/jwt', () => ({
  jwtUtils: {
    signAccess: mock(() => Promise.resolve('access_token')),
    signRefresh: mock(() => Promise.resolve('refresh_token')),
    signEmailVerify: mock(() => Promise.resolve('verify_token')),
    verifyAccess: mock(() =>
      Promise.resolve({ sub: 1, email: 'test@example.com', role: 'users', type: 'access' })
    ),
    verifyRefresh: mock(() =>
      Promise.resolve({ sub: 1, email: 'test@example.com', role: 'users', type: 'refresh' })
    ),
  },
}));

mock.module('../../src/utils/logger', () => ({
  logger: {
    auth: mock(() => {}),
    payment: mock(() => {}),
    vps: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
  },
}));

mock.module('../../src/services/email.service', () => ({
  emailService: {
    sendVerification: mock(() => Promise.resolve()),
  },
}));

// ---------------------------------------------------------------------------
// Import the module under test and the mocked dependencies.
// These imports are resolved AFTER mock.module has been hoisted.
// ---------------------------------------------------------------------------
import { authService } from '../../src/services/auth.service';
import { prisma } from '../../src/config/database';
import { redis } from '../../src/config/redis';
import { verifyPassword } from '../../src/utils/hash';
import { jwtUtils } from '../../src/utils/jwt';

// ---------------------------------------------------------------------------
// Helper: cast any function to a Bun mock so we can call mock methods on it.
// TypeScript sees the original function types; the cast is safe at runtime.
// ---------------------------------------------------------------------------
const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

// Reusable fixture data
const baseRegisterData = {
  email: 'new@example.com',
  password: 'password123',
  first_name: 'Test',
  last_name: 'User',
  phone: '0812345678',
  address1: '123 Main St',
  address3: 'Bangkok',
  address4: 'Bangkok',
  address5: '10100',
  address6: 'Thailand',
  policy_ids: [] as number[],
};

const dbUser = {
  id: 1,
  email: 'test@example.com',
  password: 'hashed_pw',
  status: true,
  is_verify: false,
  role: { role_name: 'users' },
};

// ---------------------------------------------------------------------------
// Reset every mock to a known default before each test so tests are isolated.
// ---------------------------------------------------------------------------
beforeEach(() => {
  asMock((prisma as any).users.findUnique).mockResolvedValue(null);
  asMock((prisma as any).users.update).mockResolvedValue({});
  asMock((prisma as any).policies.findMany).mockResolvedValue([]);
  asMock((prisma as any).consents.findMany).mockResolvedValue([]);
  asMock((prisma as any).roles.findFirst).mockResolvedValue({ id: 1, role_name: 'users' });
  asMock((prisma as any).$transaction).mockImplementation(async (cb: any) =>
    cb({ users: { create: () => Promise.resolve({ id: 1, email: 'new@example.com' }) } })
  );
  asMock((redis as any).setex).mockResolvedValue('OK');
  asMock((redis as any).get).mockResolvedValue(null);
  asMock((redis as any).del).mockResolvedValue(1);
  asMock(verifyPassword).mockResolvedValue(true);
  asMock((jwtUtils as any).signAccess).mockResolvedValue('access_token');
  asMock((jwtUtils as any).signRefresh).mockResolvedValue('refresh_token');
  asMock((jwtUtils as any).signEmailVerify).mockResolvedValue('verify_token');
  asMock((jwtUtils as any).verifyAccess).mockResolvedValue({
    sub: 1, email: 'test@example.com', role: 'users', type: 'access',
  });
  asMock((jwtUtils as any).verifyRefresh).mockResolvedValue({
    sub: 1, email: 'test@example.com', role: 'users', type: 'refresh',
  });
});

// ===========================================================================
// authService.register
// ===========================================================================
describe('authService.register', () => {
  it('throws EMAIL_TAKEN when the email already exists', async () => {
    asMock((prisma as any).users.findUnique).mockResolvedValueOnce(dbUser);
    await expect(authService.register(baseRegisterData)).rejects.toThrow('EMAIL_TAKEN');
  });

  it('throws MISSING_POLICY_CONSENT when not all active policies are accepted', async () => {
    // One active policy exists but caller did not include its id
    asMock((prisma as any).policies.findMany).mockResolvedValueOnce([{ id: 99 }]);
    await expect(
      authService.register({ ...baseRegisterData, policy_ids: [] })
    ).rejects.toThrow('MISSING_POLICY_CONSENT');
  });

  it('throws ROLE_NOT_FOUND when the "users" role is missing from the database', async () => {
    asMock((prisma as any).roles.findFirst).mockResolvedValueOnce(null);
    await expect(authService.register(baseRegisterData)).rejects.toThrow('ROLE_NOT_FOUND');
  });

  it('returns a success message on the happy path', async () => {
    const result = await authService.register(baseRegisterData);
    expect(result.message).toMatch(/verify your email/i);
  });
});

// ===========================================================================
// authService.login
// ===========================================================================
describe('authService.login', () => {
  it('throws INVALID_CREDENTIALS when user does not exist', async () => {
    // findUnique already returns null by default
    await expect(authService.login({ email: 'nobody@example.com', password: 'pw' })).rejects.toThrow(
      'INVALID_CREDENTIALS'
    );
  });

  it('throws ACCOUNT_DISABLED when the account is inactive', async () => {
    asMock((prisma as any).users.findUnique).mockResolvedValueOnce({ ...dbUser, status: false });
    await expect(authService.login({ email: dbUser.email, password: 'pw' })).rejects.toThrow(
      'ACCOUNT_DISABLED'
    );
  });

  it('throws INVALID_CREDENTIALS when the password is wrong', async () => {
    asMock((prisma as any).users.findUnique).mockResolvedValueOnce(dbUser);
    asMock(verifyPassword).mockResolvedValueOnce(false);
    await expect(authService.login({ email: dbUser.email, password: 'wrong' })).rejects.toThrow(
      'INVALID_CREDENTIALS'
    );
  });

  it('returns tokens and user info on successful login', async () => {
    asMock((prisma as any).users.findUnique).mockResolvedValueOnce(dbUser);
    const result = await authService.login({ email: dbUser.email, password: 'password123' });

    expect(result.access_token).toBe('access_token');
    expect(result.refresh_token).toBe('refresh_token');
    expect(result.user.id).toBe(dbUser.id);
    expect(result.user.email).toBe(dbUser.email);
    expect(result.user.role).toBe('users');
  });
});

// ===========================================================================
// authService.refreshToken
// ===========================================================================
describe('authService.refreshToken', () => {
  it('throws INVALID_TOKEN when the JWT is malformed', async () => {
    asMock((jwtUtils as any).verifyRefresh).mockRejectedValueOnce(new Error('Invalid token'));
    await expect(authService.refreshToken('bad.token.here')).rejects.toThrow('INVALID_TOKEN');
  });

  it('throws INVALID_TOKEN when the token is not stored in Redis', async () => {
    // verifyRefresh succeeds but Redis returns null (no stored token)
    asMock((redis as any).get).mockResolvedValueOnce(null);
    await expect(authService.refreshToken('valid.but.not_stored')).rejects.toThrow('INVALID_TOKEN');
  });

  it('throws INVALID_TOKEN when the Redis token does not match', async () => {
    asMock((redis as any).get).mockResolvedValueOnce('different_token');
    await expect(authService.refreshToken('my_refresh_token')).rejects.toThrow('INVALID_TOKEN');
  });

  it('returns a new access token when refresh token is valid', async () => {
    asMock((redis as any).get).mockResolvedValueOnce('my_refresh_token');
    const result = await authService.refreshToken('my_refresh_token');
    expect(result.access_token).toBe('access_token');
  });
});

// ===========================================================================
// authService.logout
// ===========================================================================
describe('authService.logout', () => {
  it('deletes the refresh token from Redis using the correct key', async () => {
    await authService.logout(42, 'any_token');
    expect(asMock((redis as any).del)).toHaveBeenCalledWith('rt:42');
  });

  it('adds access token to Redis blocklist when token has a valid future exp', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 900;
    asMock((jwtUtils as any).verifyAccess).mockResolvedValueOnce({
      sub: 42, email: 'test@example.com', role: 'users', type: 'access', exp: futureExp,
    });
    await authService.logout(42, 'my_access_token');
    expect(asMock((redis as any).set)).toHaveBeenCalledWith(
      'token_block:my_access_token', '1', 'EX', expect.any(Number)
    );
  });

  it('does not blocklist when access token verification fails', async () => {
    asMock((jwtUtils as any).verifyAccess).mockRejectedValueOnce(new Error('bad token'));
    asMock((redis as any).set).mockClear();
    await authService.logout(42, 'bad_token');
    expect(asMock((redis as any).set)).not.toHaveBeenCalled();
  });

  it('does not blocklist when token has no exp field', async () => {
    asMock((jwtUtils as any).verifyAccess).mockResolvedValueOnce({
      sub: 42, email: 'test@example.com', role: 'users', type: 'access',
      // no exp
    });
    asMock((redis as any).set).mockClear();
    await authService.logout(42, 'no_exp_token');
    expect(asMock((redis as any).set)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// authService.verifyEmail
// ===========================================================================
describe('authService.verifyEmail', () => {
  it('throws INVALID_TOKEN when the JWT is malformed', async () => {
    asMock((jwtUtils as any).verifyAccess).mockRejectedValueOnce(new Error('Invalid token'));
    await expect(authService.verifyEmail('bad_token')).rejects.toThrow('INVALID_TOKEN');
  });

  it('throws INVALID_TOKEN when token type is not "email_verify"', async () => {
    asMock((jwtUtils as any).verifyAccess).mockResolvedValueOnce({
      sub: 1, email: 'test@example.com', role: 'users', type: 'access', // wrong type
    });
    await expect(authService.verifyEmail('wrong_type_token')).rejects.toThrow('INVALID_TOKEN');
  });

  it('returns a success message and updates the user on the happy path', async () => {
    asMock((jwtUtils as any).verifyAccess).mockResolvedValueOnce({
      sub: 1, email: 'test@example.com', type: 'email_verify',
    });
    const result = await authService.verifyEmail('valid_verify_token');
    expect(result.message).toMatch(/verified/i);
    expect(asMock((prisma as any).users.update)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { is_verify: true } })
    );
  });
});

// ===========================================================================
// authService.getMe
// ===========================================================================
describe('authService.getMe', () => {
  it('throws USER_NOT_FOUND when the user does not exist', async () => {
    // findUnique returns null by default
    await expect(authService.getMe(99)).rejects.toThrow('USER_NOT_FOUND');
  });

  it('returns an AuthUser object for an existing user', async () => {
    asMock((prisma as any).users.findUnique).mockResolvedValueOnce(dbUser);
    const result = await authService.getMe(1);

    expect(result.id).toBe(1);
    expect(result.email).toBe(dbUser.email);
    expect(result.role).toBe('users');
    expect(typeof result.status).toBe('boolean');
  });
});
