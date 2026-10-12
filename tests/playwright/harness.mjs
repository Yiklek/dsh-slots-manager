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
export const DISMISS_LABELS = ['继续', '稍后配置', '知道了', '关闭此提示']

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
    if ((await dismiss.count()) > 0) {
      await dismiss.click().catch(() => {})
      await expect(dismiss).not.toBeVisible({ timeout: 2000 }).catch(() => {})
    }
  }
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
      await page.getByRole('button', { name: '设置', exact: true }).first().click({ timeout: 3000 })
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
