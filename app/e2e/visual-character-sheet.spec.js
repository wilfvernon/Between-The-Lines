import { test, expect } from '@playwright/test';

test.describe('Character sheet visual fixtures', () => {
  test.beforeEach(async ({ page }) => {
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }
      `
    });
  });

  test('creatures tab list baseline', async ({ page }) => {
    await page.goto('/__visual/creatures');
    await expect(page.locator('.creatures-tab h2')).toBeVisible();
    await expect(page.locator('.creature-row-card')).toHaveCount(1);

    await expect(page).toHaveScreenshot('visual-creatures-list.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02
    });
  });

  test('creature modal baseline', async ({ page }) => {
    await page.goto('/__visual/creatures');
    await page.locator('.creature-row-card').first().click();
    await expect(page.locator('.creature-modal')).toBeVisible();

    await expect(page).toHaveScreenshot('visual-creatures-modal.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02
    });
  });
});
