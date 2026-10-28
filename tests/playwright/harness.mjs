/**
 * Shared Playwright harness for the live-DSH specs.
 *
 * Both specs drive the same first-run flow, which is fiddly for one specific
 * reason: DSH mounts its "add an API key" onboarding dialog ASYNCHRONOUSLY once
 * the credentials lookup settles. On a freshly created profile that lands
 * *after* the Settings dialog is already open, and its mask then swallows
 * pointer events aimed at the Settings nav. A single click is therefore not
 * enough — every navigation step has to tolerate the dialog appearing under it.
 */
import { expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

/** Buttons that dismiss a first-run / onboarding dialog. */
/**
 * Buttons that dismiss a first-run dialog.
 *
 * `关闭` is the aria-label of the close cross on the "开始使用" dialog (login or add
 * an API key). Without it that dialog stays mounted on every load and the account
 * menu underneath it never opens — every spec then fails inside openSettings
 * instead of at the thing it was testing.
 */
export const DISMISS_LABELS = ['继续', '稍后配置', '知道了', '关闭此提示', '关闭']

/**
 * Resolve the dsh connection URL that establishes the browser session. dsh boot
 * prints a token-bearing root URL (`http://host:port/?token=…`); visiting it
 * exchanges the token for an authority-bound cookie and redirects to the clean
 * root. Comes from `DSH_TOKEN_URL` when the caller knows it, otherwise it is
 * parsed from the boot log (`DSH_BOOT_LOG`). Returns undefined for deployments
 * without the root gate, in which case the spec navigates straight to "/".
 */
export function tokenUrl() {
  if (process.env.DSH_TOKEN_URL && process.env.DSH_TOKEN_URL.trim() !== '') {
    return process.env.DSH_TOKEN_URL.trim()
  }
  const logPath = process.env.DSH_BOOT_LOG || '/tmp/dsh-e2e.log'
  let log
  try {
    log = readFileSync(logPath, 'utf8')
  } catch {
    return undefined
  }
  const match = log.match(/https?:\/\/[^\s]+[?&]token=[A-Za-z0-9_-]+/)
  return match ? match[0] : undefined
}

/** Click whatever dismiss button the current dialog offers, if any. */
export async function dismissOnboarding(page) {
  for (const name of DISMISS_LABELS) {
    const dismiss = page.getByRole('button', { name, exact: true })
    if ((await dismiss.count()) === 0) continue

    // A label can name two buttons: "关闭" closes the onboarding dialog AND the
    // Settings dialog once it is open. Clicking the latter closed Settings again,
    // right after it had been opened, so the next step found no nav. Skip any
    // dismiss button that lives inside a dialog carrying a nav — that is Settings.
    const belongsToSettings = await dismiss
      .first()
      .evaluate((el) => {
        const dialog = el.closest('[role="dialog"]')
        return Boolean(dialog && dialog.querySelector('nav'))
      })
      .catch(() => false)
    if (belongsToSettings) continue

    await dismiss.click().catch(() => {})
    await expect(dismiss).not.toBeVisible({ timeout: 2000 }).catch(() => {})
  }
}

/**
 * Click the entry that opens Settings.
 *
 * It is not always a sidebar button named "设置": from 0.2.2-alpha.2 the entry is a
 * `menuitem` inside the account menu, and its accessible name carries the shortcut
 * (`设置⌥⌘,`), so `getByRole('button', { name: '设置', exact: true })` matches
 * nothing at all — which is why every spec failed at openSettings, not at whatever
 * it was testing.
 *
 * Try the old shape first (a plain button), then the account menu. Whichever is
 * absent simply times out into the next attempt.
 */
async function clickSettings(page) {
  const direct = page.getByRole('button', { name: '设置', exact: true }).first()
  if ((await direct.count()) > 0 && (await direct.isVisible().catch(() => false))) {
    await direct.click({ timeout: 2000 })
    return
  }

  // The shortcut suffix is part of the accessible name, so anchor instead of exact.
  const item = page.getByRole('menuitem', { name: /^设置|^Settings/ }).first()

  // The account menu is a toggle: clicking it while it is already open closes it.
  // A previous openSettings call can leave it open, so only click when the entry is
  // not already reachable.
  if (!(await item.isVisible().catch(() => false))) {
    const account = page.getByRole('button', { name: /账号菜单|Account menu/ }).first()
    if ((await account.count()) > 0) await account.click({ timeout: 2000 }).catch(() => {})
  }

  await item.click({ timeout: 3000 })
}

/** Open the Settings dialog, dismissing first-run dialogs until it sticks. */
export async function openSettings(page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    // Dismiss a modal by clicking its masked backdrop.
    const modal = page.locator('[role="presentation"]').first()
    if ((await modal.count()) > 0) {
      const mask = modal.locator('[aria-hidden="true"]').first()
      if ((await mask.count()) > 0) {
        await mask.click({ position: { x: 5, y: 5 } }).catch(() => {})
      }
      await page.waitForTimeout(250)
    }

    await dismissOnboarding(page)

    try {
      await clickSettings(page)
      // The API-key onboarding can mount after Settings is already open.
      await dismissOnboarding(page)
      return true
    } catch {
      // A modal probably mounted just in time; loop and dismiss it again.
    }
  }
  return false
}

/**
 * Click a section in the Settings nav. Retries with a dismissal pass in
 * between, so an onboarding dialog mounting over the already-open Settings
 * dialog costs one retry rather than the whole test timeout.
 */
export async function openSection(page, name) {
  const nav = page.locator('[role="dialog"] nav')
  for (let attempt = 0; attempt < 5; attempt++) {
    await dismissOnboarding(page)
    try {
      await nav.getByRole('button', { name }).click({ timeout: 3000 })
      return true
    } catch {
      /* blocked by a dialog that just mounted — dismiss and retry */
    }
  }
  return false
}
