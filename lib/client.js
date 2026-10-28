window.__ModuleLoader__.load({
  id: 'dsh-slots-manager',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);

// src/slots.ts
var MANAGED_SLOTS = [
  {
    key: "settings.section",
    group: "settings",
    capability: { hide: true, order: true, rename: true }
  },
  {
    key: "sidebar.panellist",
    group: "sidebar",
    capability: { hide: true, order: true, rename: true }
  },
  {
    key: "sidebar.footer.action",
    group: "sidebar",
    capability: { hide: true, order: true, rename: false }
  }
];
var MANAGED_KEYS = new Set(MANAGED_SLOTS.map((slot) => slot.key));
var SECTION_SLOT = "settings.section";
var SLOT_GROUPS = [
  { id: "settings", navKey: "group.settings" },
  { id: "sidebar", navKey: "group.sidebar" }
];
function navKeyFor(key) {
  return `slotNav.${key}`;
}
function hintKeyFor(key) {
  return `slotHint.${key}`;
}

// src/client.ts
var OWN_ID = "slots-manager";
var SECTION_NS = "slots-manager";
var LOCALE_NS = "slotsManager";
var OWN_ORDER = 1;
var TOUCH_ID = "slots-manager-touch";
var BUNDLE_CONFIG_SLOT = "plugins.bundle.config";
var BUNDLE_KEY = "dsh-slots-manager";
var POLICY_VERSION = 1;
var zh = {
  nav: "\u8BBE\u7F6E\u7F16\u6392",
  hint: "\u7BA1\u7406\u5404\u63D2\u4EF6\u5728\u754C\u9762\u4E0A\u63D0\u4F9B\u7684\u5206\u533A\u4E0E\u6309\u94AE\uFF1A\u9690\u85CF\u3001\u6392\u5E8F\u3001\u6539\u540D\uFF0C\u6539\u52A8\u5373\u65F6\u751F\u6548\u3002",
  hide: "\u9690\u85CF",
  show: "\u663E\u793A",
  moveUp: "\u4E0A\u79FB",
  moveDown: "\u4E0B\u79FB",
  reset: "\u91CD\u7F6E",
  resetAll: "\u5168\u90E8\u91CD\u7F6E",
  resetSlot: "\u91CD\u7F6E\u672C\u69FD\u4F4D",
  hiddenTag: "\u5DF2\u9690\u85CF",
  empty: "\u6682\u65E0\u6CE8\u518C\u9879",
  selfNote: "\u672C\u5206\u533A\u7531 dsh-slots-manager \u63D0\u4F9B\uFF0C\u4E0D\u53EF\u9690\u85CF\u3002",
  dragHint: "\u62D6\u62FD\u8C03\u6574\u987A\u5E8F",
  rename: "\u6539\u540D",
  renamePlaceholder: "\u8F93\u5165\u65B0\u540D\u79F0\u2026",
  /** Group headings. */
  "group.settings": "\u8BBE\u7F6E\u9875",
  "group.sidebar": "\u5DE6\u4FA7\u8FB9\u680F",
  /** Slot display names (see slots.ts `navKeyFor`). */
  "slotNav.settings.section": "\u8BBE\u7F6E\u5206\u533A",
  "slotNav.sidebar.panellist": "\u9762\u677F\u6309\u94AE",
  "slotNav.sidebar.footer.action": "\u680F\u5E95\u52A8\u4F5C",
  /** One-line explanation per slot (see slots.ts `hintKeyFor`). */
  "slotHint.settings.section": "\u8BBE\u7F6E\u5BF9\u8BDD\u6846\u5DE6\u4FA7\u5BFC\u822A\u91CC\u7684\u5206\u533A",
  "slotHint.sidebar.panellist": "\u5DE6\u4FA7\u680F\u7684\u56FE\u6807\u6309\u94AE",
  "slotHint.sidebar.footer.action": "Settings \u65C1\u8FB9\u7684\u5E95\u680F\u52A8\u4F5C\uFF1B\u90E8\u5206\u52A8\u4F5C\u5728\u63D0\u4F9B\u5B83\u7684\u63D2\u4EF6\u91CC\u4E5F\u6709\u81EA\u5DF1\u7684\u663E\u793A\u5F00\u5173"
};
var en = {
  nav: "Settings Manager",
  hint: "Manage the sections and buttons plugins contribute to the UI: hide, reorder, rename. Changes apply instantly.",
  hide: "Hide",
  show: "Show",
  moveUp: "Move up",
  moveDown: "Move down",
  reset: "Reset",
  resetAll: "Reset all",
  resetSlot: "Reset this slot",
  hiddenTag: "Hidden",
  empty: "Nothing registered yet",
  selfNote: "Provided by dsh-slots-manager; cannot be hidden.",
  dragHint: "Drag to reorder",
  rename: "Rename",
  renamePlaceholder: "Enter new name\u2026",
  "group.settings": "Settings",
  "group.sidebar": "Left sidebar",
  "slotNav.settings.section": "Settings sections",
  "slotNav.sidebar.panellist": "Panel buttons",
  "slotNav.sidebar.footer.action": "Footer actions",
  "slotHint.settings.section": "The entries in the Settings dialog nav",
  "slotHint.sidebar.panellist": "The icon buttons in the left sidebar",
  "slotHint.sidebar.footer.action": "Actions beside Settings at the sidebar foot; some also have a show/hide switch in their own plugin"
};
var NAV_SCROLL_CSS = [
  '[role="dialog"] nav { overflow-y: auto; padding-bottom: 12px; scrollbar-width: thin; }'
].join("\n");
var PANEL_CSS = [
  ".dsm-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }",
  ".dsm-icon-btn:disabled { opacity: .35; cursor: default; }",
  ".dsm-icon-btn:disabled:hover { background: transparent; }",
  ".dsm-reset-all:hover { background: var(--dsw-alias-interactive-bg-hover); }",
  ".dsm-switch:disabled { opacity: .5; cursor: default; }",
  // Drag feedback via classes (not inline styles — see styles.row comment).
  ".dsm-row-dragging { opacity: .4; }",
  // Single insertion indicator element, positioned in the row gap at the
  // exact spot where the dragged section will land. Blue (business-primary)
  // reads as a placement cue rather than success.
  ".dsm-drop-indicator {",
  "  position: absolute; left: 2px; right: 2px; height: 2px;",
  "  border-radius: 1px; background: var(--dsw-alias-state-business-primary);",
  "  z-index: 2; pointer-events: none;",
  "}",
  // Narrow screens: the settings nav stays a fixed 188px, which on a small
  // dialog leaves the panel too cramped for the row's action cluster. Narrow
  // the nav and compact the row actions (hide the decorative grip, shrink
  // icons) so everything fits. !important is needed: the elements carry React
  // inline styles / upstream nav rules, which would otherwise beat the classes.
  "@media (max-width: 520px) {",
  '  [role="dialog"] nav { width: 140px !important; }',
  "  .dsm-row { gap: 4px !important; padding: 6px 8px !important; }",
  "  .dsm-row-grip { display: none !important; }",
  "  .dsm-icon-btn { width: 22px !important; height: 22px !important; }",
  "}"
].join("\n");
function insertStyles(css) {
  if (typeof document === "undefined") return () => {
  };
  const style = document.createElement("style");
  style.setAttribute("data-plugin", "dsh-slots-manager");
  style.textContent = css;
  document.head.append(style);
  return () => style.remove();
}
function createEmitter() {
  const listeners = /* @__PURE__ */ new Set();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit() {
      for (const fn of [...listeners]) {
        try {
          fn();
        } catch (error) {
        }
      }
    }
  };
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function normalizeSlotPolicy(raw) {
  const out = { hidden: {}, order: {}, labels: {} };
  if (!isRecord(raw)) return out;
  if (isRecord(raw.hidden)) {
    for (const [id, value] of Object.entries(raw.hidden)) {
      if (value === true) out.hidden[id] = true;
    }
  }
  if (isRecord(raw.order)) {
    for (const [id, value] of Object.entries(raw.order)) {
      if (typeof value === "number" && Number.isFinite(value)) out.order[id] = value;
    }
  }
  if (isRecord(raw.labels)) {
    for (const [id, value] of Object.entries(raw.labels)) {
      if (typeof value === "string" && value.length > 0) out.labels[id] = value;
    }
  }
  return out;
}
function normalizeDoc(raw) {
  const out = {};
  if (!isRecord(raw) || !isRecord(raw.slots)) return out;
  for (const [slot, value] of Object.entries(raw.slots)) {
    if (!MANAGED_KEYS.has(slot)) continue;
    out[slot] = normalizeSlotPolicy(value);
  }
  return out;
}
function createPolicyStore(persist) {
  const state = { version: POLICY_VERSION, slots: {} };
  let mutated = false;
  const emitter = createEmitter();
  let onChanged = null;
  function writable(slot) {
    let current = state.slots[slot];
    if (current === void 0) {
      current = { hidden: {}, order: {}, labels: {} };
      state.slots[slot] = current;
    }
    return current;
  }
  function readable(slot) {
    return state.slots[slot];
  }
  function snapshot() {
    const slots = {};
    for (const [slot, value] of Object.entries(state.slots)) {
      slots[slot] = {
        hidden: { ...value.hidden },
        order: { ...value.order },
        labels: { ...value.labels }
      };
    }
    return { version: POLICY_VERSION, slots };
  }
  function save() {
    try {
      persist(snapshot());
    } catch (error) {
    }
  }
  function emit() {
    emitter.emit();
    if (onChanged) {
      try {
        onChanged();
      } catch (error) {
      }
    }
  }
  function changed() {
    save();
    emit();
  }
  const views = /* @__PURE__ */ new Map();
  function createView(slot) {
    const isOwn = (id) => slot === SECTION_SLOT && id === OWN_ID;
    const view = {
      slot,
      isHidden(id) {
        if (isOwn(id)) return false;
        return readable(slot)?.hidden[id] === true;
      },
      orderFor(id) {
        const value = readable(slot)?.order[id];
        return typeof value === "number" && Number.isFinite(value) ? value : void 0;
      },
      labelFor(id) {
        const value = readable(slot)?.labels[id];
        return typeof value === "string" && value.length > 0 ? value : void 0;
      },
      effectiveOrder(id, registeredOrder) {
        const value = view.orderFor(id);
        return value !== void 0 ? value : typeof registeredOrder === "number" ? registeredOrder : 0;
      },
      setHidden(id, hidden) {
        if (isOwn(id)) return;
        mutated = true;
        const target = writable(slot);
        if (hidden) target.hidden[id] = true;
        else delete target.hidden[id];
        changed();
      },
      setOrders(orders) {
        let dirty = false;
        for (const [id, order] of Object.entries(orders)) {
          const existing = readable(slot)?.order[id];
          if (typeof order === "number" && Number.isFinite(order)) {
            if (existing !== order) {
              mutated = true;
              writable(slot).order[id] = order;
              dirty = true;
            }
          } else if (existing !== void 0) {
            mutated = true;
            delete writable(slot).order[id];
            dirty = true;
          }
        }
        if (dirty) changed();
      },
      setLabel(id, label) {
        mutated = true;
        const target = writable(slot);
        const value = typeof label === "string" ? label.trim() : "";
        if (value.length > 0) target.labels[id] = value;
        else delete target.labels[id];
        changed();
      },
      reset(id) {
        mutated = true;
        const target = writable(slot);
        delete target.hidden[id];
        delete target.order[id];
        delete target.labels[id];
        changed();
      },
      resetAll() {
        mutated = true;
        delete state.slots[slot];
        changed();
      }
    };
    return view;
  }
  return {
    forSlot(slot) {
      let view = views.get(slot);
      if (view === void 0) {
        view = createView(slot);
        views.set(slot, view);
      }
      return view;
    },
    load(raw) {
      if (mutated) return;
      state.slots = normalizeDoc(raw);
      emit();
    },
    subscribe(fn) {
      return emitter.subscribe(fn);
    },
    setOnChanged(fn) {
      onChanged = fn;
    },
    snapshot
  };
}
function installPatches(ctx, store) {
  let slotsService;
  try {
    slotsService = ctx.get("slots");
  } catch (error) {
    slotsService = void 0;
  }
  if (slotsService === void 0) return { installed: false };
  let proto;
  try {
    proto = Object.getPrototypeOf(slotsService);
  } catch (error) {
    proto = void 0;
  }
  if (!proto || typeof proto.register !== "function") return { installed: false };
  if (proto.__slotsManagerPatched) {
    const holder = proto.__slotsManagerPolicy;
    if (holder) holder.current = store;
    proto.__slotsManagerCtx = ctx;
    return proto.__slotsManagerInterface || { installed: true };
  }
  const policyHolder = { current: store };
  const origRegister = proto.register;
  const origEntries = proto.entries;
  const origEntriesOfSlot = proto.entriesOfSlot;
  const inventory = /* @__PURE__ */ new Map();
  for (const slot of MANAGED_SLOTS) inventory.set(slot.key, /* @__PURE__ */ new Map());
  function snapshotRow(options) {
    return {
      id: String(options.id),
      order: typeof options.order === "number" ? options.order : 0,
      label: options.label,
      priority: typeof options.priority === "number" ? options.priority : 0,
      registrant: typeof options.registrant === "string" ? options.registrant : void 0
    };
  }
  function effective(p, options, original) {
    const order = p.orderFor(options.id) ?? original?.order;
    const label = p.labelFor(options.id) ?? original?.label;
    return {
      ...options,
      ...order !== void 0 ? { order } : {},
      ...label !== void 0 ? { label: typeof label === "function" ? label : () => String(label) } : {}
    };
  }
  proto.register = function register(rawOptions, component) {
    const slot = rawOptions ? rawOptions.name : void 0;
    if (typeof slot === "string" && MANAGED_KEYS.has(slot) && typeof rawOptions.id === "string" && rawOptions.id !== TOUCH_ID) {
      inventory.get(slot)?.set(rawOptions.id, snapshotRow(rawOptions));
    }
    return origRegister.call(this, rawOptions, component);
  };
  function originalFor(slot, options) {
    const originals = inventory.get(slot);
    if (originals === void 0) return void 0;
    let row = originals.get(options.id);
    if (row === void 0) {
      row = snapshotRow(options);
      originals.set(options.id, row);
    }
    return row;
  }
  proto.entries = function entries(key) {
    const rows = origEntries.call(this, key);
    if (!MANAGED_KEYS.has(key)) return rows;
    const p = policyHolder.current.forSlot(key);
    const out = [];
    for (const entry of rows) {
      const id = entry.options.id;
      if (p.isHidden(id)) continue;
      out.push({ ...entry, options: effective(p, entry.options, originalFor(key, entry.options)) });
    }
    return out;
  };
  proto.entriesOfSlot = function entriesOfSlot(key) {
    const rows = origEntriesOfSlot.call(this, key);
    if (!MANAGED_KEYS.has(key)) return rows;
    const p = policyHolder.current.forSlot(key);
    const out = [];
    for (const entry of rows) {
      const id = entry.options.id;
      if (p.isHidden(id)) continue;
      entry.options = effective(p, entry.options, originalFor(key, entry.options));
      out.push(entry);
    }
    return out;
  };
  proto.__slotsManagerPatched = true;
  const iface = {
    installed: true,
    origEntries,
    inventory,
    bump() {
      try {
        const activeCtx = proto.__slotsManagerCtx || ctx;
        const slots = activeCtx.get("slots");
        if (!slots) return;
        for (const descriptor of MANAGED_SLOTS) {
          const disposer = slots.register(
            { name: descriptor.key, id: TOUCH_ID, order: 1e9, priority: 100, label: () => "" },
            () => null
          );
          if (typeof disposer === "function") disposer();
        }
      } catch (error) {
      }
    }
  };
  proto.__slotsManagerPolicy = policyHolder;
  proto.__slotsManagerCtx = ctx;
  proto.__slotsManagerInterface = iface;
  return iface;
}
var styles = {
  wrap: { padding: "4px 2px" },
  // Group heading ("设置页" / "左侧边栏").
  groupHeading: {
    fontSize: "11px",
    fontWeight: 600,
    lineHeight: "16px",
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "var(--dsw-alias-label-caption)",
    margin: "14px 0 6px"
  },
  // One slot's block inside a group.
  slotBlock: { marginBottom: "10px" },
  slotHint: {
    fontSize: "11px",
    lineHeight: "15px",
    color: "var(--dsw-alias-label-caption)",
    margin: "0 0 6px"
  },
  /** Per-slot header row: name + registered count + scoped reset. */
  slotHeading: { display: "inline-flex", alignItems: "baseline", gap: "6px", minWidth: 0 },
  slotNav: { fontSize: "13px", fontWeight: 600, lineHeight: "18px", color: "var(--dsw-alias-label-primary)" },
  slotCount: { fontSize: "11px", lineHeight: "15px", color: "var(--dsw-alias-label-caption)" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "12px"
  },
  hint: {
    fontSize: "13px",
    lineHeight: "1.5",
    color: "var(--dsw-alias-label-tertiary)",
    margin: 0,
    flex: "1",
    minWidth: 0
  },
  resetAllBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    flex: "none",
    fontSize: "12px",
    lineHeight: "16px",
    padding: "6px 12px",
    borderRadius: "8px",
    cursor: "pointer",
    color: "var(--dsw-alias-label-primary)",
    background: "var(--dsw-alias-bg-layer-1)",
    border: "1px solid var(--dsw-alias-border-l2)"
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    position: "relative"
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "7px 10px",
    borderRadius: "10px",
    background: "var(--dsw-alias-bg-layer-1)",
    border: "1px solid var(--dsw-alias-border-l1)",
    cursor: "grab"
  },
  // Drag feedback lives in CSS classes (.dsm-row-dragging / .dsm-drop-before
  // / .dsm-drop-after), NOT inline styles: mixing the `border` shorthand above
  // with a `borderColor` longhand causes React's inline-style diffing to
  // corrupt the border when toggling the drop target.
  grip: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
    color: "var(--dsw-alias-label-caption)",
    cursor: "grab",
    padding: 0,
    background: "none",
    border: "none"
  },
  rowMain: { display: "flex", flexDirection: "column", gap: "1px", minWidth: 0, flex: "1" },
  labelLine: { display: "flex", alignItems: "center", gap: "6px", minWidth: 0 },
  label: {
    fontSize: "13px",
    fontWeight: 500,
    lineHeight: "18px",
    color: "var(--dsw-alias-label-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  tag: {
    flex: "none",
    fontSize: "10px",
    lineHeight: "14px",
    padding: "1px 7px",
    borderRadius: "999px",
    color: "var(--dsw-alias-label-tertiary)",
    background: "var(--dsw-alias-interactive-bg-hover)"
  },
  meta: {
    fontSize: "11px",
    lineHeight: "15px",
    color: "var(--dsw-alias-label-caption)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  },
  renameInput: {
    flex: "1",
    minWidth: 0,
    fontSize: "13px",
    lineHeight: "18px",
    padding: "2px 8px",
    color: "var(--dsw-alias-label-primary)",
    background: "var(--dsw-alias-bg-layer-2)",
    border: "1px solid var(--dsw-alias-border-l2)",
    borderRadius: "6px",
    outline: "none"
  },
  rowActions: { display: "flex", alignItems: "center", gap: "2px", flex: "none" },
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "none",
    width: "26px",
    height: "26px",
    borderRadius: "7px",
    cursor: "pointer",
    color: "var(--dsw-alias-label-tertiary)",
    background: "transparent",
    border: "none",
    padding: 0
  },
  empty: { fontSize: "12px", color: "var(--dsw-alias-label-caption)" },
  switchTrack: {
    position: "relative",
    flex: "none",
    width: "34px",
    height: "20px",
    borderRadius: "999px",
    cursor: "pointer",
    padding: 0,
    border: "none",
    transition: "background-color .15s ease",
    background: "var(--dsw-alias-border-l2)"
  },
  switchKnob: {
    position: "absolute",
    top: "2px",
    left: "2px",
    width: "16px",
    height: "16px",
    borderRadius: "999px",
    background: "var(--dsw-alias-bg-base)",
    transition: "transform .15s ease",
    pointerEvents: "none"
  }
};
var SVG_COMMON = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false"
};
function svgIcon(name2) {
  const circles = (x, ys) => ys.map((cy, i) => import_react.default.createElement("circle", { key: `${x}-${i}`, cx: x, cy, r: 1, fill: "currentColor", stroke: "none" }));
  const paths = (ds) => ds.map((d, i) => import_react.default.createElement("path", { key: i, d }));
  const content = {
    grip: () => [...circles(9, [5, 12, 19]), ...circles(15, [5, 12, 19])],
    // Lucide chevron-up / chevron-down: centered 12x6 strokes.
    up: () => paths(["m18 15-6-6-6 6"]),
    down: () => paths(["m6 9 6 6 6-6"]),
    reset: () => paths(["M3 12a9 9 0 1 0 2.64-6.36L3 8", "M3 3v5h5"]),
    pencil: () => paths(["M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"])
  };
  const scale = name2 === "reset" ? 0.72 : name2 === "pencil" ? 0.7 : null;
  const nodes = content[name2] ? content[name2]() : null;
  if (!nodes) return import_react.default.createElement("svg", SVG_COMMON, null);
  const kids = scale === null ? nodes : import_react.default.createElement(
    "g",
    { transform: `translate(12 12) scale(${scale}) translate(-12 -12)` },
    import_react.default.Children.map(
      nodes,
      (node) => import_react.default.isValidElement(node) ? import_react.default.cloneElement(node, { vectorEffect: "non-scaling-stroke" }) : node
    )
  );
  return import_react.default.createElement("svg", SVG_COMMON, kids);
}
function resolveLabel(label) {
  if (typeof label === "function") return label();
  return typeof label === "string" ? label : "";
}
function resolvePlace(clientY, rect, current) {
  const mid = rect.top + rect.height / 2;
  const band = rect.height * 0.2;
  if (clientY < mid - band) return "before";
  if (clientY > mid + band) return "after";
  return current ?? (clientY < mid ? "before" : "after");
}
function createSlotPanel(env) {
  const { slots, store, policy, descriptor, readRows, reorder, t } = env;
  const slotKey = descriptor.key;
  const capability = descriptor.capability;
  function SlotPanel() {
    const [, force] = import_react.default.useReducer((value) => value + 1, 0);
    const dragId = import_react.default.useRef(null);
    const [overId, setOverId] = import_react.default.useState(null);
    const [overPlace, setOverPlace] = import_react.default.useState(null);
    const [indicatorY, setIndicatorY] = import_react.default.useState(null);
    const listRef = import_react.default.useRef(null);
    const editingIdRef = import_react.default.useRef(null);
    const [editingId, setEditingId] = import_react.default.useState(null);
    const [draft, setDraft] = import_react.default.useState("");
    import_react.default.useEffect(() => {
      let offSlot = () => {
      };
      let offPolicy = () => {
      };
      try {
        offSlot = slots.subscribe(slotKey, force);
      } catch (error) {
      }
      offPolicy = store.subscribe(force);
      return () => {
        offSlot();
        offPolicy();
      };
    }, []);
    const rows = readRows();
    function clearDragTarget() {
      if (overId !== null || overPlace !== null || indicatorY !== null) {
        setOverId(null);
        setOverPlace(null);
        setIndicatorY(null);
      }
    }
    function startEdit(row) {
      editingIdRef.current = row.id;
      setEditingId(row.id);
      setDraft(row.label);
    }
    function commitEdit(id) {
      if (editingIdRef.current !== id) return;
      editingIdRef.current = null;
      const row = rows.find((r) => r.id === id);
      const value = draft.trim();
      if (row && value !== "" && value !== row.originalLabel) policy.setLabel(id, value);
      else policy.setLabel(id, "");
      setEditingId(null);
      setDraft("");
    }
    function cancelEdit() {
      editingIdRef.current = null;
      setEditingId(null);
      setDraft("");
    }
    function computeIndicatorY(rect, place) {
      const listRect = listRef.current ? listRef.current.getBoundingClientRect() : null;
      if (!listRect) return null;
      return place === "before" ? rect.top - listRect.top - 3 : rect.bottom - listRect.top + 1;
    }
    function handleDragStart(e, id) {
      dragId.current = id;
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
      } catch (error) {
      }
      force();
    }
    function handleDragOver(e, id) {
      if (dragId.current === id) {
        clearDragTarget();
        return;
      }
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = "move";
      } catch (error) {
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const place = resolvePlace(e.clientY, rect, overPlace);
      if (overId !== id) setOverId(id);
      if (overPlace !== place) setOverPlace(place);
      const y = computeIndicatorY(rect, place);
      if (indicatorY !== y) setIndicatorY(y);
    }
    function handleListDragOver(e) {
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = "move";
      } catch (error) {
      }
    }
    function handleListDragLeave(e) {
      if (!e.currentTarget.contains(e.relatedTarget)) clearDragTarget();
    }
    function handleListDrop(e) {
      e.preventDefault();
      const movedId = dragId.current || e.dataTransfer && e.dataTransfer.getData("text/plain");
      const targetId = overId;
      const place = overPlace;
      dragId.current = null;
      clearDragTarget();
      force();
      if (!movedId || !targetId || !place) return;
      reorder(movedId, targetId, place);
    }
    function handleDrop(e, id) {
      e.preventDefault();
      e.stopPropagation();
      const movedId = dragId.current || e.dataTransfer && e.dataTransfer.getData("text/plain");
      dragId.current = null;
      clearDragTarget();
      force();
      if (!movedId || movedId === id) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const place = resolvePlace(e.clientY, rect, overPlace);
      reorder(movedId, id, place);
    }
    function handleDragEnd() {
      dragId.current = null;
      clearDragTarget();
      force();
    }
    function renderRow(row, index) {
      const isOwn = slotKey === SECTION_SLOT && row.id === OWN_ID;
      const editing = editingId === row.id;
      const dragging = !editing && dragId.current === row.id;
      const className = ["dsm-row", dragging ? "dsm-row-dragging" : ""].filter(Boolean).join(" ");
      const prev = rows[index - 1];
      const next = rows[index + 1];
      const labelNode = editing ? import_react.default.createElement("input", {
        className: "dsm-rename-input",
        autoFocus: true,
        value: draft,
        style: styles.renameInput,
        placeholder: t("renamePlaceholder"),
        onChange: (e) => setDraft(e.target.value),
        onBlur: () => commitEdit(row.id),
        onKeyDown: (e) => {
          if (e.key === "Enter") commitEdit(row.id);
          else if (e.key === "Escape") cancelEdit();
        }
      }) : import_react.default.createElement("span", { style: styles.label }, row.label);
      return import_react.default.createElement(
        "li",
        {
          key: row.id,
          // A slot whose registrants declare no `label` (e.g. footer actions)
          // has nothing to rename, so the row is not draggable-independent but
          // simply not renamable — see the action cluster below.
          draggable: capability.order && !editing,
          className,
          style: styles.row,
          onDragStart: (e) => handleDragStart(e, row.id),
          onDragOver: (e) => handleDragOver(e, row.id),
          onDrop: (e) => handleDrop(e, row.id),
          onDragEnd: handleDragEnd
        },
        import_react.default.createElement("span", { className: "dsm-row-grip", style: styles.grip, title: t("dragHint") }, svgIcon("grip")),
        import_react.default.createElement(
          "div",
          { style: styles.rowMain },
          import_react.default.createElement(
            "span",
            { style: styles.labelLine },
            labelNode,
            row.hidden ? import_react.default.createElement("span", { style: styles.tag }, t("hiddenTag")) : null
          ),
          import_react.default.createElement(
            "span",
            { style: styles.meta },
            `${row.id}${row.registrant ? " \xB7 " + row.registrant : ""}`
          )
        ),
        capability.hide ? import_react.default.createElement(
          "button",
          {
            type: "button",
            className: "dsm-switch",
            role: "switch",
            "aria-checked": !row.hidden,
            disabled: isOwn,
            title: isOwn ? t("selfNote") : row.hidden ? t("show") : t("hide"),
            onClick: () => policy.setHidden(row.id, !row.hidden),
            style: {
              ...styles.switchTrack,
              ...row.hidden ? {} : { background: "var(--dsw-alias-state-success-primary)" }
            }
          },
          import_react.default.createElement("span", {
            className: "dsm-switch-knob",
            style: {
              ...styles.switchKnob,
              transform: row.hidden ? "translateX(0)" : "translateX(14px)"
            }
          })
        ) : null,
        import_react.default.createElement(
          "div",
          { style: styles.rowActions },
          // Reorder arrows are only meaningful when a consumer sorts by order —
          // every managed slot today does, so the capability gates the whole
          // cluster rather than each button.
          capability.order ? import_react.default.createElement(
            "button",
            {
              type: "button",
              className: "dsm-icon-btn",
              title: t("moveUp"),
              "aria-label": t("moveUp"),
              style: styles.iconBtn,
              disabled: prev === void 0,
              onClick: () => reorder(row.id, prev.id, "before")
            },
            svgIcon("up")
          ) : null,
          capability.order ? import_react.default.createElement(
            "button",
            {
              type: "button",
              className: "dsm-icon-btn",
              title: t("moveDown"),
              "aria-label": t("moveDown"),
              style: styles.iconBtn,
              disabled: next === void 0,
              onClick: () => reorder(row.id, next.id, "after")
            },
            svgIcon("down")
          ) : null,
          // Rename is suppressed entirely (not merely disabled) for slots whose
          // registrants declare no `label`: there is no projected text to edit,
          // so offering the control would be a dead end.
          capability.rename ? import_react.default.createElement(
            "button",
            {
              type: "button",
              className: "dsm-icon-btn",
              title: t("rename"),
              "aria-label": t("rename"),
              style: styles.iconBtn,
              disabled: editing,
              onClick: () => startEdit(row)
            },
            svgIcon("pencil")
          ) : null,
          import_react.default.createElement(
            "button",
            {
              type: "button",
              className: "dsm-icon-btn",
              title: t("reset"),
              "aria-label": t("reset"),
              style: styles.iconBtn,
              onClick: () => policy.reset(row.id)
            },
            svgIcon("reset")
          )
        )
      );
    }
    const header = import_react.default.createElement(
      "div",
      { style: styles.header },
      import_react.default.createElement(
        "div",
        { style: styles.slotHeading },
        import_react.default.createElement("span", { style: styles.slotNav }, t(navKeyFor(slotKey))),
        import_react.default.createElement("span", { style: styles.slotCount }, String(rows.length))
      ),
      import_react.default.createElement(
        "button",
        {
          type: "button",
          className: "dsm-reset-slot",
          onClick: () => policy.resetAll(),
          style: styles.resetAllBtn,
          title: t("resetSlot")
        },
        svgIcon("reset"),
        import_react.default.createElement("span", null, t("resetSlot"))
      )
    );
    const body = rows.length === 0 ? import_react.default.createElement("p", { style: styles.empty }, t("empty")) : import_react.default.createElement(
      "ul",
      {
        ref: listRef,
        style: styles.list,
        onDragOver: handleListDragOver,
        onDragLeave: handleListDragLeave,
        onDrop: handleListDrop
      },
      // Single insertion indicator, positioned in the row gap; persists
      // across the gaps so it never blinks while dragging.
      indicatorY !== null ? import_react.default.createElement("div", { className: "dsm-drop-indicator", style: { top: indicatorY } }) : null,
      rows.map((row, index) => renderRow(row, index))
    );
    return import_react.default.createElement("div", { style: styles.wrap }, header, body);
  }
  return SlotPanel;
}
function createManagerSection(env) {
  const { slots, store, readRows, reorder, t } = env;
  const panels = /* @__PURE__ */ new Map();
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
        t
      })
    );
  }
  function ManagerSection() {
    const [, force] = import_react.default.useReducer((value) => value + 1, 0);
    import_react.default.useEffect(() => {
      const offs = [];
      for (const descriptor of MANAGED_SLOTS) {
        try {
          offs.push(slots.subscribe(descriptor.key, force));
        } catch (error) {
        }
      }
      const offPolicy = store.subscribe(force);
      return () => {
        for (const off of offs) off();
        offPolicy();
      };
    }, []);
    const children = [
      import_react.default.createElement(
        "div",
        { style: styles.header },
        import_react.default.createElement("p", { style: styles.hint }, t("hint")),
        import_react.default.createElement(
          "button",
          {
            type: "button",
            className: "dsm-reset-all",
            onClick: () => {
              for (const descriptor of MANAGED_SLOTS) store.forSlot(descriptor.key).resetAll();
            },
            style: styles.resetAllBtn,
            title: t("resetAll")
          },
          svgIcon("reset"),
          import_react.default.createElement("span", null, t("resetAll"))
        )
      )
    ];
    for (const group of SLOT_GROUPS) {
      const descriptors = MANAGED_SLOTS.filter((slot) => slot.group === group.id);
      if (descriptors.length === 0) continue;
      children.push(
        import_react.default.createElement("h3", { key: `group-${group.id}`, style: styles.groupHeading }, t(group.navKey))
      );
      for (const descriptor of descriptors) {
        const Panel = panels.get(descriptor.key);
        if (Panel === void 0) continue;
        children.push(
          import_react.default.createElement(
            "section",
            // `data-slot` lets tests (and anyone inspecting the DOM) address one
            // slot's list without relying on row order across groups.
            { key: descriptor.key, "data-slot": descriptor.key, style: styles.slotBlock },
            import_react.default.createElement("p", { style: styles.slotHint }, t(hintKeyFor(descriptor.key))),
            import_react.default.createElement(Panel)
          )
        );
      }
    }
    return import_react.default.createElement("div", { style: styles.wrap }, children);
  }
  return ManagerSection;
}
function globals() {
  return globalThis;
}
var name = "dsh-slots-manager";
var inject = ["slots", "locale", "remote", "remote.settings"];
function apply(ctx) {
  const slots = ctx.get("slots");
  if (slots === void 0) return;
  const remote = ctx.get("remote");
  const locale = ctx.get("locale");
  if (locale !== void 0) {
    ctx.effect(
      () => {
        locale.register(LOCALE_NS, { zh, en });
        return () => {
        };
      },
      "dsh-slots-manager: dictionaries"
    );
  }
  const t = locale !== void 0 ? locale.bind(LOCALE_NS) : (key) => key;
  ctx.effect(() => insertStyles(NAV_SCROLL_CSS + "\n" + PANEL_CSS), "dsh-slots-manager: styles");
  const settings = remote && remote.settings ? remote.settings : void 0;
  const persist = settings ? (doc) => {
    void settings.replace(SECTION_NS, doc, void 0).catch(() => {
    });
  } : () => {
  };
  const store = createPolicyStore(persist);
  const patch = installPatches(ctx, store);
  if (!patch.installed) return;
  store.setOnChanged(patch.bump);
  patch.bump();
  if (settings) {
    void settings.describe().then((response) => {
      if (!response.ok) return;
      const ns = response.value.namespaces.find((row) => row.ns === SECTION_NS);
      if (ns) store.load(ns.value);
    }).catch(() => {
    });
  }
  const readRows = (slot) => {
    let entries;
    try {
      entries = patch.origEntries.call(slots, slot);
    } catch (error) {
      entries = [];
    }
    const view = store.forSlot(slot);
    return entries.map((entry, seq) => {
      const originalLabel = resolveLabel(entry.options.label) || entry.options.id;
      return {
        id: entry.options.id,
        label: view.labelFor(entry.options.id) ?? originalLabel,
        originalLabel,
        registrant: entry.options.registrant,
        order: view.effectiveOrder(entry.options.id, entry.options.order),
        hidden: view.isHidden(entry.options.id),
        seq
      };
    }).sort((a, b) => a.order - b.order || a.seq - b.seq);
  };
  const reorder = (slot, movedId, targetId, place) => {
    const rows = readRows(slot);
    const src = rows.findIndex((row) => row.id === movedId);
    if (src === -1) return;
    const list = rows.map((row) => row.id);
    list.splice(src, 1);
    let ins = list.indexOf(targetId);
    if (ins === -1) return;
    if (place === "after") ins += 1;
    list.splice(ins, 0, movedId);
    const orders = {};
    list.forEach((id, index) => {
      orders[id] = index * 10;
    });
    store.forSlot(slot).setOrders(orders);
  };
  const env = { slots, store, readRows, reorder, t };
  const ManagerSection = createManagerSection(env);
  slots.inject(
    SECTION_SLOT,
    () => slots.register(
      {
        name: SECTION_SLOT,
        id: OWN_ID,
        order: OWN_ORDER,
        label: () => t("nav"),
        locale: LOCALE_NS
      },
      () => import_react.default.createElement(ManagerSection)
    )
  );
  slots.inject(
    BUNDLE_CONFIG_SLOT,
    () => slots.register(
      {
        name: BUNDLE_CONFIG_SLOT,
        key: BUNDLE_KEY,
        locale: LOCALE_NS
      },
      () => import_react.default.createElement(ManagerSection)
    )
  );
  if (globals().__DSH_SLOTS_MANAGER_TEST__) {
    const bound = store.forSlot(SECTION_SLOT);
    const seam = {
      store,
      policy: bound,
      readSections: () => readRows(SECTION_SLOT),
      reorder: (movedId, targetId, place) => reorder(SECTION_SLOT, movedId, targetId, place),
      setOrders: bound.setOrders,
      resetAll: bound.resetAll,
      policyFor: (slot) => store.forSlot(slot),
      descriptors: MANAGED_SLOTS,
      patch,
      inventory: patch.inventory.get(SECTION_SLOT) ?? /* @__PURE__ */ new Map()
    };
    globals().__DSH_SLOTS_MANAGER_SEAM__ = seam;
  }
}

    return module.exports
  },
});
