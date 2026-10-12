import { test, expect } from '@playwright/test'
import { DISMISS_LABELS, dismissOnboarding, openSection, openSettings, tokenUrl } from './harness.mjs'

test.beforeEach(async ({ page }) => {
  const url = tokenUrl()
  if (url !== undefined) {
    await page.goto(url, { waitUntil: 'commit', timeout: 30_000 })
  }
})

test('设置编排 is present near the top of the Settings nav', async ({ page }) => {
  await page.goto('/')
  expect(await openSettings(page), 'settings should open after dismissing first-run dialogs').toBe(true)

  const nav = page.locator('[role="dialog"] nav')
  await expect(nav.getByRole('button', { name: '设置编排' })).toBeVisible()
  // order 1 → second slot, right after 通用设置
  await expect(nav.getByRole('button').nth(1)).toHaveText('设置编排')
})

test('manager panel renders a row per section with a switch, and toggling hides/restores', async ({ page }) => {
  await page.goto('/')
  expect(await openSettings(page), 'settings should open after dismissing first-run dialogs').toBe(true)

  const nav = page.locator('[role="dialog"] nav')
  expect(await openSection(page, '设置编排'), 'settings nav section reachable').toBe(true)

  const dialog = page.locator('[role="dialog"]')
  const rows = dialog.locator('[data-slot="settings.section"] li')
  const count = await rows.count()
  // Base DSH profiles render 通用设置/设置编排/模型/插件… — assert a healthy
  // minimum rather than a specific plugin count so the test is profile-agnostic.
  expect(count).toBeGreaterThanOrEqual(4)
  await expect(rows.first().getByRole('switch')).toBeVisible()
  await expect(dialog.locator('.dsm-reset-all')).toBeVisible()

  // Toggle "模型" (id `models`, shown in the meta line) off → it leaves the nav.
  const retryRow = rows.filter({ hasText: 'models' })
  await retryRow.getByRole('switch').click()
  await expect(nav.getByRole('button', { name: '模型', exact: true })).toHaveCount(0)

  // Toggle it back on → returns.
  await retryRow.getByRole('switch').click()
  await expect(nav.getByRole('button', { name: '模型', exact: true })).toBeVisible()
})

test('drag & drop moves a section and clears the drop highlight', async ({ page }) => {
  await page.goto('/')
  expect(await openSettings(page), 'settings should open after dismissing first-run dialogs').toBe(true)

  const nav = page.locator('[role="dialog"] nav')
  expect(await openSection(page, '设置编排'), 'settings nav section reachable').toBe(true)
  const dialog = page.locator('[role="dialog"]')
  const rows = dialog.locator('[data-slot="settings.section"] li')

  const orderOf = async (label) => {
    const texts = await nav.getByRole('button').allTextContents()
    return texts.indexOf(label)
  }
  const before = await orderOf('设置编排')

  // Drag "设置编排" (near the top) down onto a row a few places below.
  //
  // Two constraints pin the target. It must be far enough that either
  // placement moves the row — a drop at the exact middle of the ADJACENT row
  // computes 'before', a no-op — and close enough that the synthetic pointer
  // travel stays short. A full-panel drag (top row to the bottom row, ~560px
  // over a scrollable panel) loses the HTML5 drag partway: the browser stops
  // emitting `dragover` and the indicator never appears. That is a limitation
  // of driving native drag-and-drop with synthetic mouse events, not of the
  // component — short and mid-range drags, INCLUDING ones ending on the very
  // same bottom row, work.
  const count = await rows.count()
  const src = rows.filter({ hasText: '设置编排' }).first()
  const dst = rows.nth(Math.min(count - 1, 3))
  await src.scrollIntoViewIfNeeded()
  await dst.scrollIntoViewIfNeeded()
  const a = await src.boundingBox()
  const b = await dst.boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 })

  // Mid-drag: the insertion indicator line is visible.
  await expect(dialog.locator('.dsm-drop-indicator')).toHaveCount(1)

  await page.mouse.up()

  // The row moved (down one slot)…
  await expect.poll(async () => (await orderOf('设置编排')) > before).toBe(true)

  // …and the insertion indicator is gone after the drop.
  await expect(dialog.locator('.dsm-drop-indicator')).toHaveCount(0)

  // Clean up: restore the original order so later runs start from a clean slate.
  await dialog.locator('.dsm-reset-all').click()
  await expect.poll(async () => (await orderOf('设置编排')) === before).toBe(true)
})

test('reset-all restores the original nav order after a reorder', async ({ page }) => {
  await page.goto('/')
  expect(await openSettings(page), 'settings should open after dismissing first-run dialogs').toBe(true)

  const nav = page.locator('[role="dialog"] nav')
  expect(await openSection(page, '设置编排'), 'settings nav section reachable').toBe(true)
  const dialog = page.locator('[role="dialog"]')
  const rows = dialog.locator('[data-slot="settings.section"] li')

  const orderOf = async (label) => {
    const texts = await nav.getByRole('button').allTextContents()
    return texts.indexOf(label)
  }
  const modelsBefore = await orderOf('模型')

  // Click ↓ once → 模型 moves down one slot (live). Anchor on the unique id
  // (`models` in the meta line) so it never collides with 模型能力与档位.
  const modelsRow = rows.filter({ hasText: 'models' })
  await modelsRow.locator('.dsm-icon-btn').nth(1).click()
  await expect.poll(async () => (await orderOf('模型')) > modelsBefore).toBe(true)

  // Reset all → original position restored.
  await dialog.locator('.dsm-reset-all').click()
  await expect.poll(async () => (await orderOf('模型')) === modelsBefore).toBe(true)
})

test('rename changes the section name in the nav and persists across reload', async ({ page }) => {
  await page.goto('/')
  expect(await openSettings(page), 'settings should open after dismissing first-run dialogs').toBe(true)

  const nav = page.locator('[role="dialog"] nav')
  expect(await openSection(page, '设置编排'), 'settings nav section reachable').toBe(true)
  const dialog = page.locator('[role="dialog"]')
  const rows = dialog.locator('[data-slot="settings.section"] li')

  // Open the rename editor on the "模型" row (id `models`, shown in the meta
  // line) via the pencil icon. The plain hasText filter would also match
  // 模型能力与档位, so anchor on the unique id.
  const modelRow = dialog.locator('[data-slot="settings.section"] li').filter({ hasText: 'models' })
  await modelRow.getByRole('button', { name: '改名' }).click()
  const input = dialog.locator('.dsm-rename-input')
  await expect(input).toBeVisible()

  const renamed = `模型·${Date.now()}`
  await input.fill(renamed)
  await input.press('Enter')

  // The nav now shows the custom name (persisted live).
  await expect(nav.getByRole('button', { name: renamed })).toBeVisible()

  // Reload → still applied (server-side settings persistence).
  await page.reload()
  expect(await openSettings(page), 'settings should re-open after reload').toBe(true)
  await expect(nav.getByRole('button', { name: renamed })).toBeVisible()

  // Restore: reset the row reverts the name.
  expect(await openSection(page, '设置编排'), 'settings nav section reachable').toBe(true)
  const renamedRow = dialog.locator('[data-slot="settings.section"] li').filter({ hasText: renamed })
  await renamedRow.getByRole('button', { name: '重置' }).click()
  await expect(nav.getByRole('button', { name: renamed })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: '模型', exact: true })).toBeVisible()
})

