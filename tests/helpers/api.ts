import { APIRequestContext, APIResponse, request as pwRequest } from '@playwright/test';
import { accounts, env, requireEnv } from './env';

/**
 * API client for the auth flows. Routes and shapes come from reports/exploration.md §3–§4.
 * Auth is a Bearer JWT in the Authorization header. There is no cookie and no logout endpoint.
 */

export type Role = 'owner' | 'shared';

/** Protected GET endpoints that need no ids (exploration §3, G-01). */
export const PROTECTED_GETS = ['/auth/me', '/data-rooms', '/shares/received'] as const;

/** A new request context aimed at the API host, with secret-safe errors (see redactingContext). */
export async function newApiContext(): Promise<APIRequestContext> {
  requireEnv('API_BASE_URL');
  return redactingContext(await pwRequest.newContext({ baseURL: env.API_BASE_URL }));
}

/** Removes bearer tokens, JWTs and account passwords from a text. */
export function redact(text: string): string {
  let out = text
    .replace(/Bearer\s+[^\s"'\\]+/gi, 'Bearer <redacted>')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '<redacted-jwt>');
  for (const secret of [accounts.owner.password, accounts.shared.password]) {
    if (secret) out = out.split(secret).join('<redacted>');
  }
  return out;
}

/**
 * When a request fails at network level (for example ECONNRESET), Playwright's error message
 * includes a call log with the request headers, so the Authorization header would reach the report.
 * This wrapper re-throws such errors with tokens and passwords removed.
 */
function redactingContext(ctx: APIRequestContext): APIRequestContext {
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch']);
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || !methods.has(prop) || typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        try {
          return await value.apply(target, args);
        } catch (e) {
          const err = new Error(redact(e instanceof Error ? e.message : String(e)));
          err.stack = redact(e instanceof Error && e.stack ? e.stack : err.message);
          throw err;
        }
      };
    },
  });
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** POST /auth/login with any body. Accepts non-string values on purpose (injection tests). */
export function postLogin(api: APIRequestContext, data: unknown): Promise<APIResponse> {
  return api.post('/auth/login', { data, failOnStatusCode: false });
}

/** Logs in as a test account and returns the token. The error message never contains the secret. */
export async function getToken(api: APIRequestContext, role: Role): Promise<string> {
  requireEnv(role === 'owner' ? 'OWNER_EMAIL' : 'SHARED_EMAIL', role === 'owner' ? 'OWNER_PASSWORD' : 'SHARED_PASSWORD');
  const res = await postLogin(api, accounts[role]);
  if (res.status() !== 200) throw new Error(`Setup: login as ${role} returned ${res.status()}`);
  const token = (await safeJson(res))?.accessToken;
  if (typeof token !== 'string' || !token) throw new Error(`Setup: login as ${role} returned no accessToken`);
  return token;
}

export async function getMe(api: APIRequestContext, token: string): Promise<APIResponse> {
  return api.get('/auth/me', { headers: bearer(token), failOnStatusCode: false });
}

/** Parses JSON, or returns undefined when the body is not JSON. */
export async function safeJson(res: APIResponse): Promise<any> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * Collects anything in a response that could act as a session: an accessToken in the body
 * or a Set-Cookie header. Values are returned for reuse only; never log them.
 */
export async function sessionArtifacts(res: APIResponse): Promise<{ token?: string; cookies: string[] }> {
  const body = await safeJson(res);
  const token = body && typeof body === 'object' && typeof body.accessToken === 'string' ? body.accessToken : undefined;
  const cookies = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  return { token, cookies };
}

/** Lowercases an email for comparison with /auth/me (the API always returns lowercase). */
export function sameEmail(a: unknown, b: string): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.trim().toLowerCase();
}

/** An email that surely has no account. Prefix per CLAUDE.md. */
export function unregisteredEmail(label = ''): string {
  return `qa-agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${label ? `-${label}` : ''}@example.invalid`;
}
