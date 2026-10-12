/**
 * dsh-slots-manager — browser half, TypeScript source.
 *
 * Arranges how other plugins' contributions appear in a set of list slots
 * (show/hide, ordering, renaming) WITHOUT modifying upstream. The slots are
 * named in `src/slots.ts`; the engine here is slot-agnostic.
 *
 * Works by intercepting the client slot registry (`ctx.slots`), the one
 * mechanism every plugin uses to contribute to a slot:
 *
 *   ctx.slots.inject(<key>, () => ctx.slots.register({...}, Comp))
 *
 * Three interception points (all on `SlotRegistry.prototype`, which every
 * `ctx.slots.*` call resolves through dynamically — the cordis service proxy
 * re-reads property descriptors at access time, no caching):
 *
 *   1. register  — every managed-slot registration PASSES THROUGH the manager
 *                  (inventory + the ORIGINAL values recorded, so reset() can
 *                  always restore them). The options object is never mutated
 *                  here.
 *   2. entries   — readers that build a list from `slots.entries(key)` (the
 *                  Settings shell's nav) get hidden entries filtered out and
 *                  order/label rewritten. Returns CLONES, which is fine on this
 *                  path. Covers every entry regardless of when it registered,
 *                  including base sections that register before any profile
 *                  plugin.
 *   3. entriesOfSlot — readers that render the elected entry per id (the
 *                  renderer's `renderSlot`, and the sidebar's own panel list).
 *                  Hidden entries are filtered AND the surviving entry's
 *                  `options` is REPLACED IN PLACE — the entry object itself
 *                  keeps its identity, because the renderer runs an `isLive`
 *                  check that compares entries by identity
 *                  (`rec.entries.includes(entry)`), so a clone would throw
 *                  StaleAuthorizationError. Rewriting `options` is what makes
 *                  ordering and renaming reach the sidebar, which reads
 *                  `options.order` / `options.label` straight off this path.
 *
 * Non-managed slots are returned byte-for-byte untouched by every patch.
 *
 * After a policy change the readers must re-read: a dummy register+dispose
 * bumps the slot version and fires the listeners (no visible flash — the
 * flush runs on a microtask after both mutations).
 *
 * Policy persistence: the server-side settings namespace registered by the
 * host half, read/written over the `remote.settings` wire face.
 *
 * Build: esbuild bundles this file into `lib/client.js` wrapped in the DSH
 * module format (`window.__ModuleLoader__.load`). `react` stays external (a
 * shell seed); there are no other runtime imports.
 */
import type { Context } from '@deepseek-ai/cordis'
import React from 'react'
import {
  MANAGED_KEYS,
  MANAGED_SLOTS,
  SECTION_SLOT,
  SLOT_GROUPS,
  hintKeyFor,
  navKeyFor,
  type SlotDescriptor,
} from './slots'

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

/** This plugin's own section id in `settings.section` (never hidden, so its
 *  own UI always stays reachable). */
const OWN_ID = 'slots-manager'
/** The server-side settings namespace (registered by the host half) that
 *  persists the manager policy document. */
const SECTION_NS = 'slots-manager'
/** Locale dictionary namespace. */
const LOCALE_NS = 'slotsManager'
/**
 * Default nav order for this plugin's own section. Kept near the TOP: the
 * settings nav does not scroll by default and gets clipped once many sections
 * register - a bottom default position would be unreachable.
 */
const OWN_ORDER = 1
/** Dummy entry id used to bump the slot version after policy changes. */
const TOUCH_ID = 'slots-manager-touch'

/**
 * "A bundle's own configuration, keyed by the bundle's package name and rendered
 * on the bundle's page between its description and its rows."
 *
 * This is THE seat the sidebar Plugins page opens for a plugin: click the
 * plugin's row in 插件 and whatever it contributes here renders on that plugin's
 * own page under a 设置 heading. It is where `dsh-mnemon` and `dsh-context` put
 * their settings — and the page that lists plugins is the sidebar's, not the
 * Settings dialog's.
 *
 * The slot is KEYED, so a registrant identifies itself with `key` (not `id`) —
 * here this bundle's own package name, which is what routes the contribution to
 * this plugin's page.
 *
 * NOT a managed slot: it is a door INTO the manager, not something the manager
 * arranges, so the patches ignore it.
 */
const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'
/** Dispatch key = this bundle's package name. */
const BUNDLE_KEY = 'dsh-slots-manager'

/** Policy for ONE slot: id → override. */
interface SlotPolicy {
  hidden: Record<string, boolean>
  order: Record<string, number>
  labels: Record<string, string>
}

/**
 * The persisted policy document. Keyed by slot so two slots that happen to use
 * the same id cannot collide — and they do: `dsh-client-ui-plugin-manager`
 * registers the sidebar panel id `plugins`, which is also a settings section id.
 *
 * `version` exists for future shape evolution; there is no migration, because
 * this plugin has never shipped another shape.
 */
interface PolicyDoc {
  version: number
  slots: Record<string, SlotPolicy>
}

/** Current document version. */
const POLICY_VERSION = 1

/** A settings section's registration options as the shell sees them. */
interface SectionOptions {
  id: string
  name?: string
  order?: number
  label?: string | (() => string)
  priority?: number
  registrant?: string
  locale?: string
  [key: string]: unknown
}

/** One stored slot entry (the renderer requires the ORIGINAL object). */
interface StoredEntry {
  component: unknown
  options: SectionOptions
}

/** The subset of the slots service this plugin touches. */
interface SlotsService {
  inject(key: string, cb: () => () => void): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
  entries(key: string): readonly StoredEntry[]
  entriesOfSlot(key: string): readonly StoredEntry[]
  subscribe(key: string, fn: () => void): () => void
  getVersion(key: string): number
}

interface LocaleService {
  register(ns: string, dict: Record<string, unknown>): void
  bind(ns: string): (key: string, params?: unknown) => string
}

/** The settings Remote namespace (`ctx.remote.settings`, the DSH standard
 *  wire seam). Unary RPC methods resolve to a RemoteResult
 *  `{ ok: true, value } | { ok: false, error }`; the payload rides `.value`. */
interface SettingsWire {
  describe(): Promise<
    | { ok: true; value: { namespaces: { ns: string; value: unknown }[] } }
    | { ok: false; error: unknown }
  >
  replace(ns: string, section: object, expectedRevision?: number): Promise<unknown>
}

/** The client `remote` service (`@deepseek-ai/dsh-api-remotes`). */
interface RemoteService {
  settings: SettingsWire
}

/**
 * One slot's policy API. Every method is scoped to a single slot, so the
 * signature is unchanged from the single-slot build — the slot lives in the
 * object, not in every call. Obtained from {@link PolicyStore.forSlot}.
 */
interface Policy {
  /** The slot key this view is bound to. */
  readonly slot: string
  isHidden(id: string): boolean
  orderFor(id: string): number | undefined
  labelFor(id: string): string | undefined
  effectiveOrder(id: string, registeredOrder?: number): number
  setHidden(id: string, hidden: boolean): void
  setOrders(orders: Record<string, number>): void
  setLabel(id: string, label: string): void
  reset(id: string): void
  /** Clear every override for THIS slot (other slots are untouched). */
  resetAll(): void
}

/**
 * The whole policy document, shared by every slot view. Owns persistence, the
 * change emitter, and the server-load path.
 */
interface PolicyStore {
  /** The cached policy view for one managed slot. */
  forSlot(slot: string): Policy
  /** Replace in-memory state from a server-resolved document (no write back). */
  load(raw: unknown): void
  subscribe(fn: () => void): () => void
  setOnChanged(fn: () => void): void
  /** Every slot's policy, copied — the shape that gets persisted. */
  snapshot(): PolicyDoc
}

/** One row shown in the manager panel. */
interface SectionRow {
  id: string
  label: string
  originalLabel: string
  registrant?: string
  order: number
  hidden: boolean
  seq: number
}

/**
 * One recorded registration. Holds the ORIGINAL values so the read paths can
 * always compute an effective value (`policy ?? original`) — that is what makes
 * reset() restoring the plugin's own values a no-op instead of extra bookkeeping.
 */
interface InvRow {
  id: string
  order: number
  label?: unknown
  priority: number
  registrant?: string
}

/** The slot-registry patch handle. */
interface Patch {
  installed: boolean
  origEntries: (key: string) => readonly StoredEntry[]
  /** slot key → (entry id → original registration facts). */
  inventory: Map<string, Map<string, InvRow>>
  bump: () => void
}

type Place = 'before' | 'after'

/* ------------------------------------------------------------------ *
 * Locale
 * ------------------------------------------------------------------ */

const zh = {
  nav: '设置编排',
  hint: '管理各插件在界面上提供的分区与按钮：隐藏、排序、改名，改动即时生效。',
  hide: '隐藏',
  show: '显示',
  moveUp: '上移',
  moveDown: '下移',
  reset: '重置',
  resetAll: '全部重置',
  resetSlot: '重置本槽位',
  hiddenTag: '已隐藏',
  empty: '暂无注册项',
  selfNote: '本分区由 dsh-slots-manager 提供，不可隐藏。',
  dragHint: '拖拽调整顺序',
  rename: '改名',
  renamePlaceholder: '输入新名称…',
  /** Group headings. */
  'group.settings': '设置页',
  'group.sidebar': '左侧边栏',
  /** Slot display names (see slots.ts `navKeyFor`). */
  'slotNav.settings.section': '设置分区',
  'slotNav.sidebar.panellist': '面板按钮',
  'slotNav.sidebar.footer.action': '栏底动作',
  /** One-line explanation per slot (see slots.ts `hintKeyFor`). */
  'slotHint.settings.section': '设置对话框左侧导航里的分区',
  'slotHint.sidebar.panellist': '左侧栏的图标按钮',
  'slotHint.sidebar.footer.action':
    'Settings 旁边的底栏动作；部分动作在提供它的插件里也有自己的显示开关',
}
const en = {
  nav: 'Settings Manager',
  hint: 'Manage the sections and buttons plugins contribute to the UI: hide, reorder, rename. Changes apply instantly.',
  hide: 'Hide',
  show: 'Show',
  moveUp: 'Move up',
  moveDown: 'Move down',
  reset: 'Reset',
  resetAll: 'Reset all',
  resetSlot: 'Reset this slot',
  hiddenTag: 'Hidden',
  empty: 'Nothing registered yet',
  selfNote: 'Provided by dsh-slots-manager; cannot be hidden.',
  dragHint: 'Drag to reorder',
  rename: 'Rename',
  renamePlaceholder: 'Enter new name…',
  'group.settings': 'Settings',
  'group.sidebar': 'Left sidebar',
  'slotNav.settings.section': 'Settings sections',
  'slotNav.sidebar.panellist': 'Panel buttons',
  'slotNav.sidebar.footer.action': 'Footer actions',
  'slotHint.settings.section': 'The entries in the Settings dialog nav',
  'slotHint.sidebar.panellist': 'The icon buttons in the left sidebar',
  'slotHint.sidebar.footer.action':
    'Actions beside Settings at the sidebar foot; some also have a show/hide switch in their own plugin',
}

/* ------------------------------------------------------------------ *
 * Nav scroll fix + panel CSS
 *
 * The settings shell renders the nav as a fixed non-scrolling column and the
 * dialog panel clips overflow - once enough sections register, the bottom rows
 * become unreachable. Selector precedent: dsh-better-sidebar identifies the
 * settings nav with the same `[role="dialog"] nav` query.
 * ------------------------------------------------------------------ */

const NAV_SCROLL_CSS = [
  '[role="dialog"] nav { overflow-y: auto; padding-bottom: 12px; scrollbar-width: thin; }',
].join('\n')

const PANEL_CSS = [
  '.dsm-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }',
  '.dsm-icon-btn:disabled { opacity: .35; cursor: default; }',
  '.dsm-icon-btn:disabled:hover { background: transparent; }',
  '.dsm-reset-all:hover { background: var(--dsw-alias-interactive-bg-hover); }',
  '.dsm-switch:disabled { opacity: .5; cursor: default; }',
  // Drag feedback via classes (not inline styles — see styles.row comment).
  '.dsm-row-dragging { opacity: .4; }',
  // Single insertion indicator element, positioned in the row gap at the
  // exact spot where the dragged section will land. Blue (business-primary)
  // reads as a placement cue rather than success.
  '.dsm-drop-indicator {',
  '  position: absolute; left: 2px; right: 2px; height: 2px;',
  '  border-radius: 1px; background: var(--dsw-alias-state-business-primary);',
  '  z-index: 2; pointer-events: none;',
  '}',
  // Narrow screens: the settings nav stays a fixed 188px, which on a small
  // dialog leaves the panel too cramped for the row's action cluster. Narrow
  // the nav and compact the row actions (hide the decorative grip, shrink
  // icons) so everything fits. !important is needed: the elements carry React
  // inline styles / upstream nav rules, which would otherwise beat the classes.
  '@media (max-width: 520px) {',
  '  [role="dialog"] nav { width: 140px !important; }',
  '  .dsm-row { gap: 4px !important; padding: 6px 8px !important; }',
  '  .dsm-row-grip { display: none !important; }',
  '  .dsm-icon-btn { width: 22px !important; height: 22px !important; }',
  '}',
].join('\n')

function insertStyles(css: string): () => void {
  if (typeof document === 'undefined') return () => {}
  const style = document.createElement('style')
  style.setAttribute('data-plugin', 'dsh-slots-manager')
  style.textContent = css
  document.head.append(style)
  return () => style.remove()
}

/* ------------------------------------------------------------------ *
 * Tiny emitter
 * ------------------------------------------------------------------ */

function createEmitter() {
  const listeners = new Set<() => void>()
  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    emit(): void {
      for (const fn of [...listeners]) {
        try {
          fn()
        } catch (error) {
          /* one bad listener must not break the others */
        }
      }
    },
  }
}

/* ------------------------------------------------------------------ *
 * Policy store (server-backed through `remote.settings`)
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Coerce an untrusted server value into a slot policy (never throws). */
function normalizeSlotPolicy(raw: unknown): SlotPolicy {
  const out: SlotPolicy = { hidden: {}, order: {}, labels: {} }
  if (!isRecord(raw)) return out
  if (isRecord(raw.hidden)) {
    for (const [id, value] of Object.entries(raw.hidden)) {
      if (value === true) out.hidden[id] = true
    }
  }
  if (isRecord(raw.order)) {
    for (const [id, value] of Object.entries(raw.order)) {
      if (typeof value === 'number' && Number.isFinite(value)) out.order[id] = value
    }
  }
  if (isRecord(raw.labels)) {
    for (const [id, value] of Object.entries(raw.labels)) {
      if (typeof value === 'string' && value.length > 0) out.labels[id] = value
    }
  }
  return out
}

/**
 * Coerce an untrusted server document into the current shape (never throws).
 * Unknown slots are dropped — only managed slots are ever written.
 */
function normalizeDoc(raw: unknown): Record<string, SlotPolicy> {
  const out: Record<string, SlotPolicy> = {}
  if (!isRecord(raw) || !isRecord(raw.slots)) return out
  for (const [slot, value] of Object.entries(raw.slots)) {
    if (!MANAGED_KEYS.has(slot)) continue
    out[slot] = normalizeSlotPolicy(value)
  }
  return out
}

/**
 * The policy document, plus one bound {@link Policy} view per managed slot.
 *
 * The store owns everything document-wide (persistence, the change emitter,
 * the server-load path); each view owns exactly one slot. Splitting it this way
 * keeps a policy call slot-independent — `forSlot(slot).setHidden(id, true)` —
 * instead of threading a slot argument through every method.
 */
function createPolicyStore(persist: (doc: PolicyDoc) => void): PolicyStore {
  const state: PolicyDoc = { version: POLICY_VERSION, slots: {} }
  // Set on the first user mutation: the in-memory state becomes authoritative
  // and a late server load (describe resolving after the user acted) is ignored
  // so it can't clobber a fresher change.
  let mutated = false

  const emitter = createEmitter()
  let onChanged: (() => void) | null = null

  /** Writable slice — created on first mutation. */
  function writable(slot: string): SlotPolicy {
    let current = state.slots[slot]
    if (current === undefined) {
      current = { hidden: {}, order: {}, labels: {} }
      state.slots[slot] = current
    }
    return current
  }

  /** Read-only slice — never creates an entry for an untouched slot. */
  function readable(slot: string): SlotPolicy | undefined {
    return state.slots[slot]
  }

  /** Deep copy of everything, in the persisted shape. */
  function snapshot(): PolicyDoc {
    const slots: Record<string, SlotPolicy> = {}
    for (const [slot, value] of Object.entries(state.slots)) {
      slots[slot] = {
        hidden: { ...value.hidden },
        order: { ...value.order },
        labels: { ...value.labels },
      }
    }
    return { version: POLICY_VERSION, slots }
  }

  // Write the full in-memory document to the server (fire-and-forget; the in
  // memory state is the UI's source of truth and is already updated). A
  // failed write is swallowed — the next change re-sends the whole document.
  function save(): void {
    try {
      persist(snapshot())
    } catch (error) {
      /* a failed persist must not break a policy mutation */
    }
  }

  // Emit to subscribers + fire the slot bump, WITHOUT persisting (used by
  // load(): a server-resolved document is already persisted).
  function emit(): void {
    emitter.emit()
    if (onChanged) {
      try {
        onChanged()
      } catch (error) {
        /* the bump must never break a policy mutation */
      }
    }
  }

  function changed(): void {
    save()
    emit()
  }

  const views = new Map<string, Policy>()

  function createView(slot: string): Policy {
    /** This plugin's own section is never hideable, so its UI stays reachable. */
    const isOwn = (id: string): boolean => slot === SECTION_SLOT && id === OWN_ID

    const view: Policy = {
      slot,
      isHidden(id) {
        if (isOwn(id)) return false
        return readable(slot)?.hidden[id] === true
      },
      orderFor(id) {
        const value = readable(slot)?.order[id]
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined
      },
      labelFor(id) {
        const value = readable(slot)?.labels[id]
        return typeof value === 'string' && value.length > 0 ? value : undefined
      },
      effectiveOrder(id, registeredOrder) {
        const value = view.orderFor(id)
        return value !== undefined ? value : (typeof registeredOrder === 'number' ? registeredOrder : 0)
      },
      setHidden(id, hidden) {
        if (isOwn(id)) return
        mutated = true
        const target = writable(slot)
        if (hidden) target.hidden[id] = true
        else delete target.hidden[id]
        changed()
      },
      setOrders(orders) {
        let dirty = false
        for (const [id, order] of Object.entries(orders)) {
          const existing = readable(slot)?.order[id]
          if (typeof order === 'number' && Number.isFinite(order)) {
            if (existing !== order) {
              mutated = true
              writable(slot).order[id] = order
              dirty = true
            }
          } else if (existing !== undefined) {
            mutated = true
            delete writable(slot).order[id]
            dirty = true
          }
        }
        if (dirty) changed()
      },
      setLabel(id, label) {
        mutated = true
        const target = writable(slot)
        const value = typeof label === 'string' ? label.trim() : ''
        if (value.length > 0) target.labels[id] = value
        else delete target.labels[id]
        changed()
      },
      reset(id) {
        mutated = true
        const target = writable(slot)
        delete target.hidden[id]
        delete target.order[id]
        delete target.labels[id]
        changed()
      },
      resetAll() {
        mutated = true
        delete state.slots[slot]
        changed()
      },
    }
    return view
  }

  return {
    forSlot(slot) {
      let view = views.get(slot)
      if (view === undefined) {
        view = createView(slot)
        views.set(slot, view)
      }
      return view
    },
    load(raw) {
      if (mutated) return
      state.slots = normalizeDoc(raw)
      emit()
    },
    subscribe(fn) {
      return emitter.subscribe(fn)
    },
    setOnChanged(fn) {
      onChanged = fn
    },
    snapshot,
  }
}

/* ------------------------------------------------------------------ *
 * SlotRegistry interception
 * ------------------------------------------------------------------ */

interface PatchTarget {
  register: (options: Record<string, unknown>, component: unknown) => () => void
  entries: (key: string) => readonly StoredEntry[]
  entriesOfSlot: (key: string) => readonly StoredEntry[]
  [key: string]: unknown
}

/**
 * Install the three patches on the slot registry prototype, reached through
 * the service instance (`Object.getPrototypeOf`), so no official package is
 * imported at runtime.
 */
function installPatches(ctx: Context, store: PolicyStore): Patch {
  let slotsService: unknown
  try {
    slotsService = ctx.get('slots')
  } catch (error) {
    slotsService = undefined
  }
  if (slotsService === undefined) return { installed: false } as Patch

  let proto: PatchTarget | undefined
  try {
    proto = Object.getPrototypeOf(slotsService) as PatchTarget
  } catch (error) {
    proto = undefined
  }
  // NB: `register` is assigned on the prototype AFTER the class body
  // (`SlotRegistry.prototype.register = ...`), unlike `entries`/`entriesOfSlot`
  // which are class members. Existence must therefore be probed on the
  // instance's prototype, never grepped for in the source.
  if (!proto || typeof proto.register !== 'function') return { installed: false } as Patch

  // Re-apply (e.g. HMR reload): rewire the active store + ctx so the already
  // installed patches keep working with the fresh state, and hand back the
  // stored interface — returning a bare `{ installed: true }` here would make
  // apply() crash on `patch.bump`.
  if (proto.__slotsManagerPatched) {
    const holder = proto.__slotsManagerPolicy as { current: PolicyStore } | undefined
    if (holder) holder.current = store
    proto.__slotsManagerCtx = ctx
    return (proto.__slotsManagerInterface as Patch) || ({ installed: true } as Patch)
  }

  // Patches read the store through a holder so HMR re-apply can repoint it
  // without re-installing (and re-nesting) the wrappers.
  const policyHolder: { current: PolicyStore } = { current: store }

  const origRegister = proto.register
  const origEntries = proto.entries
  const origEntriesOfSlot = proto.entriesOfSlot

  // One inventory per managed slot, built up front so the read paths never have
  // to care whether a slot has registered anything yet.
  const inventory = new Map<string, Map<string, InvRow>>()
  for (const slot of MANAGED_SLOTS) inventory.set(slot.key, new Map())

  /** Extract the original facts of a registration into an inventory row. */
  function snapshotRow(options: Record<string, unknown>): InvRow {
    return {
      id: String(options.id),
      order: typeof options.order === 'number' ? options.order : 0,
      label: options.label,
      priority: typeof options.priority === 'number' ? options.priority : 0,
      registrant: typeof options.registrant === 'string' ? options.registrant : undefined,
    }
  }

  /**
   * The options a reader should see: the override when one exists, otherwise
   * the ORIGINAL recorded at registration time. Always writing the effective
   * value (rather than only writing when an override exists) is what makes
   * reset() restore the plugin's own values with no extra bookkeeping — once
   * the override is gone, the next read recomputes the original.
   */
  function effective(p: Policy, options: SectionOptions, original?: InvRow): SectionOptions {
    const order = p.orderFor(options.id) ?? original?.order
    const label = p.labelFor(options.id) ?? original?.label
    return {
      ...options,
      ...(order !== undefined ? { order } : {}),
      ...(label !== undefined
        ? { label: typeof label === 'function' ? (label as () => string) : () => String(label) }
        : {}),
    }
  }

  // 1) Registration path: record the ORIGINAL facts only. The stored options
  //    are never mutated here.
  proto.register = function register(rawOptions, component) {
    const slot = rawOptions ? rawOptions.name : undefined
    if (
      typeof slot === 'string' &&
      MANAGED_KEYS.has(slot) &&
      typeof rawOptions.id === 'string' &&
      rawOptions.id !== TOUCH_ID
    ) {
      inventory.get(slot)?.set(rawOptions.id, snapshotRow(rawOptions))
    }
    return origRegister.call(this, rawOptions, component)
  }

  /**
   * Original facts for one entry, captured on FIRST SIGHT when the registration
   * predates the patch. That case is real and load-bearing: the base sections
   * (General / Models / Plugins) register before any profile plugin is applied,
   * so their registrations never pass through `register` above. Without this
   * capture, the in-place rewrite on the `entriesOfSlot` path would strand the
   * entry on its overridden value — reset() would have no pristine original to
   * fall back to. The first read always sees the entry untouched.
   */
  function originalFor(slot: string, options: SectionOptions): InvRow | undefined {
    const originals = inventory.get(slot)
    if (originals === undefined) return undefined
    let row = originals.get(options.id)
    if (row === undefined) {
      row = snapshotRow(options as Record<string, unknown>)
      originals.set(options.id, row)
    }
    return row
  }

  // 2) `entries` (list readers — the Settings shell builds its nav from this):
  //    filter hidden and rewrite order/label. Cloning is safe on this path (no
  //    isLive check) and keeps the caller's array independent of the ledger.
  proto.entries = function entries(key) {
    const rows = origEntries.call(this, key)
    if (!MANAGED_KEYS.has(key)) return rows
    const p = policyHolder.current.forSlot(key)
    const out: StoredEntry[] = []
    for (const entry of rows) {
      const id = entry.options.id
      if (p.isHidden(id)) continue
      out.push({ ...entry, options: effective(p, entry.options, originalFor(key, entry.options)) })
    }
    return out
  }

  // 3) `entriesOfSlot` (renderer election, and the sidebar's own panel list):
  //    filter hidden, then REPLACE `entry.options` — the entry object keeps its
  //    identity because the renderer's isLive check compares entries by
  //    identity (`rec.entries.includes(entry)`), so returning a clone throws
  //    StaleAuthorizationError. This is also the only path the sidebar reads
  //    `options.order` / `options.label` from, so the rewrite must land here
  //    for ordering and renaming to reach it.
  proto.entriesOfSlot = function entriesOfSlot(key) {
    const rows = origEntriesOfSlot.call(this, key)
    if (!MANAGED_KEYS.has(key)) return rows
    const p = policyHolder.current.forSlot(key)
    const out: StoredEntry[] = []
    for (const entry of rows) {
      const id = entry.options.id
      if (p.isHidden(id)) continue
      entry.options = effective(p, entry.options, originalFor(key, entry.options))
      out.push(entry)
    }
    return out
  }

  proto.__slotsManagerPatched = true

  const iface: Patch = {
    installed: true,
    origEntries,
    inventory,
    bump() {
      try {
        const activeCtx = (proto.__slotsManagerCtx || ctx) as Context
        const slots = activeCtx.get('slots')
        if (!slots) return
        // EVERY managed slot, not just one. Each slot has its own version
        // counter and its own subscribers, and they are independent: the
        // Settings shell re-reads `settings.section`, while the sidebar
        // re-reads `sidebar.panellist` on THAT slot's version change
        //
        //   ctx.slots.subscribe("sidebar.panellist", syncPanels)
        //
        // so bumping a single slot left every other slot's readers stale — a
        // hidden panel button did not disappear until something else forced a
        // re-read (a page reload). Registering and immediately disposing one
        // throwaway entry per slot moves each version once; listeners flush on
        // a microtask, after both mutations, so nothing transient renders.
        for (const descriptor of MANAGED_SLOTS) {
          const disposer = slots.register(
            { name: descriptor.key, id: TOUCH_ID, order: 1e9, priority: 100, label: () => '' },
            () => null,
          )
          if (typeof disposer === 'function') disposer()
        }
      } catch (error) {
        /* best effort — a failed bump only delays the re-read */
      }
    },
  }
  proto.__slotsManagerPolicy = policyHolder
  proto.__slotsManagerCtx = ctx
  proto.__slotsManagerInterface = iface
  return iface
}

/* ------------------------------------------------------------------ *
 * Management section
 * ------------------------------------------------------------------ */

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: '4px 2px' },
  // Group heading ("设置页" / "左侧边栏").
  groupHeading: {
    fontSize: '11px', fontWeight: 600, lineHeight: '16px', letterSpacing: '.04em',
    textTransform: 'uppercase', color: 'var(--dsw-alias-label-caption)',
    margin: '14px 0 6px',
  },
  // One slot's block inside a group.
  slotBlock: { marginBottom: '10px' },
  slotHint: {
    fontSize: '11px', lineHeight: '15px', color: 'var(--dsw-alias-label-caption)',
    margin: '0 0 6px',
  },
  /** Per-slot header row: name + registered count + scoped reset. */
  slotHeading: { display: 'inline-flex', alignItems: 'baseline', gap: '6px', minWidth: 0 },
  slotNav: { fontSize: '13px', fontWeight: 600, lineHeight: '18px', color: 'var(--dsw-alias-label-primary)' },
  slotCount: { fontSize: '11px', lineHeight: '15px', color: 'var(--dsw-alias-label-caption)' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '12px', marginBottom: '12px',
  },
  hint: {
    fontSize: '13px', lineHeight: '1.5', color: 'var(--dsw-alias-label-tertiary)',
    margin: 0, flex: '1', minWidth: 0,
  },
  resetAllBtn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px', flex: 'none',
    fontSize: '12px', lineHeight: '16px', padding: '6px 12px', borderRadius: '8px',
    cursor: 'pointer', color: 'var(--dsw-alias-label-primary)',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l2)',
  },
  list: {
    listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px',
    position: 'relative',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '7px 10px', borderRadius: '10px',
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l1)',
    cursor: 'grab',
  },
  // Drag feedback lives in CSS classes (.dsm-row-dragging / .dsm-drop-before
  // / .dsm-drop-after), NOT inline styles: mixing the `border` shorthand above
  // with a `borderColor` longhand causes React's inline-style diffing to
  // corrupt the border when toggling the drop target.
  grip: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
    color: 'var(--dsw-alias-label-caption)', cursor: 'grab', padding: 0, background: 'none', border: 'none',
  },
  rowMain: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: '1' },
  labelLine: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
  label: {
    fontSize: '13px', fontWeight: 500, lineHeight: '18px', color: 'var(--dsw-alias-label-primary)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  tag: {
    flex: 'none', fontSize: '10px', lineHeight: '14px', padding: '1px 7px', borderRadius: '999px',
    color: 'var(--dsw-alias-label-tertiary)', background: 'var(--dsw-alias-interactive-bg-hover)',
  },
  meta: {
    fontSize: '11px', lineHeight: '15px', color: 'var(--dsw-alias-label-caption)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  renameInput: {
    flex: '1', minWidth: 0, fontSize: '13px', lineHeight: '18px', padding: '2px 8px',
    color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-2)',
    border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '6px', outline: 'none',
  },
  rowActions: { display: 'flex', alignItems: 'center', gap: '2px', flex: 'none' },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
    width: '26px', height: '26px', borderRadius: '7px', cursor: 'pointer',
    color: 'var(--dsw-alias-label-tertiary)', background: 'transparent', border: 'none', padding: 0,
  },
  empty: { fontSize: '12px', color: 'var(--dsw-alias-label-caption)' },
  switchTrack: {
    position: 'relative', flex: 'none', width: '34px', height: '20px', borderRadius: '999px',
    cursor: 'pointer', padding: 0, border: 'none', transition: 'background-color .15s ease',
    background: 'var(--dsw-alias-border-l2)',
  },
  switchKnob: {
    position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px', borderRadius: '999px',
    background: 'var(--dsw-alias-bg-base)', transition: 'transform .15s ease', pointerEvents: 'none',
  },
}

const SVG_COMMON: React.SVGProps<SVGSVGElement> = {
  width: 16, height: 16, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false',
}

function svgIcon(name: string): React.ReactElement {
  const circles = (x: number, ys: number[]) =>
    ys.map((cy, i) => React.createElement('circle', { key: `${x}-${i}`, cx: x, cy, r: 1, fill: 'currentColor', stroke: 'none' }))
  const paths = (ds: string[]) => ds.map((d, i) => React.createElement('path', { key: i, d }))
  const content: Record<string, () => React.ReactNode[]> = {
    grip: () => [...circles(9, [5, 12, 19]), ...circles(15, [5, 12, 19])],
    // Lucide chevron-up / chevron-down: centered 12x6 strokes.
    up: () => paths(['m18 15-6-6-6 6']),
    down: () => paths(['m6 9 6 6 6-6']),
    reset: () => paths(['M3 12a9 9 0 1 0 2.64-6.36L3 8', 'M3 3v5h5']),
    pencil: () => paths(['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z']),
  }
  // The full-size reset arc (18px) and pencil shape (20px) dwarf the 12px
  // chevrons, so shrink them around the viewBox center. `vector-effect:
  // non-scaling-stroke` keeps the 2px stroke width identical to the arrows, so
  // every icon shares the same line weight at a matching overall size.
  const scale = (name === 'reset' ? 0.72 : name === 'pencil' ? 0.7 : null)
  const nodes = content[name] ? content[name]() : null
  if (!nodes) return React.createElement('svg', SVG_COMMON, null)
  const kids = scale === null
    ? nodes
    : React.createElement(
        'g',
        { transform: `translate(12 12) scale(${scale}) translate(-12 -12)` },
        React.Children.map(nodes, (node) =>
          React.isValidElement(node) ? React.cloneElement(node, { vectorEffect: 'non-scaling-stroke' }) : node,
        ),
      )
  return React.createElement('svg', SVG_COMMON, kids)
}

function resolveLabel(label: string | (() => string) | undefined): string {
  if (typeof label === 'function') return label()
  return typeof label === 'string' ? label : ''
}

/**
 * Decide the insertion side (before/after) for a pointer Y over a row, with a
 * hysteresis dead band around the midpoint so the gap indicator doesn't flip
 * back and forth (flicker/shake) as the cursor crosses the middle of the row.
 * The current side is kept inside the band; `current` is the side the indicator
 * is already showing, so the drop lands where the user saw it.
 */
function resolvePlace(clientY: number, rect: DOMRect, current: Place | null): Place {
  const mid = rect.top + rect.height / 2
  const band = rect.height * 0.2
  if (clientY < mid - band) return 'before'
  if (clientY > mid + band) return 'after'
  return current ?? (clientY < mid ? 'before' : 'after')
}

/** The environment handed to one slot's panel. */
interface SlotPanelEnv {
  slots: SlotsService
  /** The document, for change notification (a policy edit in any slot re-renders). */
  store: PolicyStore
  /** The policy view bound to this panel's slot. */
  policy: Policy
  descriptor: SlotDescriptor
  readRows: () => SectionRow[]
  reorder: (movedId: string, targetId: string, place: Place) => void
  t: (key: string) => string
}

function createSlotPanel(env: SlotPanelEnv): React.FC {
  const { slots, store, policy, descriptor, readRows, reorder, t } = env
  const slotKey = descriptor.key
  const capability = descriptor.capability

  function SlotPanel(): React.ReactElement {
    const [, force] = React.useReducer((value: number) => value + 1, 0)
    const dragId = React.useRef<string | null>(null)
    const [overId, setOverId] = React.useState<string | null>(null)
    const [overPlace, setOverPlace] = React.useState<Place | null>(null)
    // Y (in list coords) of the single insertion-indicator line; null = hidden.
    const [indicatorY, setIndicatorY] = React.useState<number | null>(null)
    const listRef = React.useRef<HTMLUListElement | null>(null)
    // Inline rename: editingId = row currently editing; draft = input value.
    const editingIdRef = React.useRef<string | null>(null)
    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [draft, setDraft] = React.useState('')

    React.useEffect(() => {
      let offSlot: () => void = () => {}
      let offPolicy: () => void = () => {}
      try {
        offSlot = slots.subscribe(slotKey, force)
      } catch (error) {
        /* slot subscription is best effort */
      }
      offPolicy = store.subscribe(force)
      return () => {
        offSlot()
        offPolicy()
      }
    }, [])

    const rows = readRows()

    function clearDragTarget(): void {
      if (overId !== null || overPlace !== null || indicatorY !== null) {
        setOverId(null)
        setOverPlace(null)
        setIndicatorY(null)
      }
    }

    /** Enter inline-rename for a row, seeding the input with its current name. */
    function startEdit(row: SectionRow): void {
      editingIdRef.current = row.id
      setEditingId(row.id)
      setDraft(row.label)
    }

    /**
     * Commit the rename. An empty/whitespace value or a value identical to the
     * plugin's original name clears the override (back to the original). The
     * ref guards against the blur that fires right after Enter/Escape unmounts
     * the input — only the first caller acts.
     */
    function commitEdit(id: string): void {
      if (editingIdRef.current !== id) return
      editingIdRef.current = null
      const row = rows.find((r) => r.id === id)
      const value = draft.trim()
      if (row && value !== '' && value !== row.originalLabel) policy.setLabel(id, value)
      else policy.setLabel(id, '')
      setEditingId(null)
      setDraft('')
    }

    function cancelEdit(): void {
      editingIdRef.current = null
      setEditingId(null)
      setDraft('')
    }

    /** Insertion line TOP in list coordinates for a target row rect + side.
     *  The line is 2px tall, so its center lands on the gap midpoint (a 4px
     *  gap: before → 3px above the row's top edge, after → 1px below the
     *  row's bottom edge). */
    function computeIndicatorY(rect: DOMRect, place: Place): number | null {
      const listRect = listRef.current ? listRef.current.getBoundingClientRect() : null
      if (!listRect) return null
      return place === 'before' ? rect.top - listRect.top - 3 : rect.bottom - listRect.top + 1
    }

    function handleDragStart(e: React.DragEvent<HTMLLIElement>, id: string): void {
      dragId.current = id
      try {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
      } catch (error) {
        /* dataTransfer may be unavailable */
      }
      force()
    }

    function handleDragOver(e: React.DragEvent<HTMLLIElement>, id: string): void {
      if (dragId.current === id) {
        // Over the source row: don't allow a drop here.
        clearDragTarget()
        return
      }
      e.preventDefault()
      try {
        e.dataTransfer.dropEffect = 'move'
      } catch (error) {
        /* dataTransfer may be unavailable */
      }
      const rect = e.currentTarget.getBoundingClientRect()
      const place = resolvePlace(e.clientY, rect, overPlace)
      if (overId !== id) setOverId(id)
      if (overPlace !== place) setOverPlace(place)
      const y = computeIndicatorY(rect, place)
      if (indicatorY !== y) setIndicatorY(y)
    }

    // List-level: keep the drop allowed over the gaps, and only clear when
    // leaving the whole list — so the indicator never blinks while the pointer
    // crosses a 4px row gap.
    function handleListDragOver(e: React.DragEvent<HTMLUListElement>): void {
      e.preventDefault()
      try {
        e.dataTransfer.dropEffect = 'move'
      } catch (error) {
        /* dataTransfer may be unavailable */
      }
    }
    function handleListDragLeave(e: React.DragEvent<HTMLUListElement>): void {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDragTarget()
    }
    function handleListDrop(e: React.DragEvent<HTMLUListElement>): void {
      e.preventDefault()
      const movedId = dragId.current || (e.dataTransfer && e.dataTransfer.getData('text/plain'))
      const targetId = overId
      const place = overPlace
      dragId.current = null
      clearDragTarget()
      force()
      if (!movedId || !targetId || !place) return
      reorder(movedId, targetId, place)
    }

    function handleDrop(e: React.DragEvent<HTMLLIElement>, id: string): void {
      e.preventDefault()
      e.stopPropagation()
      // Prefer the ref; fall back to the dataTransfer payload in case a
      // dragstart didn't register dragId.
      const movedId = dragId.current || (e.dataTransfer && e.dataTransfer.getData('text/plain'))
      dragId.current = null
      clearDragTarget()
      force()
      if (!movedId || movedId === id) return
      // Use the hysteresis-aware side (matching the shown indicator) so the
      // drop lands where the user saw the gap line.
      const rect = e.currentTarget.getBoundingClientRect()
      const place = resolvePlace(e.clientY, rect, overPlace)
      reorder(movedId, id, place)
    }

    function handleDragEnd(): void {
      dragId.current = null
      clearDragTarget()
      force()
    }

    function renderRow(row: SectionRow, index: number): React.ReactElement {
      // This plugin's own section lives in settings.section only, and is never
      // hideable — otherwise a user could lock themselves out of the manager.
      const isOwn = slotKey === SECTION_SLOT && row.id === OWN_ID
      const editing = editingId === row.id
      const dragging = !editing && dragId.current === row.id
      const className = ['dsm-row', dragging ? 'dsm-row-dragging' : ''].filter(Boolean).join(' ')
      const prev = rows[index - 1]
      const next = rows[index + 1]

      const labelNode = editing
        ? React.createElement('input', {
            className: 'dsm-rename-input',
            autoFocus: true,
            value: draft,
            style: styles.renameInput,
            placeholder: t('renamePlaceholder'),
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
            onBlur: () => commitEdit(row.id),
            onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') commitEdit(row.id)
              else if (e.key === 'Escape') cancelEdit()
            },
          })
        : React.createElement('span', { style: styles.label }, row.label)

      return React.createElement(
        'li',
        {
          key: row.id,
          // A slot whose registrants declare no `label` (e.g. footer actions)
          // has nothing to rename, so the row is not draggable-independent but
          // simply not renamable — see the action cluster below.
          draggable: capability.order && !editing,
          className,
          style: styles.row,
          onDragStart: (e: React.DragEvent<HTMLLIElement>) => handleDragStart(e, row.id),
          onDragOver: (e: React.DragEvent<HTMLLIElement>) => handleDragOver(e, row.id),
          onDrop: (e: React.DragEvent<HTMLLIElement>) => handleDrop(e, row.id),
          onDragEnd: handleDragEnd,
        },
        React.createElement('span', { className: 'dsm-row-grip', style: styles.grip, title: t('dragHint') }, svgIcon('grip')),
        React.createElement(
          'div',
          { style: styles.rowMain },
          React.createElement(
            'span',
            { style: styles.labelLine },
            labelNode,
            row.hidden ? React.createElement('span', { style: styles.tag }, t('hiddenTag')) : null,
          ),
          React.createElement(
            'span',
            { style: styles.meta },
            `${row.id}${row.registrant ? ' · ' + row.registrant : ''}`,
          ),
        ),
        capability.hide
          ? React.createElement(
              'button',
              {
                type: 'button',
                className: 'dsm-switch',
                role: 'switch',
                'aria-checked': !row.hidden,
                disabled: isOwn,
                title: isOwn ? t('selfNote') : (row.hidden ? t('show') : t('hide')),
                onClick: () => policy.setHidden(row.id, !row.hidden),
                style: {
                  ...styles.switchTrack,
                  ...(row.hidden ? {} : { background: 'var(--dsw-alias-state-success-primary)' }),
                },
              },
              React.createElement('span', {
                className: 'dsm-switch-knob',
                style: {
                  ...styles.switchKnob,
                  transform: row.hidden ? 'translateX(0)' : 'translateX(14px)',
                },
              }),
            )
          : null,
        React.createElement(
          'div',
          { style: styles.rowActions },
          // Reorder arrows are only meaningful when a consumer sorts by order —
          // every managed slot today does, so the capability gates the whole
          // cluster rather than each button.
          capability.order
            ? React.createElement(
                'button',
                {
                  type: 'button', className: 'dsm-icon-btn', title: t('moveUp'), 'aria-label': t('moveUp'),
                  style: styles.iconBtn, disabled: prev === undefined,
                  onClick: () => reorder(row.id, prev.id, 'before'),
                },
                svgIcon('up'),
              )
            : null,
          capability.order
            ? React.createElement(
                'button',
                {
                  type: 'button', className: 'dsm-icon-btn', title: t('moveDown'), 'aria-label': t('moveDown'),
                  style: styles.iconBtn, disabled: next === undefined,
                  onClick: () => reorder(row.id, next.id, 'after'),
                },
                svgIcon('down'),
              )
            : null,
          // Rename is suppressed entirely (not merely disabled) for slots whose
          // registrants declare no `label`: there is no projected text to edit,
          // so offering the control would be a dead end.
          capability.rename
            ? React.createElement(
                'button',
                {
                  type: 'button', className: 'dsm-icon-btn', title: t('rename'), 'aria-label': t('rename'),
                  style: styles.iconBtn, disabled: editing,
                  onClick: () => startEdit(row),
                },
                svgIcon('pencil'),
              )
            : null,
          React.createElement(
            'button',
            {
              type: 'button', className: 'dsm-icon-btn', title: t('reset'), 'aria-label': t('reset'),
              style: styles.iconBtn,
              onClick: () => policy.reset(row.id),
            },
            svgIcon('reset'),
          ),
        ),
      )
    }

    // Per-slot header: the slot's display name, its one-line explanation and a
    // reset scoped to just this slot. The global "reset all" lives in the
    // manager's own header (class `dsm-reset-all`, kept unique so selectors and
    // the e2e suite keep resolving to exactly one element).
    const header = React.createElement(
      'div',
      { style: styles.header },
      React.createElement(
        'div',
        { style: styles.slotHeading },
        React.createElement('span', { style: styles.slotNav }, t(navKeyFor(slotKey))),
        React.createElement('span', { style: styles.slotCount }, String(rows.length)),
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsm-reset-slot',
          onClick: () => policy.resetAll(),
          style: styles.resetAllBtn,
          title: t('resetSlot'),
        },
        svgIcon('reset'),
        React.createElement('span', null, t('resetSlot')),
      ),
    )

    const body =
      rows.length === 0
        ? React.createElement('p', { style: styles.empty }, t('empty'))
        : React.createElement(
            'ul',
            {
              ref: listRef,
              style: styles.list,
              onDragOver: handleListDragOver,
              onDragLeave: handleListDragLeave,
              onDrop: handleListDrop,
            },
            // Single insertion indicator, positioned in the row gap; persists
            // across the gaps so it never blinks while dragging.
            indicatorY !== null
              ? React.createElement('div', { className: 'dsm-drop-indicator', style: { top: indicatorY } })
              : null,
            rows.map((row, index) => renderRow(row, index)),
          )

    return React.createElement('div', { style: styles.wrap }, header, body)
  }

  return SlotPanel
}

/** The environment handed to the manager component. */
interface ManagerEnv {
  slots: SlotsService
  store: PolicyStore
  readRows: (slot: string) => SectionRow[]
  reorder: (slot: string, movedId: string, targetId: string, place: Place) => void
  t: (key: string) => string
}

/**
 * The manager panel: one heading per group, one panel per managed slot.
 * Both levels are driven by MANAGED_SLOTS / SLOT_GROUPS, so adding a slot is a
 * table edit in `slots.ts` — nothing here changes.
 */
function createManagerSection(env: ManagerEnv): React.FC {
  const { slots, store, readRows, reorder, t } = env

  // One panel component per slot, built once. Each carries its own drag/edit
  // state, so reordering in one slot can never touch another.
  const panels = new Map<string, React.FC>()
  for (const descriptor of MANAGED_SLOTS) {
    panels.set(
      descriptor.key,
      createSlotPanel({
        slots,
        store,
        policy: store.forSlot(descriptor.key),
        descriptor,
        readRows: () => readRows(descriptor.key),
        reorder: (movedId, targetId, place) => reorder(descriptor.key, movedId, targetId, place),
        t,
      }),
    )
  }

  function ManagerSection(): React.ReactElement {
    const [, force] = React.useReducer((value: number) => value + 1, 0)

    React.useEffect(() => {
      const offs: (() => void)[] = []
      for (const descriptor of MANAGED_SLOTS) {
        try {
          offs.push(slots.subscribe(descriptor.key, force))
        } catch (error) {
          /* slot subscription is best effort */
        }
      }
      const offPolicy = store.subscribe(force)
      return () => {
        for (const off of offs) off()
        offPolicy()
      }
    }, [])

    const children: React.ReactNode[] = [
      React.createElement(
        'div',
        { style: styles.header },
        React.createElement('p', { style: styles.hint }, t('hint')),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'dsm-reset-all',
            onClick: () => {
              for (const descriptor of MANAGED_SLOTS) store.forSlot(descriptor.key).resetAll()
            },
            style: styles.resetAllBtn,
            title: t('resetAll'),
          },
          svgIcon('reset'),
          React.createElement('span', null, t('resetAll')),
        ),
      ),
    ]

    for (const group of SLOT_GROUPS) {
      const descriptors = MANAGED_SLOTS.filter((slot) => slot.group === group.id)
      if (descriptors.length === 0) continue
      children.push(
        React.createElement('h3', { key: `group-${group.id}`, style: styles.groupHeading }, t(group.navKey)),
      )
      for (const descriptor of descriptors) {
        const Panel = panels.get(descriptor.key)
        if (Panel === undefined) continue
        children.push(
          React.createElement(
            'section',
            // `data-slot` lets tests (and anyone inspecting the DOM) address one
            // slot's list without relying on row order across groups.
            { key: descriptor.key, 'data-slot': descriptor.key, style: styles.slotBlock },
            React.createElement('p', { style: styles.slotHint }, t(hintKeyFor(descriptor.key))),
            React.createElement(Panel),
          ),
        )
      }
    }

    return React.createElement('div', { style: styles.wrap }, children)
  }

  return ManagerSection
}

/* ------------------------------------------------------------------ *
 * Plugin entry
 * ------------------------------------------------------------------ */

/** The __test seam (attached to globalThis only under the test flag). */
interface TestSeam {
  /** The whole document: load a server payload, snapshot the persisted shape. */
  store: PolicyStore
  /** Policy view bound to `settings.section`. */
  policy: Policy
  /** Row readers/mutators bound to `settings.section`. */
  readSections: () => SectionRow[]
  reorder: (movedId: string, targetId: string, place: Place) => void
  setOrders: (orders: Record<string, number>) => void
  resetAll: () => void
  /** Slot-explicit surface, for tests covering slots beyond settings.section. */
  policyFor: (slot: string) => Policy
  /** The managed-slot table itself, so tests can assert the declared capabilities. */
  descriptors: readonly SlotDescriptor[]
  patch: Patch
  /** Registration inventory for `settings.section`. */
  inventory: Map<string, InvRow>
}

function globals(): any {
  return globalThis as any
}

export const name = 'dsh-slots-manager'
export const inject = ['slots', 'locale', 'remote', 'remote.settings']

export function apply(ctx: Context): void {
  const slots = ctx.get('slots') as unknown as SlotsService
  if (slots === undefined) return

  const remote = ctx.get('remote') as unknown as RemoteService | undefined

  const locale = ctx.get('locale') as unknown as LocaleService | undefined
  if (locale !== undefined) {
    ctx.effect(
      () => {
        locale.register(LOCALE_NS, { zh, en })
        return () => {}
      },
      'dsh-slots-manager: dictionaries',
    )
  }
  const t = locale !== undefined ? locale.bind(LOCALE_NS) : (key: string) => key

  // The settings nav clips once many sections register; make it scroll.
  ctx.effect(() => insertStyles(NAV_SCROLL_CSS + '\n' + PANEL_CSS), 'dsh-slots-manager: styles')

  // Policy first, patches second — every registration from here on (including
  // this plugin's own section) flows through the policy.
  //
  // Persist the full policy to the server settings namespace `slots-manager`
  // (registered by the host half) over the `remote.settings` wire face. If the
  // remote service is unavailable the plugin degrades to in-memory only (no
  // persistence).
  const settings = remote && remote.settings ? remote.settings : undefined
  const persist = settings
    ? (doc: PolicyDoc): void => {
        void settings.replace(SECTION_NS, doc as unknown as object, undefined).catch(() => {})
      }
    : (): void => {}

  const store = createPolicyStore(persist)
  const patch = installPatches(ctx, store)
  if (!patch.installed) return
  store.setOnChanged(patch.bump)
  // Force the shell to re-read at least once after patching.
  patch.bump()

  // Load the persisted policy from the server once available (async; the read
  // path shows plugin defaults until it resolves, then re-reads via the bump).
  // `load` validates the payload itself, so nothing untrusted reaches the state.
  if (settings) {
    void settings
      .describe()
      .then((response) => {
        if (!response.ok) return
        const ns = response.value.namespaces.find((row) => row.ns === SECTION_NS)
        if (ns) store.load(ns.value)
      })
      .catch(() => {})
  }

  /**
   * Raw inventory of one slot: EVERY entry (hidden included), with the policy
   * applied for display. Read straight from the unpatched `origEntries`, so the
   * manager shows what is actually registered rather than what it filters to.
   */
  const readRows = (slot: string): SectionRow[] => {
    let entries: readonly StoredEntry[]
    try {
      entries = patch.origEntries.call(slots, slot)
    } catch (error) {
      entries = []
    }
    const view = store.forSlot(slot)
    return entries
      .map((entry, seq) => {
        const originalLabel = resolveLabel(entry.options.label) || entry.options.id
        return {
          id: entry.options.id,
          label: view.labelFor(entry.options.id) ?? originalLabel,
          originalLabel,
          registrant: entry.options.registrant,
          order: view.effectiveOrder(entry.options.id, entry.options.order),
          hidden: view.isHidden(entry.options.id),
          seq,
        }
      })
      .sort((a, b) => a.order - b.order || a.seq - b.seq)
  }

  /**
   * Reorder within ONE slot: place `movedId` immediately before/after
   * `targetId` in the effective sorted order, then renumber every entry in that
   * slot to exact index*10 values so the arrangement is collision-free and the
   * per-row reset / "全部重置" can drop the overrides wholesale.
   */
  const reorder = (slot: string, movedId: string, targetId: string, place: Place): void => {
    const rows = readRows(slot)
    const src = rows.findIndex((row) => row.id === movedId)
    if (src === -1) return
    const list = rows.map((row) => row.id)
    list.splice(src, 1)
    let ins = list.indexOf(targetId)
    if (ins === -1) return
    if (place === 'after') ins += 1
    list.splice(ins, 0, movedId)
    const orders: Record<string, number> = {}
    list.forEach((id, index) => {
      orders[id] = index * 10
    })
    store.forSlot(slot).setOrders(orders)
  }

  const env: ManagerEnv = { slots, store, readRows, reorder, t }
  const ManagerSection = createManagerSection(env)

  // This plugin's own section — registered through the (patched) slots service
  // so it participates normally; the policy never hides it.
  slots.inject(SECTION_SLOT, () =>
    slots.register(
      {
        name: SECTION_SLOT,
        id: OWN_ID,
        order: OWN_ORDER,
        label: () => t('nav'),
        locale: LOCALE_NS,
      },
      () => React.createElement(ManagerSection),
    ),
  )

  // The second door: the SAME panel, on this plugin's own page in the sidebar
  // Plugins list. The slot is declared by ui-plugin-manager, so `inject` queues
  // this until that owner mounts — the registration order is not ours to control.
  //
  // Keyed by package name: that is what routes the contribution to THIS bundle's
  // page. No `order`/`label` — keyed slots dispatch by key and the owning page
  // supplies its own chrome.
  slots.inject(BUNDLE_CONFIG_SLOT, () =>
    slots.register(
      {
        name: BUNDLE_CONFIG_SLOT,
        key: BUNDLE_KEY,
        locale: LOCALE_NS,
      },
      () => React.createElement(ManagerSection),
    ),
  )

  // Test seam: drives policy mutations / read-only inventory from the test
  // harness; never present in production.
  //
  // The `settings.section`-bound members exist so the original suite (written
  // against the single-slot build) keeps exercising the SAME code paths without
  // being rewritten — the binding is the only thing that changed, not the
  // behaviour under test. Slot-explicit members cover every other slot.
  if (globals().__DSH_SLOTS_MANAGER_TEST__) {
    const bound = store.forSlot(SECTION_SLOT)
    const seam: TestSeam = {
      store,
      policy: bound,
      readSections: () => readRows(SECTION_SLOT),
      reorder: (movedId, targetId, place) => reorder(SECTION_SLOT, movedId, targetId, place),
      setOrders: bound.setOrders,
      resetAll: bound.resetAll,
      policyFor: (slot) => store.forSlot(slot),
      descriptors: MANAGED_SLOTS,
      patch,
      inventory: patch.inventory.get(SECTION_SLOT) ?? new Map(),
    }
    globals().__DSH_SLOTS_MANAGER_SEAM__ = seam
  }
}
