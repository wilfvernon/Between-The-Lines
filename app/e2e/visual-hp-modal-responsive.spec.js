import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'desktop-1366x768', width: 1366, height: 768 },
  { name: 'laptop-1280x720', width: 1280, height: 720 },
  { name: 'netbook-1024x600', width: 1024, height: 600 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'iphone-se-375x667', width: 375, height: 667 },
  { name: 'mobile-landscape-667x375', width: 667, height: 375 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'mobile-360x740', width: 360, height: 740 },
  { name: 'mobile-320x568', width: 320, height: 568 }
];

const assertInViewport = async (page, selector) => {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
};

test.describe('HP modal responsive visibility', () => {
  for (const vp of viewports) {
    test(`calculator controls visible on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/__visual/hp-modal');

      await expect(page.locator('.hp-modal')).toBeVisible();
      await expect(page.locator('.hp-calculator-inputs')).toBeVisible();
      await expect(page.locator('.hp-damage-btn')).toBeVisible();
      await expect(page.locator('.hp-healing-btn')).toBeVisible();
      await expect(page.locator('.hp-calculator-inputs input')).toBeVisible();

      await assertInViewport(page, '.hp-calculator-inputs');
      await assertInViewport(page, '.hp-damage-btn');
      await assertInViewport(page, '.hp-healing-btn');

      await expect(page).toHaveScreenshot(`visual-hp-modal-${vp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.02
      });
    });
  }
});
