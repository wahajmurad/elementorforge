import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, hmacSign, requestSignatureBase, encryptSecret, decryptSecret, pairingCode, randomToken, sha256 } from '@/lib/crypto';
import { createHmac } from 'crypto';

describe('crypto', () => {
  it('hashes and verifies passwords with scrypt', () => {
    const h = hashPassword('correct horse battery');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('correct horse battery', h)).toBe(true);
    expect(verifyPassword('wrong password', h)).toBe(false);
    expect(verifyPassword('x', 'garbage')).toBe(false);
  });

  it('signs requests exactly the way the plugin verifies them', () => {
    const secret = randomToken(32);
    const body = JSON.stringify({ hello: 'world' });
    const ts = Math.floor(Date.now() / 1000).toString();
    const base = requestSignatureBase('POST', '/wp-json/aelc/v1/pages', body, ts);
    const sig = hmacSign(secret, base);
    // Independent recomputation (mirrors the PHP plugin implementation)
    const expected = createHmac('sha256', secret)
      .update(`POST\n/wp-json/aelc/v1/pages\n${sha256(body)}\n${ts}`)
      .digest('hex');
    expect(sig).toBe(expected);
  });

  it('round-trips vault secrets (AES-256-GCM)', () => {
    const secret = 'whiskers-and-hmac-secrets-42';
    const enc = encryptSecret(secret);
    expect(enc.startsWith('v1.')).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
    // tamper with the ciphertext segment → GCM auth must fail
    const parts = enc.split('.');
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('produces unambiguous pairing codes', () => {
    for (let i = 0; i < 20; i++) expect(pairingCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
});
