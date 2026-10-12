/**
 * Compatibility guard against the installed DSH.
 *
 * The engine patches three methods on `SlotRegistry.prototype` and assumes
 * every managed slot is a `list` slot of a particular scope. Both assumptions
 * live in upstream code this plugin does not import, so a DSH upgrade could
 * invalidate them SILENTLY — the manager would simply stop showing a slot, or
 * `installPatches` would bail out and the whole plugin would do nothing.
 *
 * This file turns that silence into a CI failure. It SKIPS (never fails) when
 * no DSH installation is found, which is the normal case on a CI runner.
 *
 *   DSH_INSTALL_DIR=/path/to/node_modules/@deepseek-ai/dsh  node --test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { loadEnv, SEAM_KEY } from '../helpers/load-env.mjs'

/** Locate the installed DSH package, or undefined when there is none. */
function findDshDir() {
  const explicit = process.env.DSH_INSTALL_DIR
  if (explicit && existsSync(join(explicit, 'package.json'))) return explicit
  try {
    const root = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const dir = join(root, '@deepseek-ai', 'dsh')
    if (existsSync(join(dir, 'package.json'))) return dir
  } catch (error) {
    /* npm unavailable — fall through to skip */
  }
  return undefined
}

const DSH_DIR = findDshDir()

/** The DSH version under test, for the assertion messages. */
function dshVersion(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version
  } catch (error) {
    return 'unknown'
  }
}

/**
 * The two places a DSH dependency package can live, because both layouts are
 * real and neither is the "wrong" one:
 *
 *   · nested  — `<dsh>/node_modules/@deepseek-ai/<name>`. What the global pnpm
 *     install on a dev machine looks like.
 *   · hoisted — `<dsh>/../<name>`, i.e. a SIBLING of `dsh`, inside the same
 *     `node_modules`. What `npm install --prefix DIR @deepseek-ai/dsh` produces
 *     (npm hoists the whole tree into DIR/node_modules), which is what CI uses.
 *
 * Probing only the nested form would make this guard fail on CI for a reason
 * that has nothing to do with the contract it checks.
 */
const DSH_ROOTS = DSH_DIR
  ? [join(DSH_DIR, 'node_modules', '@deepseek-ai'), join(DSH_DIR, '..')]
  : []

/** Read one DSH client bundle, or undefined when this build does not ship it. */
function readDshBundle(name) {
  for (const root of DSH_ROOTS) {
    for (const relative of ['lib/client.js', 'lib/index.js']) {
      const file = join(root, name, relative)
      if (existsSync(file)) return readFileSync(file, 'utf8')
    }
  }
  return undefined
}

/**
 * The slot catalog DSH publishes for tooling: key → { kind, scope }.
 * Parsed from the runner bundle, which embeds it as a JSON-ish table.
 */
function readSlotCatalog() {
  const source = readDshBundle('dsh-cordis-client-runner')
  if (source === undefined) return undefined
  const catalog = new Map()
  const entry = /\{\s*key: "([^"]+)",\s*kind: "([^"]+)",\s*scope: "([^"]+)"/g
  let match
  while ((match = entry.exec(source)) !== null) {
    catalog.set(match[1], { kind: match[2], scope: match[3] })
  }
  return catalog.size > 0 ? catalog : undefined
}

/** The managed slots, read from the shipped bundle under test. */
function managedDescriptors() {
  const env = loadEnv()
  const { slots, plugin, ctx, vmGlobal } = env
  slots.declare('settings.section')
  plugin.apply(ctx)
  const seam = vmGlobal[SEAM_KEY]
  if (!seam) throw new Error('test seam missing')
  return seam.descriptors
}

const skip = DSH_ROOTS.length === 0 ? 'no DSH installation found (set DSH_INSTALL_DIR)' : false

/** Version of the DSH under test, for assertion messages. */
const DSH_VERSION = DSH_DIR ? dshVersion(DSH_DIR) : 'unknown'

test('every managed slot is still a root-scoped list slot', { skip }, () => {
  const catalog = readSlotCatalog()
  assert.ok(catalog, 'DSH slot catalog not found — bump the parser, not the plugin')

  for (const descriptor of managedDescriptors()) {
    const found = catalog.get(descriptor.key)
    assert.ok(found, `slot "${descriptor.key}" is gone from DSH ${DSH_VERSION}`)
    assert.equal(found.kind, 'list', `slot "${descriptor.key}" is no longer a list slot on DSH ${DSH_VERSION}`)
    // Root, always: the policy document holds ONE arrangement per slot, which is
    // only sound for slots that register once for the whole app. A session-scoped
    // slot would need per-session policy the document shape cannot express, so
    // this is a hard precondition, not a recorded preference.
    assert.equal(found.scope, 'root', `slot "${descriptor.key}" is no longer root-scoped on DSH ${DSH_VERSION}`)
  }
})

test('SlotRegistry still exposes the three patched methods', { skip }, () => {
  const source = readDshBundle('dsh-client-ui-renderer')
  assert.ok(source, 'DSH renderer bundle not found')

  // `register` is assigned AFTER the class body
  // (`SlotRegistry.prototype.register = function ...`), while `entries` and
  // `entriesOfSlot` are class members. An earlier version of this plugin
  // assumed all three were class members and mis-read the runtime as "no
  // register method" — hence two distinct patterns here.
  assert.match(source, /SlotRegistry\.prototype\.register\s*=/, 'SlotRegistry.prototype.register is gone')

  // esbuild emits `var SlotRegistry = class extends Service {`, not
  // `class SlotRegistry` — match both forms.
  const classStart = source.search(/(?:var\s+)?SlotRegistry\s*=\s*class\b|class\s+SlotRegistry\b/)
  assert.ok(classStart >= 0, 'SlotRegistry class declaration not found')
  // The class body ends where the post-class prototype assignments begin.
  const postClass = source.indexOf('SlotRegistry.prototype.', classStart)
  const classBody = source.slice(classStart, postClass > classStart ? postClass : undefined)

  assert.match(classBody, /\bentries\s*\(/, 'SlotRegistry#entries is gone')
  assert.match(classBody, /\bentriesOfSlot\s*\(/, 'SlotRegistry#entriesOfSlot is gone')
})

test('settings.section is still the slot the manager hosts its own section in', { skip }, () => {
  const catalog = readSlotCatalog()
  assert.ok(catalog?.has('settings.section'), 'settings.section left the catalog')
})
