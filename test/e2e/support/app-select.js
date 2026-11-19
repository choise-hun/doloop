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

// id를 모르는 박스(AS-2 .ab-select처럼 id 자동 생성)를 로케이터로 조작한다
async function pickOptionAt(page, box, value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const id = await box.getAttribute('id');
  expect(id).toBeTruthy();
  await box.click();
  await page.locator(`[id="${id}-list"] [data-value="${escaped}"]`).click();
  await expect(page.locator(`[id="${id}-list"]`)).toHaveCount(0);
}

async function expectValueAt(box, value) {
  await expect(box).toHaveAttribute('data-value', String(value));
}

module.exports = { pickOption, expectValue, pickOptionAt, expectValueAt };
