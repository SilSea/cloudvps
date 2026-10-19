import { mock, describe, it, expect } from 'bun:test';

// Hoisted before imports — provides fake secrets so env.ts does not throw
mock.module('../../src/config/env', () => ({
  env: {
    jwt: {
      accessSecret: 'test-access-secret-at-least-32-chars!!',
      refreshSecret: 'test-refresh-secret-at-least-32-chars!',
    },
  },
}));

import { jwtUtils } from '../../src/utils/jwt';

const payload = { sub: 42, email: 'user@example.com', role: 'users' as const };

describe('signAccess / verifyAccess', () => {
  it('round-trips correctly', async () => {
    const token = await jwtUtils.signAccess(payload);

    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const decoded = await jwtUtils.verifyAccess(token);
    expect(decoded.sub).toBe(42);
    expect(decoded.email).toBe('user@example.com');
    expect(decoded.role).toBe('users');
    expect(decoded.type).toBe('access');
  });

  it('throws "Invalid token" on a malformed token (too few parts)', async () => {
    await expect(jwtUtils.verifyAccess('only.two')).rejects.toThrow('Invalid token');
    await expect(jwtUtils.verifyAccess('singlepart')).rejects.toThrow('Invalid token');
  });

  it('throws "Invalid token signature" on a tampered signature', async () => {
    const token = await jwtUtils.signAccess(payload);
    const parts = token.split('.');
    // Flip the first character of the signature to produce a wrong-but-valid base64url value
    const sig = parts[2];
    parts[2] = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    await expect(jwtUtils.verifyAccess(parts.join('.'))).rejects.toThrow('Invalid token signature');
  });
});

describe('signRefresh / verifyRefresh', () => {
  it('round-trips correctly', async () => {
    const token = await jwtUtils.signRefresh(payload);
    const decoded = await jwtUtils.verifyRefresh(token);

    expect(decoded.sub).toBe(42);
    expect(decoded.type).toBe('refresh');
  });

  it('throws when an access token is verified with verifyRefresh (different secret)', async () => {
    const accessToken = await jwtUtils.signAccess(payload);
    await expect(jwtUtils.verifyRefresh(accessToken)).rejects.toThrow('Invalid token signature');
  });
});

describe('signEmailVerify', () => {
  it('creates a token verifiable by verifyAccess with type "email_verify"', async () => {
    const token = await jwtUtils.signEmailVerify({ sub: 7, email: 'verify@example.com' });
    const decoded = (await jwtUtils.verifyAccess(token)) as any;

    expect(decoded.sub).toBe(7);
    expect(decoded.email).toBe('verify@example.com');
    expect(decoded.type).toBe('email_verify');
  });
});
