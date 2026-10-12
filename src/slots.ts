/**
 * dsh-slots-manager — managed-slot table.
 *
 * The manager's *engine* is slot-agnostic: it intercepts three methods on
 * `SlotRegistry.prototype` and applies a per-slot policy document. This file is
 * the only place that names concrete slots — **adding a slot is adding a row**.
 *
 * Every slot listed here must satisfy the contract the engine assumes:
 *
 *   - `kind: 'list'`  — a list slot has one registration per id, so the three
 *     operations (hide / order / rename) all have meaning. `single`, `keyed`
 *     and `chain` slots do not: hiding a `single` removes the only
 *     implementation, and `keyed`/`chain` are dispatch mechanisms, not lists.
 *
 *   - a consumer that reads `order` from the slot's entries — the engine
 *     rewrites `options.order` so reordering takes effect. Verified per slot:
 *       · `settings.section`      → the settings shell sorts its nav by order
 *       · `sidebar.panellist`     → the sidebar sorts the panel rows by order
 *       · `sidebar.footer.action` → the renderer sorts list entries by order
 *
 *   - `rename: true` additionally requires the consumer to *project* `label`.
 *     A registrant that never declares `label` (and a consumer that never reads
 *     it) makes renaming a no-op, so the capability is off for that slot.
 *
 * Every slot here is also `scope: 'root'` — registered once for the whole app,
 * so one global policy applies. A session-scoped slot would need per-session
 * policy, which the document shape does not express; the compat guard fails if
 * upstream ever moves a managed slot to another scope.
 *
 * Anything outside this table is returned byte-for-byte untouched by every
 * patch — that is the engine's core safety property.
 */

/** UI grouping. Each group renders as one heading in the manager panel. */
export type SlotGroup = 'settings' | 'sidebar'

/** Which operations the UI offers for a slot. */
export interface SlotCapability {
  hide: boolean
  order: boolean
  rename: boolean
}

export interface SlotDescriptor {
  /** Slot key, exactly as declared in DSH's `SlotMap`. */
  key: string
  /** UI group. */
  group: SlotGroup
  /** See {@link SlotCapability}. */
  capability: SlotCapability
}

/**
 * The slots this plugin manages.
 *
 * `settings.section`     — the nav entries of the global Settings dialog.
 * `sidebar.panellist`    — the global panel icon buttons in the left sidebar.
 * `sidebar.footer.action`— the actions beside Settings at the sidebar foot.
 *
 * `sidebar.footer.action` is `rename: false`: its registrants do not declare
 * `label` at all (the button paints its own copy through locale), and the
 * renderer never reads `options.label`. Renaming there could not have a visible
 * effect, so the capability is off rather than offered-and-ignored.
 */
export const MANAGED_SLOTS: readonly SlotDescriptor[] = [
  {
    key: 'settings.section',
    group: 'settings',
    capability: { hide: true, order: true, rename: true },
  },
  {
    key: 'sidebar.panellist',
    group: 'sidebar',
    capability: { hide: true, order: true, rename: true },
  },
  {
    key: 'sidebar.footer.action',
    group: 'sidebar',
    capability: { hide: true, order: true, rename: false },
  },
]

/** Fast membership test used by every patch guard. */
export const MANAGED_KEYS: ReadonlySet<string> = new Set(MANAGED_SLOTS.map((slot) => slot.key))

/** The slot that carries this plugin's own section (never hideable). */
export const SECTION_SLOT = 'settings.section'

/** Group render order and their locale keys (`group.<id>`). */
export const SLOT_GROUPS: readonly { id: SlotGroup; navKey: string }[] = [
  { id: 'settings', navKey: 'group.settings' },
  { id: 'sidebar', navKey: 'group.sidebar' },
]

/** Locale key for a slot's display name in the manager panel. */
export function navKeyFor(key: string): string {
  return `slotNav.${key}`
}

/** Locale key for a slot's explanatory line. */
export function hintKeyFor(key: string): string {
  return `slotHint.${key}`
}
