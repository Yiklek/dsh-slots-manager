# dsh-slots-manager 设计方案

> 状态：**待评审**（尚未开始实现）
> 范围：管理 `settings.section`、`sidebar.panellist`、`sidebar.footer.action` 三个槽位
> 从 `dsh-settings-manager` 的 main 派生，继承其 30 个提交的历史

---

## 1. 背景

### 1.1 为什么另起一个插件

`dsh-settings-manager` 做的是**设置分区编排**：拦截客户端槽位注册，让用户能隐藏 / 排序 / 改名
「全局设置」导航里的分区。它的技术内核本来就是**通用的**——三个原型补丁作用于 `SlotRegistry`，
不认识任何具体槽位；是策略 API 与 UI 把范围写死在 `settings.section` 上。

现在的诉求超出单一槽位：**还要管理左侧边栏的按钮**。三者是同一机制、同一种交互，只是作用对象不同。
与其在设置管理器里塞进第二个管理器，不如提升为**槽位管理器**。

### 1.2 这是一个新插件

**不做任何兼容。** 新的包名、新的插件 id、新的 settings 命名空间、新的 locale 命名空间，
从零开始。不与 `dsh-settings-manager` 共存，也不读取它留下的任何数据。

由此带来的简化：

```text
无数据迁移（无 migrate 函数）
无遗留命名空间读取
无"更名"（是初次命名，不是改名）
无"旧入口保留"决策
```

### 1.3 要解决的三个问题

| # | 问题 | 用户视角 |
|---|---|---|
| 1 | **管理设置分区** | 隐藏不用的设置分区、调整顺序、改显示名 |
| 2 | **管理左侧栏的面板图标** | 隐藏不用的面板图标、调整顺序、改 tooltip |
| 3 | **管理左侧栏底部的动作** | 隐藏、调整顺序（**不支持改名**，见 §2.4） |

### 1.4 本次范围

**三个槽位**：

| 槽位 | kind | 隐藏 | 排序 | 改名 |
|---|---|---|---|---|
| `settings.section` | list | ✅ | ✅ | ✅ |
| `sidebar.panellist` | list | ✅ | ✅ | ✅ |
| `sidebar.footer.action` | list | ✅ | ✅ | **❌** |

三者都是 `scope: 'root'`（全应用注册一次）—— 策略文档一个槽位只存**一份**排布，
这只有对全局槽位才成立；compat 自检会断言上游仍是 root。

**架构保持"加一行就能支持新槽位"**——见 §4.1。

明确**不在本次范围**：

```text
settings.general.item / settings.plugins.tab / settings.action / settings.models.footer
sidebar.session.row.* / sidebar.workspaces.*
conversation.*                              （session 作用域，另有未知项）
plugins.*                                   （属于插件页自身内容）
conversation.view                           （list 但一次只渲染一个）
shell.overlay                               （框架级浮层）
全部 single / keyed / chain                  （语义不是"排列"）
root / main / sidebar / conversation.session*（应用骨架）
```

---

## 2. 上游契约（权威依据）

所有结论都核对过已装 DSH 的源码与类型声明。本机版本 **DSH 0.2.1-alpha.1**。

### 2.1 补丁目标：`SlotRegistry` 的三个原型方法

```text
dsh-client-ui-renderer/lib/client.js:1788   SlotRegistry.prototype.register = function register(…)
                                      :1517   entries(key)
                                      :1529   entriesOfSlot(key)
                                      :1343   inject(key, callback)
                                      :1566   subscribe(key, fn)
                                      :1574   getVersion(key)
```

> ⚠️ **注意形态**：`register` 通过**原型赋值**提供，不在 class 体内；`entries` / `entriesOfSlot`
> 在 class 体内。同一个类两种风格混用。探测必须是 `typeof proto.register === 'function'`，
> **不能按源码结构搜索**（本人已因此误判过一次，见 §6）。

### 2.2 `settings.section`

出处 `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts:62-77`：

```ts
/**
 * One settings page per list entry. Registrant options carry the nav identity:
 * `id` (section key, drives `only` filtering), `order` (nav position), `label`
 * (registrant-localized display text …). Sections render inside the panel content column.
 */
'settings.section': { kind: 'list'; scope: 'root'; owner: SettingsSectionOwnerProps };
```

```ts
interface SettingsSectionOwnerProps { close: () => void }
```

### 2.3 `sidebar.panellist`

出处 `dsh-client-ui-sidebar/lib/types/client/contract/slots.d.ts`：

```ts
/**
 * Global panel icons. Each list id addresses the matching main panel;
 * the sidebar owns the button and resolves its label from list metadata.
 */
'sidebar.panellist': { kind: 'list'; scope: 'root'; owner: SidebarPanelIconOwnerProps };

/** Icon presentation supplied by the global panel row. */
interface SidebarPanelIconOwnerProps { size: number; active: boolean }

/** Serializable metadata for one active global panel list registration. */
interface SidebarPanelMetadata {
  id: MainPanelId;   // List id and matching main panel key
  order: number;     // Ascending row order; ties retain registration order
  label: string;     // Row title and accessible name: resolved label, or the id when omitted
}
```

真实注册样例（`dsh-client-ui-plugin-manager/lib/client.js`，面板 id 就是 `plugins`）：

```js
ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
  name: "sidebar.panellist", id: PANEL_ID, order: 0, label: () => t("panel"), locale: NS,
}, PluginsPanelIcon));
```

**形状与 `settings.section` 完全一致**（`{name, id, order, label, locale}` + 组件）。

其余消费者：`dsh-client-ui-schedule`、`dsh-client-ui-sidebar`。

### 2.4 `sidebar.footer.action`

出处同上文件：

```ts
/**
 * Optional actions beside Settings at the sidebar foot. Declared by this
 * package's 'sidebar' entry; each action receives only the column state.
 */
'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: SidebarFooterActionOwnerProps };

/** Owner share of an action rendered beside Settings at the sidebar foot. */
interface SidebarFooterActionOwnerProps { wide: boolean }
```

真实注册样例（本 profile 的 `dsh-context`，即界面上那个「上下文洞察」）：

```js
ctx.slots.inject("sidebar.footer.action", () => {
  return ctx.slots.register({
    name: "sidebar.footer.action",
    id: "context-overview",
    order: 10,
    locale: NS,                 // ← 注意：没有 label
  }, (props) => React.createElement(OverviewButton, props));
});
```

**⚠️ 这个槽位的注册项不声明 `label`**——按钮文案由组件自己取（`ov.entry` = `"上下文洞察"`）。
渲染器也从不读 `options.label`（`dsh-client-ui-renderer/lib/client.js` 里
`options.label` / `resolveSlotLabel` 出现 **0 次**）。

**结论：改名在这个槽位上语义不成立**，不是"效果不明显"。

> 附带观察：`dsh-context` 自己已有 `settings.placement`（标签页 / 侧边栏 / 全部）与
> `settings.insightsEntry`（显示 / 隐藏），其 `OverviewButton` 在 hide 时 `return null`。
> 也就是说对这个具体占用者，"隐藏"存在两条路：插件自带的（组件返回 null，注册项仍在）
> 与本插件的（注册项从槽位移除）。两者不冲突；本插件的价值在于**统一位置**，
> 以及**一旦有第二个插件占用该槽位时，排序是唯一手段**（插件自带设置管不了别人的顺序）。

### 2.5 三个槽位的读路径（决定补丁打在哪）

| 槽位 | 谁读 | 走的路径 | 从 `options` 取什么 |
|---|---|---|---|
| `settings.section` | 外壳（导航） | **`entries`** | `order`、`label` |
| | 渲染器（内容） | `entriesOfSlot` | `component`（不取 order/label） |
| `sidebar.panellist` | **侧边栏自己**（`syncPanels`） | **`entriesOfSlot`** | **`order`、`label`** |
| `sidebar.footer.action` | **渲染器**（`renderSlot`） | **`entriesOfSlot`** | **`order`**（不取 label） |

依据（`dsh-client-ui-sidebar/lib/client.js`）：

```js
// sidebar.panellist —— 侧边栏自己读 order 与 label
const syncPanels = () => {
  const next = ctx.slots.entriesOfSlot("sidebar.panellist").map(({ options }) => ({
    id: options.id,
    order: options.order ?? 0,
    label: resolveSlotLabel(options.label) ?? id,
  })).sort((a, b) => a.order - b.order);
  …
};
ctx.effect(() => ctx.slots.subscribe("sidebar.panellist", syncPanels), "ui-sidebar: panel entries");
```

```jsx
// sidebar.footer.action —— 交给渲染器
<div className={SidebarRoot_module_css_default.footerActions}>
  {renderSlot("sidebar.footer.action", { wide })}
</div>
```

渲染器**确实按 order 排序**（`dsh-client-ui-renderer/lib/client.js:1193`）：

```js
let list = [...rows].sort((a, b) => a.order - b.order);
```

### 2.6 ⚠️ `isLive` 约束：`entriesOfSlot` 不能返回克隆对象

```js
// dsh-client-ui-slots/lib/index.js
isLive(entry) {
  for (const rec of this.records.values()) if (rec.entries.includes(entry)) return true;
  return false;
}
```

`isLive` 比的是**对象身份**。`entriesOfSlot` 返回的是注册表里的**同一批对象**
（`heads.push(entry)`，不克隆），而渲染器会拿返回的 entry 去调 `isLive`：

```js
if (!host.isLive(entry)) throw new StaleAuthorizationError(`renderSlot('${key}') from a disposed registration`);
```

**所以在这个路径上克隆 entry 会直接抛错。** 这与 `entries` 路径不同——那里没有该检查，
现有实现正是在 `entries` 里克隆的。

### 2.7 恢复路径是安全的

「Settings」入口位于 **`sidebar.settings`**（single），**不是** `sidebar.panellist`：

```text
'sidebar.settings':       'The settings seat at the sidebar foot.'   ← ui-settings-general 占据
'sidebar.panellist':      'Global panel icons.'                       ← 管理对象
'sidebar.footer.action':  'Optional actions beside Settings…'         ← 管理对象
```

因此**即使把全部面板图标与底栏动作都隐藏，Settings 入口仍在**，用户能进设置找到本插件并恢复。
这是「隐藏」功能可以放心提供的前提。

> 同理：本插件自己的 `settings.section` 条目必须**永不可隐藏**，否则用户把自己锁在外面。

### 2.8 上游全部槽位分布（供将来扩展参考）

从 `dsh-cordis-client-runner` 内置的槽位目录解析出的 **92 个槽位**：

```text
按 kind :  list 35 | single 39 | keyed 15 | chain 3
按 scope:  root 44 | session 43 | session-maybe 5
replaceRisk 标注 shadows-shipped-ui 的 9 个（全是 single）
```

| kind | 隐藏 | 排序 | 改名 | 说明 |
|---|---|---|---|---|
| **list** | ✅ | ✅ | ✅ | 现有模型直接适用 |
| single | ⚠️ 等价移除唯一实现 | ❌ | ⚠️ | 需要"禁用/替换"语义，另立设计 |
| keyed | ❌ | ❌ | ❌ | 语义是按 key 路由 |
| chain | ❌ | ❌ | ❌ | 中间件链，碰了破坏路由 |

**kind 不是唯一判据**：`conversation.view` 是 list 但"一次只渲染一个"，隐藏当前生效的会让主区域空白。

---

## 3. 现有实现分析（继承什么 / 改什么）

### 3.1 继承的资产

| 资产 | 状态 |
|---|---|
| 三处 `SlotRegistry.prototype` 补丁 | ✅ 机制通用，直接复用，仅需加槽位维度 |
| "只观察不覆写"的设计（reset 永远可恢复） | ✅ 保持 |
| 策略经 DSH 标准 settings 命名空间持久化 | ✅ 保持 |
| 导航滚动 CSS、窄屏适配、i18n 骨架 | ✅ 保持 |
| 测试基础设施（`tests/helpers/mock-slots.mjs`） | ✅ 保持 |
| `docs/non-loopback-persistence.md` | ✅ 一并继承（新插件同样需要） |

### 3.2 实测基线（改动前的现状，作为回归对照）

```text
src/client.ts   1165 行
src/host.ts       43 行
pnpm typecheck    干净
pnpm test         36/36 通过
lib/client.js     与已装到 profile 的产物逐字节一致
```

### 3.3 必须改的三处

```text
① src/client.ts:52   const SECTION_SLOT = 'settings.section'    ← 单槽位常量
② src/client.ts:284  createPolicy(persist)                       ← 策略是扁平 id→值
③ src/host.ts:29     policySchema { hidden, order, labels }      ← 持久化结构是扁平的
```

---

## 4. 架构设计

### 4.1 槽位描述表（唯一需要维护的地方）

`src/slots.ts`（新增）：

```ts
export interface SlotDescriptor {
  /** 槽位 key，与 DSH 契约里的名字一致 */
  key: string
  /** UI 分组 */
  group: 'settings' | 'sidebar'
  /** 中文显示名 */
  nav: string
  /** 该槽位是干什么的，显示在 UI 提示里 */
  hint: string
  /** 允许的操作。由 §2.5 的读路径与 §2.4 的 label 可得性决定 */
  capability: { hide: boolean; order: boolean; rename: boolean }
}

export const MANAGED_SLOTS: readonly SlotDescriptor[] = [
  {
    key: 'settings.section',
    group: 'settings',
    nav: '设置分区',
    hint: '设置对话框左侧导航里的分区',
    capability: { hide: true, order: true, rename: true },
  },
  {
    key: 'sidebar.panellist',
    group: 'sidebar',
    nav: '面板按钮',
    hint: '左侧栏的图标按钮；隐藏后该面板将失去入口',
    capability: { hide: true, order: true, rename: true },
  },
  {
    key: 'sidebar.footer.action',
    group: 'sidebar',
    nav: '栏底动作',
    hint: 'Settings 旁边的底栏动作',
    // 该槽位的注册项不声明 label，渲染器也不读 label —— 改名无意义（§2.4）
    capability: { hide: true, order: true, rename: false },
  },
]

export const MANAGED_KEYS: ReadonlySet<string> = new Set(MANAGED_SLOTS.map((s) => s.key))
```

**扩范围 = 加一行。** 不改逻辑、不改 UI 结构（UI 按 `group` 渲染、按 `capability` 决定显示哪些操作）。

### 4.2 策略数据模型

策略**从一开始就按槽位分组**：

```ts
interface SlotPolicy {
  hidden: Record<string, boolean>   // id → 是否隐藏
  order: Record<string, number>     // id → 覆盖后的顺序
  labels: Record<string, string>    // id → 覆盖后的显示名
}
interface PolicyDoc {
  version: 1
  slots: Record<string, SlotPolicy>  // 槽位 key → 该槽位的策略
}
```

**为什么必须分组**：三个槽位的 id 命名空间独立。若用扁平结构，一个叫 `plugins` 的设置分区 id
会与 `sidebar.panellist` 里的 `plugins` 面板 id 互相污染——而后者确实存在
（`dsh-client-ui-plugin-manager` 用的面板 id 就是 `plugins`）。

`version` 字段是为**将来**结构演进而留，本次不涉及迁移（新插件，无历史数据）。

`Policy` 接口每个方法带 `slot` 首参：

```ts
isHidden(slot, id) / orderFor(slot, id) / labelFor(slot, id)
effectiveOrder(slot, id, registered?) / applyToRead(slot, options)
setHidden(slot, id, v) / setOrders(slot, orders) / setLabel(slot, id, v)
reset(slot, id) / resetAll(slot?)
subscribe(fn) / setOnChanged(fn) / load(doc)
```

### 4.3 补丁泛化

拦截点**数量仍然是三个**，每个多一个槽位维度。

```ts
// 每个纳管槽位一张 inventory；登记时记录【原值】，供 reset 还原
const inventory = new Map<string, Map<string, InvRow>>()
for (const s of MANAGED_SLOTS) inventory.set(s.key, new Map())

// ① 注册路径：只观察，不改写
proto.register = function register(rawOptions, component) {
  const slot = rawOptions?.name
  if (typeof slot === 'string' && MANAGED_KEYS.has(slot) && typeof rawOptions.id === 'string') {
    inventory.get(slot)!.set(rawOptions.id, {
      id: rawOptions.id,
      order: typeof rawOptions.order === 'number' ? rawOptions.order : 0,
      label: rawOptions.label,
      priority: typeof rawOptions.priority === 'number' ? rawOptions.priority : 0,
      registrant: rawOptions.registrant,
    })
  }
  return origRegister.call(this, rawOptions, component)
}
```

#### ② `entries` 路径：保持现有**克隆**写法

```ts
proto.entries = function entries(key) {
  const rows = origEntries.call(this, key)
  if (!MANAGED_KEYS.has(key)) return rows
  const p = policyHolder.current
  const out: StoredEntry[] = []
  for (const entry of rows) {
    if (p.isHidden(key, entry.options.id)) continue
    const order = p.orderFor(key, entry.options.id)
    const label = p.labelFor(key, entry.options.id)
    if (order === undefined && label === undefined) { out.push(entry); continue }
    out.push({ ...entry, options: p.applyToRead(key, entry.options) })   // 克隆
  }
  return out
}
```

该路径无 `isLive` 检查，克隆是安全的；**这也是 `settings.section` 现有行为，必须逐字节保持**（回归红线）。

#### ③ `entriesOfSlot` 路径：**过滤 + 原地替换 `options` 引用**

这是本次的关键改动。因为：

- 侧边栏与渲染器都从这条路径取 `order`（侧边栏还取 `label`）
- 而这条路径**不能克隆**（§2.6 的 `isLive` 身份检查）

所以改为**换 `entry.options` 的引用、保持 `entry` 本身身份不变**：

```ts
proto.entriesOfSlot = function entriesOfSlot(key) {
  const rows = origEntriesOfSlot.call(this, key)
  if (!MANAGED_KEYS.has(key)) return rows
  const p = policyHolder.current
  const originals = inventory.get(key)!
  const out: StoredEntry[] = []
  for (const entry of rows) {
    const id = entry.options.id
    if (p.isHidden(key, id)) continue
    const o = originals.get(id)
    // 始终写"生效值"：有覆盖用覆盖，否则回原值 → reset 天然还原
    entry.options = {
      ...entry.options,
      order: p.orderFor(key, id) ?? o?.order ?? 0,
      label: p.labelFor(key, id) ?? o?.label,
    }
    out.push(entry)          // ← entry 身份不变，isLive 通过
  }
  return out
}
```

要点：

| 设计点 | 理由 |
|---|---|
| 换的是 `entry.options` **引用**，不是 `entry` | `isLive` 只查 entry 身份 |
| 原 `options` 对象不被就地修改 | 万一别处持有它，仍是干净的原值 |
| **始终**写生效值（而非"有覆盖才写"） | `reset` 后自动回退到原值，无需额外还原逻辑 |
| 单次调用幂等 | 每次都从 inventory 的原值重算，可重复调用 |

`sidebar.footer.action` 的注册项没有 `label`，写进去的 `label: undefined` 无人读取，无害。

#### ④ 策略变更后的 bump（沿用现有做法）

注册一个临时条目并立即注销，触发槽位版本变化，外壳随即重读。现有实现的 `patch.bump()` 可复用，
仅需把 `SECTION_SLOT` 换成"任一纳管槽位"（用 `settings.section` 即可，它是纳管的）。

**对非纳管槽位必须逐字节返回原数组** —— 回归红线。

### 4.4 新的命名空间与持久化机制

```text
包名              dsh-slots-manager
插件 id（host/client）  'dsh-slots-manager'
cordis.patch.yml  entry id: slots-manager
settings 命名空间  'slots-manager'      ← 持久化目标（= 条目 id）
locale 命名空间    'slotsManager'
```

> ### ⚠️ 实现期修正：`settings.register` 已经不存在了
>
> 本文档最初假定 host 半区用 `ctx.settings.register(ns, schema)` 注册命名空间。
> **实测发现现代 DSH 的 settings 服务没有 `register` 方法**（方法只有 `configure` /
> `describe` / `invalidate` / `prepareDocument` / `schema` / `validatePaths`）。它按 `ns`
> 在 profile 的**可配置插件条目**里查：
>
> ```js
> // dsh-settings/lib/index.js
> const entry = this.ownerContext.configEditor.entries().find((row) => row.options.id === ns)
> const schema = entry === void 0 ? void 0 : this.schema(entry)   // entry.fiber.runtime.Config
> if (entry === void 0 || schema === void 0) throw new Error(`No configurable plugin entry "${ns}"`)
> ```
>
> 也就是说：**命名空间 id = 插件条目 id，schema = 该条目的 `Config`，可编辑字段用
> `meta.volatile` 标记**。`describe()` 返回的那串名字（`agent-default-model`、
> `bash-sandbox`…）全都是插件条目 id。
>
> 旧写法会抛 `TypeError`（被 cordis 的 inject 机制吞掉），于是命名空间从未注册、
> **每一次 `settings/replace` 都被服务端拒绝**（`settings/rejected`）——而且客户端用
> `.catch(() => {})` 吞掉了错误，所以只在"刷新后配置丢失"时才表现为症状。
> **这是继承自 `dsh-settings-manager` 的既有缺陷，不是本次重构引入的。**

因此 `src/host.ts` 改为导出 `Config`：

```ts
const slotPolicySchema = Schema.object({
  hidden: Schema.dict(Schema.boolean()).default({}),
  order: Schema.dict(Schema.number()).default({}),
  labels: Schema.dict(Schema.string()).default({}),
})

const configSchema = Schema.object({
  version: Schema.number().default(1),
  slots: Schema.dict(slotPolicySchema).default({}),
})

// 整份文档 volatile：插件的全部配置就是这份策略。
// 不用 `.volatile()`（只存在于 DSH 打补丁后的 schemastery 原型上，且本包类型里没有），
// 也不用 `extra('volatile', …)`（该包的类型把 key 收窄了），直接写 meta。
;(configSchema.meta as unknown as Record<string, unknown>).volatile = true

export const Config = configSchema
export const name = 'dsh-slots-manager'
export function apply(ctx: Context): void {
  // 无事可做：只要条目带着 Config 挂载，`slots-manager` 就是可配置的 settings 命名空间。
  void ctx
}
```

客户端**不需要改文档形状**：根节点即 volatile，`describe()` 的 `value` 就是策略文档本身。

---

## 5. UI 设计

### 5.1 分组渲染

由 `descriptor.group` 驱动；每行显示名取自 `descriptor.nav`：

```text
┌─ 设置页 ─────────────────────────────┐
│  设置分区      5 项                   │
├─ 左侧边栏 ───────────────────────────┤
│  面板按钮      1 项                   │
│  栏底动作      1 项                   │
└──────────────────────────────────────┘
```

每组内复用现有行控件：**隐藏 / 上移 / 下移 / 拖拽 / 改名 / 重置**，以及每槽位的「重置本槽位」。

每个槽位面板的 `<section>` 带 `data-slot="<key>"`，因此可以单独定位某个槽位的列表，而不必依赖跨分组的行序号。

**全局只有一处「全部重置」**（`.dsm-reset-all`，在管理面板头部，重置所有槽位）；每个槽位另有一个 `.dsm-reset-slot`。两者用不同类名是刻意的：测试与选择器都依赖 `.dsm-reset-all` 唯一。

> **拖拽与面板高度**：面板变高后，「把头一行拖到最后一行」这种**跨整个面板**的合成指针移动会让 HTML5 拖拽中途丢失（浏览器停止派发 `dragover`，指示线不再出现）。实测这是**合成事件驱动的固有局限，不是组件缺陷**——短距离与中距离拖拽正常，**包括终点落在同一最后一行**的拖拽也正常，只有最长距离那一次失败。测试因此把拖拽目标限定在可靠距离内。

### 5.2 按 `capability` 抑制操作

```text
rename === false  →  不渲染改名的铅笔按钮，也不进入行内编辑
order  === false  →  不渲染上移/下移/抓手
hide   === false  →  不渲染隐藏开关
```

本次只有一处生效：`sidebar.footer.action` 的**改名**。UI 上直接不显示该按钮，
而不是显示后禁用——避免用户以为"点了没用"。

### 5.3 两个入口

| 入口 | 槽位 | 说明 |
|---|---|---|
| 设置导航里的「插槽编排」 | `settings.section`（本插件自己的分区） | 永不可隐藏 |
| **左侧栏「插件」页 → 本插件详情页** | `plugins.bundle.config`（keyed，key = 包名） | 与 `dsh-mnemon` / `dsh-context` 同一位置 |

> **实现期修正：不是设置里的「内置插件」页**
>
> 一开始把第二个入口做成了 `settings.plugins.tab`，也就是**设置对话框 → 内置插件**里的一个标签页。
> **那是错的。** 用户要的是**左侧栏「插件」面板**（点左侧栏插件图标打开的那个页面）里、
> 自己插件的详情页上的配置区 —— 与 `dsh-mnemon`、`dsh-context` 一致。
>
> 正确槽位是 **`plugins.bundle.config`**：
>
> ```ts
> /**
>  * A bundle's own configuration, keyed by the bundle's package name and
>  * rendered on the bundle's page between its description and its rows
>  * (`view: 'page'` only).
>  */
> 'plugins.bundle.config': { kind: 'keyed'; scope: 'root'; owner: PluginConfigViewProps };
> ```
>
> 它是 **keyed** 槽位，注册用 `key`（不是 `id`），值就是**本插件的包名** —— 那是把贡献路由到
> 自己那一页的依据。参考实现：
>
> ```js
> // dsh-context
> ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
>   name: 'plugins.bundle.config', key: 'dsh-context', locale: ns, inject: c,
> }, (props) => React.createElement(Card, props)))
> ```
>
> 验证方式：详情页出现与 `dsh-context` 同样的配置区（`dsh-context` 有，加之前我们没有）。
>
> 该槽位**不受管理**（它是进入管理器的门，不是被编排的对象），补丁会跳过它。

### 5.4 侧边栏隐藏的提示文案

契约原文："Each list id addresses the matching main panel"。隐藏面板图标的确切效果需由
**P0 探针**确定（见 §8 R1），UI 提示随之二选一：

```text
若只是入口消失   →  '隐藏这个图标后，仍可通过其他方式打开该面板'
若面板也不可达   →  '隐藏这个图标等同于关闭该面板'
```

**探明之前不写死文案**，`hint` 先留占位。

`sidebar.footer.action` 的 hint 额外提一句它可能有插件自带的开关：

```text
'部分动作在提供它的插件里也有自己的显示开关'
```

### 5.5 i18n

新建 `slotsManager` 命名空间：

```text
nav                    '插槽编排'
groupSettings          '设置页'
groupSidebar           '左侧边栏'
slotSettingsSection    '设置分区'
slotSidebarPanellist   '面板按钮'
slotSidebarFooterAction '栏底动作'
slotHint.*             各槽位的一句说明
emptyGroup             '该槽位暂无注册项'
selfNote               '本分区由 dsh-slots-manager 提供，不可隐藏。'
```

---

## 6. 兼容性自检（安全网）

插件的三处补丁与每个槽位的 kind 都依赖上游契约。上游一改，插件会**静默失效**
（本次核查已差点误判一次，见 §2.1 的警告）。因此新增 `tests/unit/compat.test.mjs`，
从已装 DSH 读取槽位目录（`dsh-cordis-client-runner` 打包的那份 JSON），断言三件事：

```text
1) MANAGED_SLOTS 里每个 key 都存在、kind === 'list'、scope === 'root'
   （scope 断言字面量：策略文档一个槽位只存一份排布，这只有对全局槽位才成立）
2) SlotRegistry 仍暴露被补丁的三个方法
   —— `register` 是类体外的原型赋值，`entries` / `entriesOfSlot` 是类成员，
      两种模式都要匹配（这正是当初误判的坑）
3) settings.section 仍在目录里（本插件自己的分区挂在它上面）
```

**isLive 身份契约**（`entriesOfSlot` 必须返回同一批对象）由 `tests/unit/multi-slot.test.mjs`
覆盖，因为它要真实走读路径，而自检只做静态断言。

### 两种 DSH 布局都要探

`readDshBundle` 依次探测两个位置，因为两者都真实存在：

```text
嵌套   <dsh>/node_modules/@deepseek-ai/<name>    ← 开发机的全局 pnpm 安装
提升   <dsh>/../<name>（同级）                    ← npm install --prefix 的产物，即 CI
```

只探嵌套会让这条自检**因为与契约无关的原因在 CI 上失败**（已实测：`npm --prefix` 会把整棵树提升到同级）。

### CI 接线

自检在找不到 DSH 时 **skip**（不是失败）—— 本地没装 DSH 时就是这种情况。
但**如果 CI 也 skip，这条自检就等于不存在**。所以 `ci.yml` 里：

```yaml
env:
  DSH_VERSION: 0.2.1-alpha.2        # 全文件唯一出现处
```

`test` job 用这个版本把 DSH 装到 `$RUNNER_TEMP/dsh-compat`（`npm --prefix` 要求目录先存在，
故先 `mkdir -p`），再把 `DSH_INSTALL_DIR` 指向它跑 `pnpm test`，于是自检**真实执行**。

**版本钉住而不是 `@alpha`**：自检断言的是「这个确切的构建仍然声明了插件所补丁的槽位」，
浮动 tag 会把上游漂移变成一次无法解释的红灯。要升级时改这一处，
自检与 Playwright 用的 profile 一起动。

---

## 7. 分期

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| **P0 探针** | 隐藏一个 `sidebar.panellist` id 后，`main`（keyed，由 id 驱动）是否仍能选中该面板 | 一份真机结论，回填 §8 R1，定下 §5.4 文案 |
| **P1 引擎泛化** | §4.1–4.4 全部改造 | **现有 `settings.section` 行为零变化**：`pnpm typecheck` 干净、36 个测试全绿**且测试文件无需改动** |
| **P2 侧边栏接入** | 槽位表加两行 + UI 分组 + `capability` 抑制 | 面板按钮与栏底动作可隐藏 / 排序；面板按钮可改名 |
| **P3 身份切换与文档** | 包名、插件 id、命名空间、i18n、README、§6 自检 | 以 `dsh-slots-manager` 身份运行 |

**P0 只影响 §5.4 的文案与 R1 的定性**，不阻塞 P1（引擎泛化与它无关）。

> §2.5 已解答原 R2（读路径），**不需要补第四条补丁**。

---

## 8. 风险

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| **R1** | 隐藏 `sidebar.panellist` 可能连带使主面板不可达（契约："每个 list id 对应一个主面板"；侧边栏点击走 `selectPanel(id)`） | 中——语义与文案不同，但不阻塞功能 | **P0 探针**定效果；据结果写 §5.4 文案。**隐藏本身照做** |
| **R2** | ~~侧边栏的读路径未知~~ | — | ✅ **已确认走 `entriesOfSlot`**（§2.5），补丁③覆盖 |
| **R3** | 在 `entriesOfSlot` 上就地替换 `options` 引用可能影响别的读取方 | 中 | 写入的是"生效值"，语义上就是所有人应该看到的；且原 `options` 对象不被修改 |
| **R4** | 上游契约变化导致静默失效 | 高 | §6 兼容性自检（含 isLive 身份约束的断言） |
| **R5** | 与 `dsh-better-sidebar`（也接管侧边栏，右侧 `sidebar.right.pane.tab`）叠加 | 低 | 管不同槽位；profile 双装实测无冲突 |
| **R6** | `order` 重编号（现有实现归一为 10 的倍数） | 低 | 三个槽位同构；确认无插件依赖具体 order 值 |
| **R7** | 与 `dsh-settings-manager` 同装会叠加两套补丁 | 中 | **明确互斥**：slots-manager 是替代品，README 写明需先移除前者 |
| **R8** | 用户把关键项隐藏后无法恢复 | 低 | §2.7 已确认 Settings 入口独立于两个侧边栏槽位；本插件的 section 永不可隐藏；每组提供「全部重置」 |
| **R9** | `sidebar.footer.action` 的隐藏与插件自带开关重叠，用户困惑 | 低 | 纳入方案 A：提供统一位置，UI hint 提示可能存在插件自带开关（§5.4） |

---

## 9. 测试

复用 `tests/helpers/mock-slots.mjs`（已模拟 list slot 的 `register` / `entries` / `entriesOfSlot` / `subscribe` / `getVersion`）。

| 文件 | 新增内容 |
|---|---|
| `tests/unit/policy.test.mjs` | 按槽位隔离：同 id 在三个槽位互不影响 |
| `tests/unit/patches.test.mjs` | **非纳管槽位逐字节返回原数组**；纳管槽位的过滤与改写；**`entriesOfSlot` 返回的 entry 身份不变**（isLive 约束） |
| `tests/unit/reorder.test.mjs` | `sidebar.panellist` 与 `sidebar.footer.action` 的重排与重编号 |
| `tests/unit/capability.test.mjs` | `rename: false` 的槽位不写入 label —— **新增** |
| `tests/unit/compat.test.mjs` | §6 的五项断言 —— **新增** |
| `tests/e2e/smoke.test.mjs` | 三个槽位各注册若干条，断言隐藏 / 排序生效 |
| `tests/playwright/` | 真机：管理面板出现两个分组三行；侧边栏图标隐藏后从 rail 消失；栏底动作隐藏后消失 |

**回归红线**：P1 完成后，现有 3 个单测文件 + e2e 必须全绿**且测试文件本身无改动**。

---

## 10. 身份清单（P3）

新插件的完整身份（**这是初次命名，不是改名**）：

```text
package.json      name: dsh-slots-manager
                  version: 0.1.0
src/client.ts     export const name = 'dsh-slots-manager'
src/host.ts       export const name = 'dsh-slots-manager'
                  settings 命名空间: 'slots-manager'
cordis.patch.yml  entry id: slots-manager
                  name: 'dsh-slots-manager'
locale 命名空间    'slotsManager'
README.md         全文重写（新定位：插槽编排）
docs/design.md    本文档
```

需要一并处理的引用：

```text
lib/ 与 src/ 里的字符串常量（SECTION_NS、LOCALE_NS、OWN_ID、TOUCH_ID）
tests/ 里断言这些字符串的地方
package.json 的 description / keywords
```

---

## 11. 待确认

| # | 问题 | 倾向 |
|---|---|---|
| **Q1** | 导航文案定为「插槽编排」？ | **是**（或「槽位编排」，你定） |
| **Q2** | 是否保留继承自 settings-manager 的 30 个提交历史？ | **保留**；要全新历史可以 squash |
| **Q3** | `docs/non-loopback-persistence.md` 是否随新仓库提交？ | **是** |

---

## 12. 下一步

1. 评审本文档，确认 §11
2. 执行 **P0 探针**（只需回答 §8 R1 一个问题）
3. 按 P1 → P2 → P3 实施
