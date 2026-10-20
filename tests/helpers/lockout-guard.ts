/**
 * Guard for G-08 (lockout policy unknown, shared test accounts).
 *
 * Human QA decision: never send repeated wrong passwords to the Owner or Shared accounts.
 * Only TC-R1-02 sends one wrong password per account per run. Every other step that would send
 * a wrong password to a real account is skipped, unless the human QA sets
 * QA_ALLOW_REAL_ACCOUNT_WRONG_PASSWORDS=1 after G-08 is answered.
 */
export const realAccountWrongPasswordsAllowed = process.env.QA_ALLOW_REAL_ACCOUNT_WRONG_PASSWORDS === '1';

export const G08_REASON = 'needs human decision: G-08 (would send extra wrong passwords to a shared test account)';
