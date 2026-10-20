import { Locator, Page } from '@playwright/test';

/** Login page `/login`. Selectors from reports/exploration.md §6 (checked live in Stage 3). */
export class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly invalidCredentialsToast: Locator;
  readonly invalidEmailMessage: Locator;

  constructor(readonly page: Page) {
    this.email = page.getByLabel('Email', { exact: true });
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.invalidCredentialsToast = page.getByText('Invalid email or password');
    this.invalidEmailMessage = page.getByText('Enter a valid email');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async login(email: string, password: string): Promise<void> {
    await fillWithoutLogging(this.email, email);
    await fillWithoutLogging(this.password, password);
    await this.submit.click();
  }
}

/**
 * Types a value into an input without putting it into the report.
 * Playwright's fill/type/insertText write the value into the step title ("Fill \"...\""),
 * so a real password would end up in the HTML report. `evaluate` steps are titled "Evaluate" only.
 * The native value setter plus input/change events is what React listens to.
 */
async function fillWithoutLogging(input: Locator, value: string): Promise<void> {
  await input.click();
  await input.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
