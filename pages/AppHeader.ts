import { Locator, Page } from '@playwright/test';

/**
 * Header of the logged-in area. Selectors from reports/exploration.md §6.
 * Stage 3 took them from the JS bundle; the Stage 4 E2E run confirms them live.
 */
export class AppHeader {
  readonly signOut: Locator;
  readonly myDataRooms: Locator;
  readonly sharedWithMe: Locator;

  constructor(readonly page: Page) {
    this.signOut = page.getByRole('button', { name: 'Sign out' });
    this.myDataRooms = page.getByRole('link', { name: 'My data rooms' });
    this.sharedWithMe = page.getByRole('link', { name: 'Shared with me' });
  }
}
