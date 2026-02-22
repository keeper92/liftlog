/* eslint-disable @typescript-eslint/no-require-imports */
const { test, expect } = require('@playwright/test');

const OUTBOX_KEY = 'workout-outbox';

async function loginViaDemo(page) {
  await page.goto('/login');

  if (!page.url().includes('/dashboard')) {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;

    if (email && password) {
      await expect(page.getByLabel(/^email$/i)).toBeVisible();
      await page.getByLabel(/^email$/i).fill(email);
      await page.getByLabel(/^password$/i).fill(password);
      await page.getByRole('button', { name: /^sign in$/i }).click();
    } else {
      await expect(page.getByRole('button', { name: /try demo/i })).toBeVisible();
      await page.getByRole('button', { name: /try demo/i }).click();
    }

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 120_000 });
  }

  const skipTourButton = page.getByRole('button', { name: /^skip$/i });
  if (await skipTourButton.isVisible().catch(() => false)) {
    await skipTourButton.click();
  }
}

async function outboxCount(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;

    try {
      const parsed = JSON.parse(raw);
      return parsed?.state?.items?.length ?? 0;
    } catch {
      return -1;
    }
  }, OUTBOX_KEY);
}

test('queues workout finish locally and auto-syncs when connection returns', async ({ page, context }) => {
  await loginViaDemo(page);

  const startOrResume = page.getByRole('button', { name: /start workout|resume workout/i }).first();
  await expect(startOrResume).toBeVisible();
  await startOrResume.click();
  await expect(page).toHaveURL(/\/workout\/[^/?#]+/);

  // Force Supabase failures to simulate bad connectivity while finishing.
  await context.route('**/auth/v1/**', (route) => route.abort('failed'));
  await context.route('**/rest/v1/**', (route) => route.abort('failed'));

  await page.getByRole('button', { name: /^finish$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await expect.poll(() => outboxCount(page), { timeout: 20_000 }).toBeGreaterThan(0);

  await expect(
    page.getByText(/saved offline|pending sync|queued for sync|syncing/i).first(),
  ).toBeVisible();

  await context.unroute('**/auth/v1/**');
  await context.unroute('**/rest/v1/**');

  await page.reload();

  await expect.poll(() => outboxCount(page), { timeout: 90_000 }).toBe(0);
  await expect(page.getByText(/saved offline|pending sync|queued for sync|syncing/i)).toHaveCount(0);
});
