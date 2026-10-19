import { describe, it, expect } from 'bun:test';
import { hashPassword, verifyPassword } from '../../src/utils/hash';

describe('hashPassword', () => {
  it('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('secret123');
    expect(typeof hash).toBe('string');
    expect(hash.startsWith('$2')).toBe(true);
    expect(hash).not.toBe('secret123');
  });

  it('generates unique hashes for the same input (salting)', async () => {
    const [h1, h2] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(h1).not.toBe(h2);
  });
});

describe('verifyPassword', () => {
  it('returns true for a matching password', async () => {
    const hash = await hashPassword('mypassword');
    expect(await verifyPassword('mypassword', hash)).toBe(true);
  });

  it('returns false for a non-matching password', async () => {
    const hash = await hashPassword('mypassword');
    expect(await verifyPassword('wrongpassword', hash)).toBe(false);
  });

  it('returns false for an empty string against a valid hash', async () => {
    const hash = await hashPassword('mypassword');
    expect(await verifyPassword('', hash)).toBe(false);
  });
});
