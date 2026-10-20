/**
 * Builds broken versions of a JWT for TC-R1-08. Nothing here signs a token: the test has no key,
 * so every result must be rejected by a safe server.
 */

const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const fromB64url = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

export function decodePayload(token: string): Record<string, unknown> {
  return JSON.parse(fromB64url(token.split('.')[1]));
}

/** Changes one character in the middle of the signature (not the last one, whose low bits may be ignored). */
export function flipSignatureChar(token: string): string {
  const [h, p, s] = token.split('.');
  const i = Math.floor(s.length / 2);
  const c = s[i] === 'A' ? 'B' : 'A';
  return `${h}.${p}.${s.slice(0, i)}${c}${s.slice(i + 1)}`;
}

/** Keeps the original header and signature but changes claims in the payload. */
export function tamperPayload(token: string, changes: Record<string, unknown>): string {
  const [h, , s] = token.split('.');
  return `${h}.${b64url(JSON.stringify({ ...decodePayload(token), ...changes }))}.${s}`;
}

/** An unsigned token: header says "alg": "none", signature is empty. */
export function algNone(token: string, changes: Record<string, unknown> = {}): string {
  const header = b64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  return `${header}.${b64url(JSON.stringify({ ...decodePayload(token), ...changes }))}.`;
}

/** The original header and payload with an empty signature. */
export function stripSignature(token: string): string {
  const [h, p] = token.split('.');
  return `${h}.${p}.`;
}
