# 非 loopback 服务端持久化：两条路线（反代 / 自建 RPC）

> 状态：**反代方案已验证可行（2026-08-24，首选）；自建 RPC 为备选（待实现）**
> 目标：让 dsh-settings-manager 的策略在 **非 loopback 访问下也能服务端持久化**（当前 DSH 标准 settings 是 loopback-only）。

## 结论（更新）

**反代 + Host/Origin 改写已实测可行**——插件保持现状（settings 命名空间），反代让 DSH 看到回环即可，**零插件改动**。这是首选。

自建 RPC 为备选（如果不想依赖反代 / 需要插件级方案时再实现），见下文。

## 首选：反代 + Host/Origin 改写（已验证）

Caddy 反代把 DSH 的 `/api` 请求伪装成回环，loopback-only 的 settings 得以读写。

### Caddy 配置（关键：Origin 必须是完整 URL，带 `http://`）

```caddyfile
:13080 {
	reverse_proxy 127.0.0.1:3080 {
		header_up Host 127.0.0.1:3080
		header_up Origin http://127.0.0.1:3080   # 必须带 scheme，否则 new URL() 抛异常 → 403
	}
}
```

### 为什么必须带 `http://`

DSH `isTrustedApiRequest` 的同源检查：
```js
return new URL(origin).host === hostUrl.host
```
- Origin 设为裸 `127.0.0.1:3080` → `new URL('127.0.0.1:3080')` 抛异常 → `catch → false` → **403**。
- Origin 设为 `http://127.0.0.1:3080` → `.host` = `127.0.0.1:3080`，与 Host 相等 → **放行**。

### 备注

- 纯 `localhost` 访问：`localhost` 本身是回环 hostname，无需改写即可过。
- Tailscale / LAN IP（如 `100.70.22.77`）：必须改写，且 Origin 带 `http://`。
- 已验证：修改能持久化（改名/排序跨 reload 保留）。

### 两层反代（Traefik 外层 + DSH 本机端口转发）

当外层是 Traefik、内层是 DSH 本机时，可把 **Host/Origin 改写 + `/remote` 前缀剥离** 都放到外层 Traefik 做；内层 DSH 本机只需做**端口转发**（把 DSH 的 `127.0.0.1:3080` 暴露出来），无需再配 Caddy 的 header/strip。

**外层 Traefik（脱敏配置）**：
```yaml
http:
  routers:
    dsh-pc:
      entryPoints:
        - "http"
        - "https"
      rule: "Host(`<内部域名>`)"
      service: "dsh-pc"
      middlewares:
        - dsh-pc
        - strip-api-prefix

  services:
    dsh-pc:
      loadBalancer:
        servers:
          - url: "http://<DSH_本机_IP>:13080"   # DSH 本机的端口转发入口

  middlewares:
    dsh-pc:
      headers:
        customRequestHeaders:
          Origin: "http://127.0.0.1:3080"   # 强制改写 Origin
          Host: "127.0.0.1:3080"            # 强制改写 Host
    strip-api-prefix:
      stripPrefix:
        prefixes:
          - /remote   # 剥离 /remote 前缀（非回环时客户端把插件路由切成 /remote/*）
```

**要点**：
- `Host`/`Origin` 都改写为 `127.0.0.1:3080`（**必须带端口且一致**，否则 DSH 同源检查 `new URL(Origin).host === Host` 失败 → 403）。
- `stripPrefix /remote` 剥离前缀，让 `/remote/api/*` → `/api/*`、`/remote/sidebar/*` → `/sidebar/*`（DSH 实际挂的是后者）。
- **内层 DSH 本机**只需把 `127.0.0.1:3080` 通过端口转发暴露为 `:<端口>`（如 `:13080`）即可，不做 header/strip。
- 仍受「非回环 `settingsScope` memory 模式」限制（欢迎弹窗、主题/语言、模型设置页等，见下节）。

### 已知限制：非回环访问时「内测声明」欢迎弹窗每次刷新都出现

- **现象**：通过非回环（如 `100.70.22.77:13080`）访问时，`dsh-client-ui-settings-models` 的欢迎弹窗（内测声明，版本 `2026-08-13.1`）每次刷新都出现；localhost 则不会。
- **根因**：欢迎弹窗的「已确认」ack 走 `ctx.settingsScope`，其持久化模式由**客户端 `connection.isLoopback`** 决定：
  - loopback → host 模式 → `acknowledge()` 落盘 `ui-onboarding.welcomeNoticeVersion` → 刷新不出现。
  - 非 loopback（`100.70.22.77`）→ **memory 模式** → `derive()` 只认 `localAcknowledged`（内存），**完全不读服务端值** → 每次刷新重置。
  - 反代只能改**服务端视角**（Host 改写），无法改客户端 `connection.isLoopback`（根据自身 URL 判定）。
- **#1 预置版本号无效**：在 profile 里预置 `ui-onboarding.welcomeNoticeVersion` 也无效（memory 模式不看服务端值）。
- **#2 禁用难做**：cordis patch 只能按 id 禁用 loader 树里的插件，而 `welcome-notice` 是**客户端 slot entry**，patch 够不着；只能整个禁用 `dsh-client-ui-settings-models`（会连带模型设置页）或改客户端代码（非 DSH 标准）。
- **本质**：DSH 对非回环浏览器的设计行为（「remote browsers remain process-local」），暂按已知限制接受。

### 已确认：`connection.isLoopback` 是纯前端 hostname 判定，配置无法干预

- **判定逻辑**（`@deepseek-ai/dsh-client-connection` client.js，约 10263/10282 行）：
  ```js
  const pageLocation = typeof location === "undefined" ? void 0 : location;  // 就是 window.location
  const handle = { isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname), ... }
  ```
  - `isLoopbackHostname(hostname)` 只认 `localhost`、`[::1]`、`127/8`。
  - 非回环域名（如 `dsh-pc.lab.home`、`192.168.3.91`）→ `isLoopback = false`。
- **配置层面无法干预**：
  - 无任何配置开关能覆盖 `isLoopback`（硬编码前端判定）。
  - 反代能改服务端看到的 Host 头，但改不了浏览器 `window.location.hostname`（`dsh-pc.lab.home` 就是地址栏域名）。
  - 唯一例外：浏览器地址栏 hostname 本身是回环（`localhost`/`127.0.0.1`）时 `isLoopback` 才为 true——远程访问用真实域名/IP 必然非回环。
- **这是 DSH 前端实现的设计**（非反代、非 API、非配置问题），只有改 DSH 前端（不依赖 hostname / 加开关）或官方远程访问能解决，非标准做法暂不采用。

### 受影响的 DSH 功能（非回环访问，`settingsScope` memory 模式）

| 功能 | 依赖 | 非回环影响 |
|---|---|---|
| **主题设置**（dsh-client-ui-theme） | `settingsScope.bind` 写配置 | 选主题**不持久化**，刷新/换浏览器重置 |
| **语言设置**（dsh-client-locale） | `settingsScope.bind` 写配置 | 选语言**不持久化** |
| **模型设置页 / provider 目录**（dsh-client-ui-settings-models） | `settingsScope.describe` | **「settings are unavailable」报错** |
| **欢迎弹窗 ack**（dsh-client-ui-settings-models） | `settingsScope` memory | 每次刷新出现 |
| **Agent 预设 / 交付物 / 权限预设 / 设置-插件页** | `settingsScope` | 可能读写受影响 |

**不受影响**：
- **dsh-settings-manager（本插件）**：用 `connection.api.settings` **直接调 RPC**（不走 `settingsScope` 的 isLoopback 门控）→ 非回环下**仍可持久化**（已验证）。
- 核心 `/api`、插件路由、设置编排面板：反代后可用（`Host/Origin` 改写 + `uri strip_prefix /remote`）。

---

## 备选：自建 RPC（待实现）

### host 半区（`src/host.ts`）

```ts
export const inject = ['webServer']

export function apply(ctx: Context): void {
  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-settings-manager/config',
    handler: async (req, res) => {
      if (req.method === 'GET') writeJson(res, 200, store.get())                    // 读（非回环放行）
      if (req.method === 'POST') { store.set(await readJson(req)); writeJson(res, 200, store.get()) } // 写
    },
  })
}
```

- 存储：host 内存态 + 落盘 **`$DSH_HOME || ~/.dsh/dsh-settings-manager.yaml`**。
- **门禁策略：待实现时定**（倾向 @linxin666 的配对门禁 `isLoopbackRequest || remoteWebUiPairing.isPairedDevice`，见「调研」第四节）。

### client 半区（`src/client.ts`）

- `createPolicy` 的 `persist` 改为 `fetch('/dsh-settings-manager/config', { method:'POST', body: JSON.stringify(doc) })`。
- 启动 `fetch(GET ...)` 读策略填充内存态。
- 保留内存态做即时 UI；移除对 `connection.api.settings` 的依赖。
- 保留 `settings.section` 注册（设置编排 UI 不变）。

## 关键验证结论（已查证）

1. **`/api/` 前缀被 loopback 门禁**：非回环时 `/api/*`（含 `/api/pair/status`、`/api/dsh-web-ui-settings/describe`）全部 **403**。
   → 自建路由**不能放 `/api/` 下**（会 403）。
2. **`/remote/` 前缀是插件 `@linxin666/dsh-remote-web-ui` 的重映射**：非回环时把 API base / SSE 换成 `/remote/*`，但该层在普通反代下是坏的（SSE 502、路由 404/405）。
   → 自建路由**也不能放 `/remote/` 下**（会被 remap）。
3. **路径定为 `/dsh-settings-manager/config`**（既非 `/api/` 也非 `/remote/`）：由 webServer 直接服务、不经 api-proxy 门禁、不被 remap。

## 与现状的差异

- host：从「注册 settings 命名空间」→「注册 webServer 路由 + YAML 文件存储」。
- client：从 `connection.api.settings` → `fetch` 自建路由。
- package.json：移除 `@deepseek-ai/dsh-settings` peerDep（不再用）；host 用 `ctx.get('webServer')` 服务面，零额外依赖。
- **移除** host 的 `installSettingsSection`（不再注册 settings 命名空间）。
- **设置编排页面仍在**：UI 靠 `settings.section` 卡槽渲染，与 settings 命名空间无关；移除命名空间不影响页面。

## 已确定的决策

| 项 | 决定 |
|---|---|
| 路由路径 | `/dsh-settings-manager/config`（非 `/api/`、非 `/remote/`） |
| 门禁/鉴权 | **待实现时定**（倾向配对门禁 `isLoopbackRequest || isPairedDevice`） |
| 存储 | `$DSH_HOME/dsh-settings-manager.yaml` |
| settings 命名空间 | 完全移除（`installSettingsSection` 删掉） |
| 设置页面 | 保留（`settings.section`） |

## 测试计划

1. **UT（client）**：mock `globalThis.fetch`
   - 启动 GET 读策略填充内存态
   - 变更 POST 写服务端
   - mutated 守卫（晚到的读不覆盖用户变更）
2. **UT（host）**：直接调路由 handler（模拟 req/res）
   - GET 返回当前策略
   - POST 更新 + 落盘 YAML
   - 门禁策略（回环放行 / 配对放行 / 非回环拒绝）按实现时定的门禁断言
   - YAML 文件读写（`$DSH_HOME` 临时目录）
3. **e2e**：jsdom 渲染 + mock fetch，驱动开关/排序/改名 → 断言 POST 写入
4. **Playwright（隔离环境）**：起独立 dsh → 真实 webServer 路由 → 改名/排序 → 验证持久化 + 刷新保留
5. **回归**：现有 UT/e2e 全绿（改动的持久化相关断言更新）

## 待实现时再确认/验证

- 路由路径 `/dsh-settings-manager/config` 与 SPA fallback 无冲突。
- 非回环下 `fetch('/dsh-settings-manager/config')` 是否被任何中间层拦截（remote-web-ui 只 remap `/api/` 和连接通道，自建路径应不受影响——实现时实测确认）。
- 是否需要处理多进程/并发写 YAML（简单起见单写者，后续可加锁）。
- **门禁策略待实现时定**：回环放行 +（配对 `remoteWebUiPairing.isPairedDevice` 或完全开放 或 只读非回环），参考「调研」第三、四节各插件做法再选。

---

## 调研：其他插件如何处理非 loopback / settings vs 自建 RPC

> 补充调研（2026-08-24），供实现时参考。

### 一、插件注册路由的两条通道

| 通道 | 用途 | 持久化 | loopback |
|---|---|---|---|
| **settings 命名空间**（`ctx.settings.register`） | 插件**配置**，Settings UI 显示 | DSH settings seam 落盘 | loopback-only |
| **自建 RPC**（`webServer.register`） | 插件**实时 API 路由**（`/api/<plugin>/*`） | 插件自己存（文件等） | 默认 loopback 门禁，可放行配对/只读 |

一个插件可同时用两者：**settings 存配置、webServer 跑 API**。

### 二、谁用 settings、谁用自建 RPC

**用 settings 命名空间**：
`@linxin666/dsh-client-ui-skin-center`、`dsh-client-ui-task-board`、`dsh-client-ui-aionui-panel`、`dsh-client-ui-web-ui-settings`、`dsh-desktop-launcher`、`dsh-doctor`、`dsh-pet`、`dsh-ssh`、`dsh-remote-web-ui`、`dsh-tool-describe-image`、`dsh-liangshen`；`@wingsky-1/dsh-mcp-manager`；`dsh-better-sidebar`；`dshmarket`。

**用自建 RPC（webServer）**：
`@linxin666/dsh-client-ui-aionui-panel`、`dsh-client-ui-task-board`、`dsh-doctor`、`dsh-client-ui-skin-center`、`dsh-desktop-launcher`、`dsh-ssh`、`dsh-pet`、`dsh-client-ui-git-graph`、`dsh-client-ui-skill-explorer`、`dsh-client-ui-plugin-manager`、`dsh-client-ui-web-ui-settings`、`dsh-remote-web-ui`；`@mlgbnb/dsh-archive-manager`；`@nanmicoder/dsh-agent-teams`；`@wingsky-1/dsh-mcp-manager`。

**两个都用**：skin-center、task-board、pet、ssh、doctor、desktop-launcher、mcp-manager 等（settings 存配置 + webServer 跑 API）。

### 三、各插件对非 loopback 的处理（无统一标准）

| 插件 | 非回环处理 |
|---|---|
| `@linxin666/*`（pet/skin-center/task-board 等） | `isLoopbackRequest` 或 **配对设备** `remoteWebUiPairing.isPairedDevice`（配对 cookie） |
| `@mlgbnb/dsh-archive-manager` | 纯 **loopback-only**（非回环 403 `forbidden: loopback-only`） |
| `@wingsky-1/dsh-mcp-manager` | loopback-only，**只读 config 路由**放行非回环（`/api/dsh-mcp/config` GET） |
| `@nanmicoder/dsh-agent-teams` | loopback 门禁模式 |

共同点：都用 `isLoopbackRequest`（socket 地址判定），默认 loopback-only。差异在非回环放行方式（配对 / 只读 / 完全不放）。

### 四、对自建 RPC 方案的影响

- **自建 RPC 是 DSH 插件跑 API 的常规做法**（不是偏门）。
- 多数插件**非回环默认不放行**（loopback-only 或配对）。**没有插件做「完全无鉴权、非回环可写」**。
- 若要**非回环可写**，符合 DSH 生态的是 **配对门禁**（`isLoopbackRequest || remoteWebUiPairing.isPairedDevice`，@linxin666 模式）。
- 待实现时需确认：自建路由 `/dsh-settings-manager/config` 的门禁策略（配对门禁 vs 完全开放 vs 只读非回环）。
