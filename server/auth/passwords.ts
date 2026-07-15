import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');

  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, storedHash] = passwordHash.split('$');

  if (algorithm !== 'scrypt' || !salt || !storedHash) {
    return false;
  }

  const candidateHash = scryptSync(password, salt, storedHash.length / 2).toString('hex');
  const storedHashBuffer = Buffer.from(storedHash, 'hex');
  const candidateHashBuffer = Buffer.from(candidateHash, 'hex');

  if (storedHashBuffer.length !== candidateHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(storedHashBuffer, candidateHashBuffer);
}
