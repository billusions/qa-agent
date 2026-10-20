import fs from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const KEYS = [
  'BASE_URL',
  'API_BASE_URL',
  'OWNER_EMAIL',
  'OWNER_PASSWORD',
  'SHARED_EMAIL',
  'SHARED_PASSWORD',
] as const;

type Key = (typeof KEYS)[number];

/** Values from .env. Missing keys are '' here; call requireEnv() where a value is needed. */
export const env = Object.fromEntries(KEYS.map((k) => [k, process.env[k] ?? ''])) as Record<Key, string>;

/** Fails fast with the key name only — never the value. */
export function requireEnv(...keys: Key[]): void {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')} (see .env.example)`);
}

/** Test accounts by role. Keep secrets out of test titles and logs. */
export const accounts = {
  owner: { email: env.OWNER_EMAIL, password: env.OWNER_PASSWORD },
  shared: { email: env.SHARED_EMAIL, password: env.SHARED_PASSWORD },
};

/** Unique prefix for test data, per CLAUDE.md: qa-agent-<timestamp>- */
export function uniqueName(label = ''): string {
  return `qa-agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${label ? `-${label}` : ''}`;
}
