import { test, expect } from '@playwright/test';

test('qibla screen renders and shows bearing', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 30.0444, longitude: 31.2357 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // navigate via sidebar or mobile nav
  const sidebarBtn = page.locator('.sidebar button', { hasText: 'اتجاه القبلة' });
  if (await sidebarBtn.isVisible().catch(() => false)) {
    await sidebarBtn.first().click();
  } else {
    await page.locator('.mobile-nav button', { hasText: 'القبلة' }).first().click();
  }
  await page.waitForTimeout(1500);

  await expect(page.locator('.qibla-page')).toBeVisible();
  await expect(page.locator('.qibla-page')).toContainText('زاوية القبلة');
  // Cairo qibla ~136°
  const text = await page.locator('.qibla-page').innerText();
  expect(text).toMatch(/13[56]/);
});

test('qibla digital-only toggle', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 30.0444, longitude: 31.2357 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const sidebarBtn = page.locator('.sidebar button', { hasText: 'اتجاه القبلة' });
  if (await sidebarBtn.isVisible().catch(() => false)) {
    await sidebarBtn.first().click();
  } else {
    await page.locator('.mobile-nav button', { hasText: 'القبلة' }).first().click();
  }
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: 'عرض رقمي فقط' }).first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('.qibla-digital')).toBeVisible();
  await page.locator('button', { hasText: 'إظهار البوصلة' }).first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('.qibla-compass')).toBeVisible();
});
