import { test, expect } from '@playwright/test';

test.describe('smoke — public surface', () => {
  test('home renders hero and a shelf', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /a music room/i })).toBeVisible();
    await expect(page.getByText(/Fresh/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('discover dial loads with year labels', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: /spin a blockbuster/i })).toBeVisible();
    await expect(page.getByText('2000')).toBeVisible();
    await expect(page.getByText('2025')).toBeVisible();
  });

  test('search input is focused and shows hints', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByPlaceholder(/Kesariya/i)).toBeFocused();
    await expect(page.getByText(/Tum Hi Ho/i)).toBeVisible();
  });

  test('moods grid shows all eight chips', async ({ page }) => {
    await page.goto('/moods');
    for (const label of ['Romantic', 'Party', 'Chill', 'Melancholic', 'Workout', 'Focus', 'Monsoon', 'Late Night']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('not-found page is styled', async ({ page }) => {
    await page.goto('/definitely-not-a-real-path');
    await expect(page.getByText(/off the record/i)).toBeVisible();
  });
});
