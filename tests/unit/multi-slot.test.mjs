/**
 * Unit tests — multi-slot behaviour.
 *
 * The original suite drives `settings.section` through seam members that are
 * bound to it. These tests cover the parts that only exist once more than one
 * slot is managed: per-slot policy isolation, the `entriesOfSlot` in-place
 * rewrite (which is how ordering and renaming reach the sidebar), the identity
 * contract the renderer's `isLive` check depends on, and the guarantee that
 * unmanaged slots are not touched at all.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadEnv, SEAM_KEY } from '../helpers/load-env.mjs'

const PANEL = 'sidebar.panellist'
const FOOTER = 'sidebar.footer.action'
const UNMANAGED = 'conversation.input.left'

/**
 * Boot a scenario with all managed slots declared and populated, plus one
 * unmanaged slot as a control. Everything registers BEFORE apply() — which
 * mirrors production, where the base sections register before any profile
 * plugin, and is exactly the case that has no inventory row from `register`.
 */
function setup() {
  const env = loadEnv()
  const { slots, plugin, ctx, vmGlobal } = env

  slots.declare('settings.section')
  slots.declare(PANEL)
  slots.declare(FOOTER)
  slots.declare(UNMANAGED)

  slots.register({ name: 'settings.section', id: 'general', order: 0, label: () => '通用设置' }, () => 'General')
  // Same id as the panel below, on purpose: this collision is real in a stock
  // profile (dsh-client-ui-plugin-manager uses `plugins` for both).
  slots.register({ name: 'settings.section', id: 'plugins', order: 20, label: () => '插件' }, () => 'Plugins')
  const disposePanelPlugins = slots.register(
    { name: PANEL, id: 'plugins', order: 10, label: () => '插件面板' },
    () => 'Icon',
  )
  slots.register({ name: PANEL, id: 'schedule', order: 20, label: () => '任务' }, () => 'Icon2')
  // Footer actions declare NO label — the real shape (see dsh-context).
  slots.register({ name: FOOTER, id: 'context-overview', order: 10 }, () => 'Button')
  slots.register({ name: UNMANAGED, id: 'free-search', order: 5, label: () => '搜索' }, () => 'Control')

  plugin.apply(ctx)
  const seam = vmGlobal[SEAM_KEY]
  if (!seam) throw new Error('test seam missing')

  const idsOf = (key) => slots.entries(key).map((entry) => entry.options.id)
  const elected = (key) => slots.entriesOfSlot(key)
  const optionOf = (key, id) => elected(key).find((entry) => entry.options.id === id)?.options

  return { ...env, seam, idsOf, elected, optionOf, disposePanelPlugins }
}

/* ------------------------------------------------------------------ *
 * Slot isolation
 * ------------------------------------------------------------------ */

test('the same id in two slots keeps two independent policies', () => {
  const { seam, idsOf } = setup()

  seam.policyFor(PANEL).setHidden('plugins', true)

  // The panel button is gone…
  assert.ok(!idsOf(PANEL).includes('plugins'), 'panel id hidden')
  // …while the settings section that happens to share the id is untouched.
  assert.ok(idsOf('settings.section').includes('plugins'), 'section id untouched')
  assert.equal(seam.policyFor('settings.section').isHidden('plugins'), false)
  assert.ok(idsOf(PANEL).includes('schedule'))
})

test('resetAll on one slot leaves the others alone', () => {
  const { seam, idsOf } = setup()
  seam.policyFor(PANEL).setHidden('plugins', true)
  seam.policyFor('settings.section').setHidden('plugins', true)

  seam.policyFor(PANEL).resetAll()

  assert.ok(idsOf(PANEL).includes('plugins'), 'panel restored')
  assert.ok(!idsOf('settings.section').includes('plugins'), 'section still hidden')
})

/* ------------------------------------------------------------------ *
 * The sidebar read path: entriesOfSlot
 * ------------------------------------------------------------------ */

test('hiding a panel removes it from entriesOfSlot', () => {
  const { seam, elected } = setup()
  seam.policyFor(PANEL).setHidden('schedule', true)
  const ids = elected(PANEL).map((entry) => entry.options.id)
  assert.ok(!ids.includes('schedule'))
  assert.ok(ids.includes('plugins'))
})

test('reordering a panel rewrites options.order on the entriesOfSlot path', () => {
  const { seam, elected } = setup()
  // The sidebar reads `options.order` straight off these entries and sorts by it.
  seam.policyFor(PANEL).setOrders({ 'schedule': 1 })
  const rows = elected(PANEL).map((entry) => ({ id: entry.options.id, order: entry.options.order }))
  const schedule = rows.find((row) => row.id === 'schedule')
  assert.equal(schedule.order, 1)
  const sorted = [...rows].sort((a, b) => a.order - b.order).map((row) => row.id)
  assert.deepEqual(sorted, ['schedule', 'plugins'])
})

test('renaming a panel rewrites options.label on the entriesOfSlot path', () => {
  const { seam, optionOf } = setup()
  seam.policyFor(PANEL).setLabel('schedule', '任务面板')
  assert.equal(optionOf(PANEL, 'schedule').label(), '任务面板')
})

test('entriesOfSlot returns the SAME entry objects (renderer isLive contract)', () => {
  const { slots, seam } = setup()
  // Snapshot, not the live array: a policy change bumps the slot version by
  // registering and disposing a throwaway entry, and the mock's register mutates
  // the stored array in place before the disposer swaps in a filtered copy.
  const before = [...slots.raw(PANEL)]
  // An active policy must not change identity — the renderer probes liveness
  // with `rec.entries.includes(entry)`, so a clone would throw.
  seam.policyFor(PANEL).setOrders({ 'plugins': 99 })
  seam.policyFor(PANEL).setLabel('plugins', '改名')
  const after = slots.entriesOfSlot(PANEL)
  assert.equal(after.length, before.length)
  for (const entry of after) {
    assert.ok(before.includes(entry), 'entry identity preserved')
  }
})

/* ------------------------------------------------------------------ *
 * Change notification
 * ------------------------------------------------------------------ */

test('a policy change bumps EVERY managed slot version, not just one', () => {
  const { slots, seam } = setup()
  const keys = ['settings.section', PANEL, FOOTER]
  const before = keys.map((key) => slots.getVersion(key))

  seam.policyFor(PANEL).setHidden('schedule', true)

  const after = keys.map((key) => slots.getVersion(key))
  // Every slot must move. Each has its OWN subscribers: the Settings shell
  // re-reads settings.section, while the sidebar re-reads sidebar.panellist on
  // that slot's version change. Bumping a single slot left the others stale, so
  // a hidden panel button only disappeared after a page reload.
  for (let i = 0; i < keys.length; i += 1) {
    assert.ok(after[i] > before[i], `${keys[i]} version moved (${before[i]} → ${after[i]})`)
  }
})

test('the bump leaves no entry behind in any managed slot', () => {
  const { slots, seam } = setup()
  seam.policyFor(PANEL).setHidden('schedule', true)
  for (const key of ['settings.section', PANEL, FOOTER]) {
    const ids = Array.from(slots.entriesOfSlot(key).map((entry) => entry.options.id))
    assert.ok(!ids.includes('slots-manager-touch'), `${key} is free of the throwaway entry`)
  }
})

/* ------------------------------------------------------------------ *
 * Reset restores originals captured on first sight
 * ------------------------------------------------------------------ */

test('reset restores the original order of a pre-patch registration', () => {
  const { seam, optionOf } = setup()
  assert.equal(optionOf(PANEL, 'schedule').order, 20)

  seam.policyFor(PANEL).setOrders({ 'schedule': 1 })
  assert.equal(optionOf(PANEL, 'schedule').order, 1)

  seam.policyFor(PANEL).reset('schedule')
  // The entry was rewritten in place; without the captured original this would
  // stay stranded on 1.
  assert.equal(optionOf(PANEL, 'schedule').order, 20)
})

test('reset restores the original label of a pre-patch registration', () => {
  const { seam, optionOf } = setup()
  seam.policyFor(PANEL).setLabel('schedule', '改过的名字')
  assert.equal(optionOf(PANEL, 'schedule').label(), '改过的名字')
  seam.policyFor(PANEL).reset('schedule')
  assert.equal(optionOf(PANEL, 'schedule').label(), '任务')
})

test('a late re-registration refreshes the captured original', () => {
  const { slots, seam, optionOf, disposePanelPlugins } = setup()
  seam.policyFor(PANEL).setOrders({ 'plugins': 1 })
  optionOf(PANEL, 'plugins')

  // A plugin reloading disposes and re-registers with a different base order.
  disposePanelPlugins()
  slots.register({ name: PANEL, id: 'plugins', order: 77, label: () => '插件面板' }, () => 'Icon')

  seam.policyFor(PANEL).reset('plugins')
  assert.equal(optionOf(PANEL, 'plugins').order, 77)
})

/* ------------------------------------------------------------------ *
 * Untouched slots
 * ------------------------------------------------------------------ */

test('an unmanaged slot is returned byte-for-byte untouched', () => {
  const { slots } = setup()
  const raw = slots.raw(UNMANAGED)
  // Same array reference, not merely equal contents.
  assert.equal(slots.entries(UNMANAGED), raw)
  assert.equal(slots.entriesOfSlot(UNMANAGED), raw)
  assert.equal(raw[0].options.order, 5)
  assert.equal(raw[0].options.label(), '搜索')
})

/* ------------------------------------------------------------------ *
 * Capabilities declared by the table
 * ------------------------------------------------------------------ */

test('sidebar.footer.action is managed for hide/order but not rename', () => {
  const { seam } = setup()
  const byKey = new Map(seam.descriptors.map((descriptor) => [descriptor.key, descriptor]))
  // Spread into this realm: the descriptors come from the VM sandbox, whose
  // prototypes differ, and deepStrictEqual checks [[Prototype]].
  const capability = (key) => ({ ...byKey.get(key).capability })
  // Footer actions declare no `label` at all, which is why rename is off.
  assert.deepEqual(capability(FOOTER), { hide: true, order: true, rename: false })
  assert.deepEqual(capability(PANEL), { hide: true, order: true, rename: true })
  assert.deepEqual(capability('settings.section'), { hide: true, order: true, rename: true })
})

test('a footer action is still hidden and reordered despite having no label', () => {
  const { seam, elected, optionOf } = setup()
  seam.policyFor(FOOTER).setOrders({ 'context-overview': 42 })
  assert.equal(optionOf(FOOTER, 'context-overview').order, 42)

  seam.policyFor(FOOTER).setHidden('context-overview', true)
  // Array.from re-homes the sandbox array into this realm for comparison.
  assert.deepEqual(Array.from(elected(FOOTER).map((entry) => entry.options.id)), [])
})
