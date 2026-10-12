import { test, expect } from '@playwright/test'
import { DISMISS_LABELS, dismissOnboarding, openSection, openSettings, tokenUrl } from './harness.mjs'

test.beforeEach(async ({ page }) => {
  const url = tokenUrl()
  if (url !== undefined) {
    await page.goto(url, { waitUntil: 'commit', timeout: 30_000 })
  }
})

test('insertion indicator persists across the row gap (no blink)', async ({ page }) => {
  await page.goto('/')
  expect(await openSettings(page), 'settings should open after dismissing first-run dialogs').toBe(true)
  const nav = page.locator('[role="dialog"] nav')
  expect(await openSection(page, '设置编排'), 'settings nav section reachable').toBe(true)
  const dialog = page.locator('[role="dialog"]')
  const rows = dialog.locator('[data-slot="settings.section"] li')
  await rows.first().waitFor({ state: 'visible' })

  const indicator = dialog.locator('.dsm-drop-indicator')
  const visible = async () => (await indicator.count()) === 1

  // Drag row 0 ("通用设置").
  const src = await rows.nth(0).boundingBox()
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
  await page.mouse.down()

  // Hover row 2's bottom half → indicator visible.
  const r2 = await rows.nth(2).boundingBox()
  await page.mouse.move(r2.x + r2.width / 2, r2.y + r2.height * 0.8, { steps: 8 })
  expect(await visible()).toBe(true)

  // Cross into the gap between row 2 and row 3 → the indicator must STAY
  // visible (a per-row indicator would blink off here).
  const r3 = await rows.nth(3).boundingBox()
  const gapY = (r2.y + r2.height + r3.y) / 2
  await page.mouse.move(r2.x + r2.width / 2, gapY, { steps: 4 })
  expect(await visible()).toBe(true)

  // Enter row 3's top → still visible.
  await page.mouse.move(r3.x + r3.width / 2, r3.y + r3.height * 0.2, { steps: 4 })
  expect(await visible()).toBe(true)

  // Drop → indicator gone.
  await page.mouse.up()
  await expect(indicator).toHaveCount(0)

  // Clean up the reorder.
  await dialog.locator('.dsm-reset-all').click()
})
