import bcrypt from "bcryptjs";

// 10 rounds is the bcrypt default — slow enough to resist brute-force,
// fast enough that a single login doesn't visibly lag (~100 ms on modern hardware).
const SALT_ROUNDS = 10;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, SALT_ROUNDS);

export const verifyPassword = (plain: string, hashed: string): Promise<boolean> =>
  bcrypt.compare(plain, hashed);
