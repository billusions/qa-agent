import { accounts } from './env';

/**
 * Checks for credential leaks without ever printing the secret.
 * Every function returns a boolean or key names only, so a failed assertion shows no secret value.
 */

/** True if the text contains the password of any test account. */
export function containsAccountPassword(text: string): boolean {
  return [accounts.owner.password, accounts.shared.password].some((p) => p && text.includes(p));
}

/** True if the text looks like it holds a password hash (bcrypt or argon2). */
export function containsHashPattern(text: string): boolean {
  return /\$2[abxy]?\$\d{2}\$/.test(text) || /\$argon2(id|i|d)\$/.test(text);
}

/** Key paths whose names suggest a password or hash field, for example `items[0].passwordHash`. */
export function passwordLikeKeys(value: unknown, path = ''): string[] {
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...passwordLikeKeys(v, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k;
      if (/pass(word)?|pwd|hash|salt/i.test(k)) found.push(p);
      found.push(...passwordLikeKeys(v, p));
    }
  }
  return found;
}

/** Text that suggests an internal error leaked: stack trace, SQL or ORM error, query text. */
export function looksLikeInternalError(text: string): boolean {
  return /(stack|\bat \S+ \(|node_modules|sqlstate|syntax error|query failed|prisma|typeorm|sequelize|mongo(db|ose)?\b|postgres|ORA-\d+|SELECT .* FROM|QueryFailedError)/i.test(
    text,
  );
}
