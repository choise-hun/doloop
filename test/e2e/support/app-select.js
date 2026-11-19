// 공용 선택창(AppSelect) E2E 조작·검증 헬퍼 (AS-1)
'use strict';
const { expect } = require('@playwright/test');

async function pickOption(page, id, value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  await page.locator(`#${id}`).click();
  await page.locator(`#${id}-list [data-value="${escaped}"]`).click();
  await expect(page.locator(`#${id}-list`)).toHaveCount(0);
}

async function expectValue(page, id, value) {
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', String(value));
}

module.exports = { pickOption, expectValue };
