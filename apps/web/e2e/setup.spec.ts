import { expect, test } from '@playwright/test';

test('a fresh instance shows the first-run checklist', async ({ page }) => {
  await page.goto('/');

  const checklist = page.getByRole('region', { name: 'Getting started' });
  await expect(checklist).toContainText('0 of 3 steps done');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /setup incomplete/ }),
  ).toBeVisible();

  await checklist.getByRole('link', { name: 'Open GitHub settings' }).click();
  await expect(page.getByRole('heading', { name: 'GitHub' })).toBeVisible();
  await expect(page.getByText('No GitHub token yet')).toBeVisible();
});
