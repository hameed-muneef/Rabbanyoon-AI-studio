import { test, expect } from '@playwright/test';

const EMAIL = 'gui-audit-20261103@example.com';
const PASSWORD = 'TestGui2026!';

async function login(page: any) {
  await page.goto('/');
  await page.waitForTimeout(1000);
  await page.evaluate(async ({ email, password }) => {
    const mod: any = await import('/src/auth.ts');
    const client = mod.authClient;
    if (client) await client.auth.signInWithPassword({ email, password });
  }, { email: EMAIL, password: PASSWORD });
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function openReader(page: any) {
  await login(page);
  // Check if sidebar is visible (desktop)
  const sidebarVisible = await page.locator('.sidebar').isVisible().catch(() => false);
  if (sidebarVisible) {
    await page.locator('.sidebar button', { hasText: 'القرآن والسنة' }).first().click();
  } else {
    await page.locator('.mobile-nav button', { hasText: 'القرآن' }).first().click();
  }
  await page.waitForTimeout(1000);
  await page.locator('button', { hasText: 'المصحف الشريف' }).first().click();
  await page.waitForSelector('.quran-reader', { timeout: 20000 });
  await page.waitForTimeout(1000);
}

test('reader stays paper in light theme', async ({ page }) => {
  await openReader(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(500);
  await expect(page.locator('.quran-reader')).toHaveScreenshot('reader-light.png', {
    maxDiffPixelRatio: 0.02,
    timeout: 15000,
    animations: 'disabled',
  });
});

test('reader stays paper in dark theme', async ({ page }) => {
  await openReader(page);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(500);
  await expect(page.locator('.quran-reader')).toHaveScreenshot('reader-dark.png', {
    maxDiffPixelRatio: 0.02,
    timeout: 15000,
    animations: 'disabled',
  });
});