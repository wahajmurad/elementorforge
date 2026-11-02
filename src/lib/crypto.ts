import crypto from 'crypto';

/**
 * Cryptographic primitives for ElementorForge.
 * - Password hashing: scrypt (node built-in, no native deps)
 * - API/pairing tokens: 32-byte CSPRNG, only sha256 hashes stored for lookup
 * - Request signing: HMAC-SHA256 over (method, path, body, timestamp)
 * - Secret vault: AES-256-GCM for credentials at rest (hmac secrets, WP app passwords)
 */

const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: +n, r: +r, p: +p });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Short human-friendly pairing code (e.g. 7F3K-9QM2) */
export function pairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n: number) => Array.from(crypto.randomBytes(n)).map(b => alphabet[b % alphabet.length]).join('');
  return `${pick(4)}-${pick(4)}`;
}

export function hmacSign(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function hmacVerify(secret: string, payload: string, signature: string): boolean {
  const a = Buffer.from(hmacSign(secret, payload), 'hex');
  const b = Buffer.from(signature, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Signature base string used by both the SaaS client and the WP plugin. */
export function requestSignatureBase(method: string, path: string, body: string, timestamp: string): string {
  const bodyHash = sha256(body || '');
  return `${method.toUpperCase()}\n${path}\n${bodyHash}\n${timestamp}`;
}

// ---------------------------------------------------------------------------
// Secret vault (AES-256-GCM). Key from SECRET_VAULT_KEY (hex 64 chars = 32 bytes)
// or derived from APP_SECRET. In production set SECRET_VAULT_KEY explicitly.
// ---------------------------------------------------------------------------

function vaultKey(): Buffer {
  const hex = process.env.SECRET_VAULT_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  const seed = process.env.APP_SECRET || 'elementorforge-dev-insecure-key';
  return crypto.scryptSync(seed, 'elementorforge-vault', 32, { N: 16384, r: 8, p: 1 });
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${enc.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, dataB64, tagB64] = payload.split('.');
  if (version !== 'v1') throw new Error('Unknown vault version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

/** Constant-time string compare */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
