import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

function column(page: Page, name: string): Locator {
  return page.getByRole('group', { name: 'Task board' }).getByRole('region', { name, exact: true });
}

/** Drags with real pointer events, in small steps, as dnd-kit expects from a mouse. */
async function dragTo(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Drag source or target is not visible');

  await page.mouse.move(from.x + from.width / 2, from.y + from.height - 8);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}

// Projects are created through the wizard, which needs GitHub; the board uses the seeded one.
const SEEDED_PROJECT = 'AIEvo';

test('a task moved to another column stays there after a reload', async ({ page }) => {
  const taskTitle = `Drag me to Ready ${Date.now()}`;

  await page.goto('/');
  await page
    .getByRole('article', { name: SEEDED_PROJECT })
    .getByRole('link', { name: SEEDED_PROJECT })
    .click();
  await expect(page.getByRole('heading', { name: SEEDED_PROJECT })).toBeVisible();

  await page.getByRole('link', { name: 'New task' }).click();
  const taskSheet = page.getByRole('dialog', { name: 'New task' });
  await taskSheet.getByLabel('Title').fill(taskTitle);
  await taskSheet.getByRole('button', { name: 'Create task' }).click();
  await expect(taskSheet).toBeHidden();

  const card = column(page, 'Draft').getByRole('listitem', { name: taskTitle });
  await expect(card).toBeVisible();

  const saved = page.waitForResponse(
    (response) => response.request().method() === 'PATCH' && /\/api\/tasks\//.test(response.url()),
  );
  await dragTo(page, card, column(page, 'Ready').getByRole('list'));
  expect((await saved).ok()).toBe(true);
  await expect(column(page, 'Ready').getByRole('listitem', { name: taskTitle })).toBeVisible();

  await page.reload();

  await expect(column(page, 'Ready').getByRole('listitem', { name: taskTitle })).toBeVisible();
  await expect(column(page, 'Draft').getByRole('listitem', { name: taskTitle })).toHaveCount(0);
});
