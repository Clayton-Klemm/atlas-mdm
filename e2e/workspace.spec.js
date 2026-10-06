import { test, expect } from '@playwright/test';

async function signIn(page, role = 'steward') {
  await page.goto('/');
  await page.locator(`input[name="role"][value="${role}"]`).check();
  await page.getByRole('button', { name: 'Enter the workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your data, at a glance.' })).toBeVisible();
}
async function nav(page, label) {
  await page.locator('#primary-nav').getByRole('button', { name: label, exact: false }).click();
}

test('steward creates, reviewer approves, and the browser shows ERP delivery and audit history', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await expect(page.getByText('Average data quality', { exact: true })).toBeVisible();
  if (process.env.CAPTURE_PORTFOLIO)
    await page.screenshot({ path: 'docs/images/dashboard.png', fullPage: true });
  await nav(page, 'Product catalog');
  await page.getByRole('button', { name: 'New product', exact: true }).click();
  const dialog = page.locator('#product-dialog');
  await dialog.getByLabel('SKU', { exact: true }).fill('UI-CB-20');
  await dialog.getByLabel('Product name', { exact: true }).fill('UI 20 A circuit breaker');
  await dialog.getByLabel('Manufacturer', { exact: true }).fill('Portfolio Electric');
  await dialog.getByLabel('Manufacturer part number', { exact: true }).fill('UI-PART-20');
  await dialog.getByLabel('Voltage (V)', { exact: true }).fill('120');
  await dialog.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(dialog.getByText('All active quality rules pass.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(dialog.locator('.badge')).toHaveText('In review');
  await expect(dialog.getByRole('button', { name: 'Approve record' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close product details' }).click();
  await page.getByRole('button', { name: 'Sign out and switch role' }).click();
  await signIn(page, 'reviewer');
  await nav(page, 'Product catalog');
  await page.getByRole('button', { name: 'UI 20 A circuit breaker', exact: true }).click();
  await dialog.getByRole('button', { name: 'Approve record', exact: true }).click();
  await expect(dialog.locator('.badge')).toHaveText('Approved');
  await dialog.getByRole('button', { name: 'Publish to ERP', exact: true }).click();
  await expect(dialog.locator('.badge')).toHaveText('Published');
  await dialog.getByRole('button', { name: 'Close product details' }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/erp/materials');
      return (await response.json()).data.some((material) => material.MATNR === 'UI-CB-20');
    })
    .toBe(true);
  await nav(page, 'Integrations');
  await expect(page.getByRole('heading', { name: 'Downstream material records' })).toBeVisible();
  await expect(
    page
      .getByRole('table', { name: 'Mock ERP material records' })
      .getByText('UI-CB-20', { exact: true }),
  ).toBeVisible();
  await nav(page, 'Audit trail');
  await expect(page.getByText('Publish', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('import preview preserves data, import succeeds, and duplicate import explains the rejected batch', async ({
  page,
}) => {
  await signIn(page);
  await nav(page, 'Import & export');
  await page.getByRole('button', { name: 'Load sample catalog', exact: true }).click();
  const before = (await (await page.request.get('/api/products')).json()).data.length;
  await page.getByRole('button', { name: 'Preview & validate', exact: true }).click();
  const commit = page.getByRole('button', { name: 'Import 3 products', exact: true });
  await expect(commit).toBeVisible();
  expect((await (await page.request.get('/api/products')).json()).data.length).toBe(before);
  await commit.click();
  await expect
    .poll(async () => (await (await page.request.get('/api/products')).json()).data.length)
    .toBe(before + 3);
  await page.getByRole('button', { name: 'Load sample catalog', exact: true }).click();
  await page.getByRole('button', { name: 'Preview & validate', exact: true }).click();
  await expect(page.locator('.import-errors')).toContainText('The entire import was rejected');
});

test('quality feedback blocks a bad draft and stale browser saves offer refresh', async ({
  page,
}) => {
  await signIn(page);
  await nav(page, 'Product catalog');
  await page.getByRole('button', { name: 'Open WIRE-BARE-4', exact: true }).click();
  const dialog = page.locator('#product-dialog');
  await dialog.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(dialog.locator('.record-error')).toContainText('Resolve the quality issues');
  const products = (await (await page.request.get('/api/products?search=WIRE-BARE-4')).json()).data;
  await page.request.put(`/api/products/${products[0].id}`, {
    headers: { 'X-Atlas-Request': 'true' },
    data: { version: products[0].version, source: 'Changed in another tab' },
  });
  await dialog.getByLabel('Product name', { exact: true }).fill('4 AWG bare copper grounding wire');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Reload latest version', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Reload latest version', exact: true }).click();
  await expect(dialog.getByLabel('Source', { exact: true })).toHaveValue('Changed in another tab');
});

test('mobile workspace fits the screen and its navigation remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (process.env.CAPTURE_PORTFOLIO)
    await page.screenshot({ path: 'docs/images/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await nav(page, 'Integrations');
  await expect(
    page.getByRole('button', { name: 'Configure mock failures', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
