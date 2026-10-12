# dsh-slots-manager

DSH web 插件：**编排其他插件贡献到界面上的槽位条目**——显示/隐藏、排序、改名——**不需要修改上游**（deepseek-harness）。

它由两部分组成：

- 一个**槽位无关的引擎**：在客户端槽位注册表（`ctx.slots`）的原型上打三个补丁，对每个纳管槽位套用一份策略；
- 一张**槽位表**（[`src/slots.ts`](src/slots.ts)）：唯一写明具体槽位的地方。**加一个槽位 = 加一行。**

## 管理哪些槽位

| 槽位 | 位置 | 隐藏 | 排序 | 改名 |
|---|---|---|---|---|
| `settings.section` | 「设置」对话框左侧导航里的分区 | ✅ | ✅ | ✅ |
| `sidebar.panellist` | 左侧栏的面板图标按钮 | ✅ | ✅ | ✅ |
| `sidebar.footer.action` | 左侧栏底部、Settings 旁边的动作 | ✅ | ✅ | ❌ |

**`sidebar.footer.action` 为什么不能改名**：该槽位的注册项**不声明 `label`**，按钮文案由组件自己通过 locale 取，渲染器也从不读 `options.label`。改名在那里不会有任何可见效果，所以 UI **不提供**该按钮（而非提供后失效）。

**两个入口，同一个面板**：

| 入口 | 位置 |
|---|---|
| 「设置编排」 | 设置对话框左侧导航里的一个分区（排在顶部附近，**不可隐藏**） |
| 左侧栏「插件」页 → 本插件详情页 | 与 `dsh-mnemon`、`dsh-context` 的配置区同一位置（`plugins.bundle.config`，keyed by 包名） |

面板按组渲染：

```text
┌─ 设置页 ─────────────────────────────┐
│  设置分区      5 项      [重置本槽位] │
├─ 左侧边栏 ───────────────────────────┤
│  面板按钮      1 项      [重置本槽位] │
│  栏底动作      1 项      [重置本槽位] │
└──────────────────────────────────────┘
```

## 原理：三个补丁 + 两条读路径

引擎在 `SlotRegistry.prototype` 上打三个补丁，覆盖所有注册与读取路径（cordis 服务代理每次访问都动态取方法、不缓存，因此对所有插件立即生效）：

| 补丁 | 拦截点 | 作用 |
|---|---|---|
| `register` | 注册入口 | 记录**原值**（order / label / registrant）。这里不改写，保证 reset 永远能还原 |
| `entries` | 列表读取方（设置外壳的导航） | 过滤隐藏 + 读时改写 order/label（**返回克隆**，该路径没有 `isLive` 检查） |
| `entriesOfSlot` | 内容选举方（渲染器）+ 侧边栏自己的面板列表 | 过滤隐藏 + **原地替换 `entry.options`** |

### 为什么 `entriesOfSlot` 必须原地替换而不是克隆

渲染器对返回的 entry 做存活性检查，用**对象身份**比较：

```js
isLive(entry) {
  for (const rec of this.records.values()) if (rec.entries.includes(entry)) return true
  return false
}
```

返回克隆会直接抛 `StaleAuthorizationError`。所以这里换成「保留 `entry` 身份、替换 `entry.options`」——原 `options` 对象不被就地修改，读取方看到的始终是**生效值**（有覆盖用覆盖，否则回退原值），因此 `reset` 天然还原，不需要额外的还原逻辑。

### 需要捕获「补丁安装前」的注册

**基础分区（通用设置/模型/插件）先于任何 profile 插件注册**，它们的注册不经过补丁。如果没有原值，原地改写会让条目卡在被覆盖的值上、`reset` 无法还原。引擎因此在**首次读取**时补记原值（此时条目仍是干净的）。

### 持久化文档按槽位分组

```json
{ "version": 1, "slots": { "settings.section": { "hidden": {}, "order": {}, "labels": {} } } }
```

**分组是必须的，不是美化**：条目 id 只在单个槽位内唯一。`dsh-client-ui-plugin-manager` 用的侧边栏面板 id 就是 `plugins`，而它同时也是一个设置分区 id——扁平结构会让隐藏其中一个连带隐藏另一个。

策略经 **DSH 标准 settings 命名空间**（`slots-manager`）持久化：host 半区把策略声明为**自己的插件 `Config`**，客户端经 `remote.settings` Remote RPC 读写，由 SettingsProvider 落盘（纯服务端）。

> **为什么是 `Config` 而不是 `settings.register`**：现代 DSH 的 settings 服务**没有 `register`**。它按 `ns` 在 profile 的**可配置插件条目**里查：
>
> ```js
> const entry = configEditor.entries().find((row) => row.options.id === ns)
> const schema = entry?.fiber?.runtime?.Config
> if (entry === undefined || schema === undefined) throw new Error(`No configurable plugin entry "${ns}"`)
> ```
>
> 所以**命名空间 id 必须等于本插件的条目 id**（`slots-manager`，见 `cordis.patch.yml`），schema 必须是本模块导出的 `Config`，可编辑字段用 `meta.volatile` 标记 —— 这里整份文档都是 volatile，因为插件的全部配置就是这份策略。
>
> ⚠️ 顺带一提：`.volatile()` **只存在于 DSH 自带的 schemastery**（它给原型打了补丁），npm 上的 `@deepseek-ai/schemastery@3.18.1` 没有这个方法。`extra()` 的类型又不够宽，所以直接写 `meta.volatile` —— 三者产生的是同一个 `meta.volatile`，而 DSH 只读它。

## 安装

```bash
# 方式一：官方 CLI
dsh plugin --profile web add dsh-slots-manager

# 方式二：profile 仓库（file: 依赖）
# package.json:
#   "dependencies": { "dsh-slots-manager": "file:../dsh-slots-manager" }
#   "dsh": { "profile": { "bundles": [ ..., "dsh-slots-manager" ] } }
pnpm install
```

重启 `dsh web` 后生效。

> ⚠️ **与 `dsh-settings-manager` 互斥**：本插件是它的替代品（同一套补丁机制，范围更大）。两个同时启用会叠加两套补丁。启用前请先移除 `dsh-settings-manager`。
>
> 本插件也**不读取** `dsh-settings-manager` 留下的任何数据——命名空间与文档结构都是新的，旧配置不会迁移。

## 开发 / 构建

```bash
pnpm install        # 安装依赖
pnpm typecheck      # tsc --noEmit（严格模式）
pnpm build          # esbuild 打包 → lib/（client.js 包进 DSH __ModuleLoader__ 格式）
pnpm test           # 全部测试
```

`lib/` 是**构建产物**（已 gitignore），由 `pnpm build` 生成；`main`/`exports` 指向 `lib/`，所以用 `file:` 依赖前需先构建。

## 测试

```bash
pnpm test               # UT + e2e 冒烟（node:test）
pnpm test:unit          # 仅单元测试
pnpm test:e2e           # 仅 e2e 冒烟（jsdom 挂载真实组件）
pnpm test:playwright    # 真实浏览器对接运行中的 DSH
```

| 层 | 覆盖 |
|---|---|
| `tests/unit/policy.test.mjs` | 策略存储：读写、持久化、reset/resetAll、自身分区保护、启动加载 |
| `tests/unit/patches.test.mjs` | 三个补丁：注册经过、读路径隐藏/重排/改名、`entriesOfSlot` 身份安全、bump 无残留 |
| `tests/unit/reorder.test.mjs` | 重排原语与重编号 |
| `tests/unit/multi-slot.test.mjs` | **多槽位**：按槽位隔离、`entriesOfSlot` 上的隐藏/排序/改名、`isLive` 身份契约、补丁安装前注册的原值还原、**非纳管槽位逐字节不被触碰**、能力矩阵 |
| `tests/unit/compat.test.mjs` | **上游契约自检**：纳管槽位仍是 catalog 里的 `root`/`list` 槽位、`SlotRegistry` 仍暴露三个被补丁的方法。找不到 DSH 时**跳过**（不失败）—— CI 里由 `test` job 按 `DSH_VERSION` 装一份 DSH 并指向它，所以自检在 CI 上**真实执行**；本地可 `DSH_INSTALL_DIR=… pnpm test:unit` |
| `tests/e2e/smoke.test.mjs` | jsdom + react-dom 真实渲染面板：开关、重排、重置、改名、分组结构 |
| `tests/playwright/` | 真实浏览器：分区在导航顶部、面板渲染、开关/排序/重置/拖拽/改名（含刷新后持久） |

> **契约自检为什么重要**：引擎依赖两个它并不 import 的上游事实（三个原型方法、每个槽位是 `list`）。上游一改，插件会**静默失效**——面板里少一项，或 `installPatches` 直接放弃、整个插件什么都不做。这个测试把沉默变成红灯。
>
> 它也是踩过坑的：`register` 是**类体外**的原型赋值（`SlotRegistry.prototype.register = …`），而 `entries`/`entriesOfSlot` 是类成员。按源码结构搜索会误判成「没有 register」，所以探测必须针对实例原型。
>
> 另一处：它要探**两种 DSH 布局** —— 开发机全局安装是 `<dsh>/node_modules/@deepseek-ai/*`（嵌套），而 CI 用 `npm install --prefix` 会把整棵树**提升到同级**。只探嵌套会让它因为与契约无关的原因在 CI 上红。
>
> CI 里 dsh 版本**钉在 workflow 级 `env: DSH_VERSION`**（全文件唯一出现处），不用浮动的 `@alpha`：自检断言的是「这个确切的构建仍声明了所补丁的槽位」，浮动 tag 会把上游漂移变成无法解释的红灯。

## 限制与说明

- **基础分区永远先于任何第三方插件注册**，注册入口抓不到它们——全部由读路径补丁覆盖，所以本插件不依赖加载顺序。
- 隐藏 `sidebar.panellist` 的条目**只是隐藏入口**：它对应的主面板可能仍能通过其他方式到达（侧边栏点击本身走 `selectPanel(id)`，即 id 就是面板 key）。
- 本插件自身分区（`slots-manager`）不可隐藏，保证管理入口始终可达；「Settings」入口位于 `sidebar.settings`（**不是** `sidebar.panellist`），所以即使隐藏了所有面板图标，也仍能进设置恢复。
- `sidebar.footer.action` 的隐藏与插件自带的显示开关（如 `dsh-context` 的 `insightsEntry`）功能重叠：插件自带的开关是组件返回 `null`，本插件是把注册项从槽位移除。两者不冲突，本插件的价值在于**统一位置**。
- 纳管槽位的顺序由该槽位的读取方决定，本插件通过改写 `options.order` 生效。
- 非纳管槽位（`conversation.*`、`plugins.*`、`shell.*` 等）**逐字节不被触碰**。

## 结构

```
src/slots.ts     纳管槽位表（唯一的「加一行」入口）
src/client.ts    浏览器半区源码：策略文档 + 三个补丁 + 管理面板
src/host.ts      宿主半区源码：导出 `Config`（= `slots-manager` settings 命名空间的 schema）
lib/client.js    构建产物（gitignore）：esbuild 打包 + DSH __ModuleLoader__.load 包装（只依赖 react seed）
lib/host.mjs     构建产物（gitignore）：宿主半区（ESM，import type 已擦除 → 零运行时导入）
scripts/build.mjs  构建（node scripts/build.mjs）；typecheck 用 pnpm typecheck
cordis.patch.yml 打包挂载声明
docs/design.md   设计与上游契约依据（权威出处、风险、分期）
tests/           单元测试（node:test）、e2e 冒烟（jsdom+react）、Playwright
```

## License

MIT
