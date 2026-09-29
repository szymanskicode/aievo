import { expect, test } from '@playwright/test';

import { RUN_PROJECT, seedRunFixtures } from './run-fixtures';
import type { RunFixtures } from './run-fixtures';

let fixtures: RunFixtures | undefined;

test.beforeAll(async () => {
  fixtures = await seedRunFixtures();
});

test.afterAll(async () => {
  // Missing when seeding failed; its error is the one to see.
  await fixtures?.cleanUp();
});

test('a task run by the agent ends with a pull request', async ({ page }) => {
  if (!fixtures) throw new Error('The run fixtures were not seeded');
  const { projectId } = fixtures;
  const taskTitle = `Add a greeting ${Date.now()}`;
  const pullRequestUrl = `https://github.com/${RUN_PROJECT.owner}/${RUN_PROJECT.repo}/pull/7`;

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole('heading', { name: RUN_PROJECT.name })).toBeVisible();

  await page.getByRole('link', { name: 'New task' }).click();
  const newTask = page.getByRole('dialog', { name: 'New task' });
  await newTask.getByLabel('Title').fill(taskTitle);
  await newTask.getByRole('button', { name: 'Create task' }).click();
  await expect(newTask).toBeHidden();

  await page.getByRole('link', { name: taskTitle }).click();
  const taskPanel = page.getByRole('dialog', { name: 'Edit task' });
  const runAgent = taskPanel.getByRole('button', { name: 'Run agent' });
  await expect(runAgent).toBeEnabled();
  await runAgent.click();

  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: `Run of “${taskTitle}”` })).toBeVisible();

  const implement = page.getByRole('listitem', { name: 'Programista implements the task' });
  await expect(implement.getByRole('listitem', { name: 'write_file' })).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(page.getByText('Succeeded', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('listitem', { name: 'Platform runs the tests' })).toBeVisible();

  const pullRequest = page.getByRole('link', { name: '#7' });
  await expect(pullRequest).toHaveAttribute('href', pullRequestUrl);
  await expect(page.getByRole('region', { name: 'Agent summary' })).toContainText(
    'Added greet(name) with a unit test.',
  );

  // A tool call shows what it returned on demand.
  const testCommand = implement.getByRole('listitem', { name: 'run_command' });
  await testCommand.getByRole('button').click();
  await expect(testCommand.getByLabel('Result of run_command')).toContainText('greeting.test.ts');

  // The board shows the pull request on the card (the task panel would hide the board).
  await page.goto(`/projects/${projectId}`);
  const card = page.getByRole('listitem', { name: taskTitle });
  await expect(card.getByRole('link', { name: 'PR #7' })).toHaveAttribute('href', pullRequestUrl);
});
