# IT 角色 · 系统维护模式（踢人开关）— 前端设计

> **范围**：IT 专属的全局"踢人"维护开关的前端部分——开关 UI、IT 登录后 sidebar/页面数据访问、
> 以及维护模式期间用户登录被拦截时的提示弹窗。后端实现（表结构、Service、Filter 拦截逻辑、
> 登录接口的拦截判断）见 `Count/docs/it-role-maintenance-mode-and-sidebar-fix.md`，本文档只记
> 前端设计，不复述后端细节。
> **最后更新**：2026-09-17

---

## 1. 需求

IT 需要一个"一键踢出所有在线用户"的开关：全局无差别，不分 tenant/公司/角色，开关一开，所有非 IT
的已登录用户（Admin/Owner/Member 都算）会被强制下线；维护期间任何非 IT 账号即使密码输入正确也不能
登录进来，要看到"系统维护中"的提示，而不是正常进去或看到一个含糊的登录失败。IT 自己任何时候都不受
影响。

---

## 2. 开关 UI：放在哪、长什么样

**位置**：不是独立页面/独立大卡片，而是插进现有 Announcement 页面 Maintenance tab 的
"Published Maintenance Content" 标题栏右侧——这是用户在实际截图反馈里明确要求的位置和样式（最初做
成了一个独立的说明卡片，被反馈"不是这个东西"，改成现在这个内嵌小开关）。

- 复用 `.maintenance-list-header` 本来就有的 `display:flex; justify-content:space-between`，
  开关作为标题旁的第二个子元素，不需要改这条已有 CSS。
- 开关旁边的文字固定显示 "Maintenance Mode"（不随开关状态变化），字重、颜色对齐旁边的
  "Published Maintenance Content" 标题（`font-weight:700`，`color:#002c49`），字号用
  `var(--text-medium)` 这个项目里已有的全局字号变量。
- 切换**没有二次确认弹窗**——最初做了一个"确定要开启/关闭吗"的 Confirm 弹窗，用户反馈直接去掉，
  点一下开关就立即生效。
- 切换成功**没有 toast 提示**——同样是用户反馈后去掉的，只保留失败时的错误提示（网络错误/后端返回
  失败），成功是静默的，开关本身的视觉状态（滑块位置）就是唯一反馈。
- 只有 IT 账号能看到这个开关，其他角色的 Maintenance tab（marquee 通告编辑）完全不受影响、界面不变。

**新文件**（不混进 `announcement.css`，延续这个页面"新功能独立小文件"的既有做法，见 Contact 面板的
`telegram-contact.css` 先例）：

| 文件 | 职责 |
|------|------|
| [`SystemMaintenanceModeSwitch.jsx`](../src/pages/announcement/components/SystemMaintenanceModeSwitch.jsx) | 自包含组件：挂载时自己拉状态、切换时直接调用 API，不经过父组件中转状态 |
| [`systemMaintenanceMode.css`](../src/pages/announcement/components/systemMaintenanceMode.css) | 开关的滑块样式（红=开启/灰=关闭），独立文件 |
| [`systemMaintenanceModeApi.js`](../src/pages/announcement/systemMaintenanceModeApi.js) | 对接后端 `GET/POST /api/it/maintenance-mode`，跟 `announcementApi.js`/`contactSettingsApi.js` 同一套 `getJson`/`postJson` 封装风格 |

`MaintenancePanel`（[`AnnouncementPanels.jsx`](../src/pages/announcement/components/AnnouncementPanels.jsx)）
加了一个可选的 `headerExtra` prop，直接渲染在标题栏里——`MaintenancePanel` 本身完全不知道"IT"这个
概念，只是"父组件想往标题栏塞点什么就塞"，IT 专属逻辑全部留在 `AnnouncementPage.jsx` 里判断。

`AnnouncementConfirmModal`（`AnnouncementCommon.jsx`）顺手加了个可选的 `confirmLabel` prop（原本按钮
文字写死"删除"），本来是给这个开关的确认弹窗用的，后来确认弹窗整个拿掉了，但这个 prop 保留着，向后
兼容、不影响其他调用点。

---

## 3. IT 登录后，为什么第一次实现是错的（教训记录）

第一版实现犯了一个理解错误：把 IT 登录后的 Announcement 页面整个换成了一套"精简版"——Maintenance
tab 只显示开关卡片，看不到真实的通告/维护列表，Announcement 和 Contact 两个 tab 直接不显示。用户
反馈截图显示"Failed to load domain data"式的空白后指出：**IT 在 C168 公司下登录，应该跟一个真正的
C168 管理员看到的完全一样——通告、维护列表这些真实数据都要正常显示**，开关只是"多出来的一样东西"，
不是"替换掉原来的东西"。

排查后发现：
- `/api/announcement/listAnnouncement`、`/listMaintenance` 这两个后端接口**根本不检查
  session/tenant**，谁调用都返回同一份数据——所以 IT 看不到数据完全是前端自己的问题（在 IT 分支里
  加了一行直接 `return`，跳过了 `loadAnnouncements()`/`loadMaintenance()` 的调用），不是后端权限
  问题。
- 修复方式：三个 tab 恢复成对所有角色一视同仁地正常调用/正常渲染，IT 唯一的区别是**跳过了 legacy
  的 PHP C168 session 同步**（`ensureC168DomainApiSession`）——这个同步是给其他真正依赖 PHP session
  的 C168 域名页面用的，Announcement/Maintenance 这两个 Spring 接口不需要它，硬要走反而会因为 IT
  没有"当前处于 C168 公司下"而被弹回 dashboard。

这个教训也体现在 sidebar 入口的处理上：`AuthenticatedLayout.jsx` 里 Announcement 导航项的可见性从
`canAccessC168DomainPages(me)` 改成 `canAccessC168DomainPages(me) || isItOperator(me)`——保证 IT
不管当前在哪家公司/集团都能看到入口点进去开关踢人，不受"必须先切到 C168"这条限制（这条限制对其他
角色维持不变，因为对他们而言"是否显示 Domain/Announcement 入口"本来就该看这家公司是不是 C168，是
公司真实形态判断，不是权限判断）。

---

## 4. IT 登录后 sidebar 拿不到公司真实属性（Report/Data Capture/Ownership 等入口消失）

跟本次踢人功能同批修的一个相关 bug：IT 登录任意公司后，sidebar 只显示 Home/Admin/Account/
Transaction Payment/Maintenance，Report、Data Capture、Ownership、Domain/Announcement/Auto Renew
等入口全部缺失，且跟登录的公司实际有没有这些模块无关。

前端这边补的是三处角色白名单（后端那部分——`SessionUser` 没有把公司真实的 game/bank 模块信息传给
IT 分支——见后端文档）：

- [`sidebarPermissions.js`](../src/utils/auth/sidebarPermissions.js:39)：`canAccessPermission` 的
  Ownership 特判加 `&& !isItOperator(me)`。
- [`loginScope.js`](../src/utils/company/loginScope.js)：新增内部 `isItOperatorRole(me)`（跟
  `sidebarPermissions.js` 的 `isItOperator` 同逻辑，写成本地副本是为了避免两个文件互相 import 造成
  循环依赖），`canAccessC168DomainPages`/`canAccessC168AutoRenew` 的返回条件里加
  `isItOperatorRole(me) ||`。
- 三处都只加了独立的 OR 分支，没有改动原本的白名单集合本身，非 IT 角色的判断结果不受影响。
- **注意**：`isActiveCompanyContextC168(me)` 这条前置检查在这三处都**没有跳过**——这是公司真实
  形态的判断，IT 一样要遵守，只有角色白名单那一行本身被放开。

---

## 5. 用户被踢出后再次登录：维护提示弹窗

维护模式打开后，已登录用户会在下一次请求时被强制下线（后端逻辑，见后端文档），这些用户去重新登录时
即使账号密码完全正确，也应该被明确告知"系统正在维护"，而不是看到一个含糊的登录失败提示或者被放行。

**关键要求**：账号密码本身输错的情况，必须继续显示原本的"账号或密码错误"，不能因为维护模式 ON 就
提前把"系统维护中"这句话暴露给还没验证通过的人——所以这个提示只在**凭证验证通过之后**才会出现，
后端负责保证这个顺序（见后端文档），前端只负责识别信号并弹出对应提示。

**前端实现直接复用了登录页已有的两样东西，没有新建组件**：

- `LoginPage.jsx` 本来就有一个通用的 `AlertModal`（`modal` state + `showNotice()`），所有登录失败
  目前都走这个弹窗，只是内容不同。
- `maintenanceList` 这个 state 也已经在登录页里加载着了（本来是给登录页顶部那条跑马灯通知用的，
  数据来自 `maintenance` 表）——维护提示弹窗要展示的"下方 maintenance content"直接复用这份已加载的
  数据，**不需要额外打一次 API**。

具体改动：
- 新增 `showMaintenanceNotice(message)`：跟 `showNotice()` 平行的一个函数，把 `maintenanceItems`
  设成当前的 `maintenanceList`，弹窗标题固定为"System Maintenance / 系统维护中"。
- 登录失败分支里检查后端返回的 `data.data.maintenanceMode` 信号（后端约定见后端文档），命中就调用
  `showMaintenanceNotice()`，没命中还是走原来的 `showNotice()`。
- `AlertModal` 加了一个可选的 `maintenanceItems` prop，非空时在消息下方渲染一个列表（复用跟登录页
  跑马灯一样的 `extractPlainTextFromRichText(item.content)` 处理富文本，不用 `dangerouslySetInnerHTML`）；
  `maintenanceList` 为空时这块直接不渲染，符合"没有 maintenance 内容就留空"的要求。
- 样式加在 `login-shadcn.css`（这个 `AlertModal` 本来就在这个文件里定义样式，新增的
  `.sc-login-modal-maintenance`/`.sc-login-modal-maintenance-item` 跟着放在一起，没有另开文件）。
- `authTranslate.js` 补充了后端新错误消息的中英对照，以及弹窗标题 `maintenanceModalTitle` 的中英文案。

---

## 6. 已知缺口

- 维护模式开关本身没有 realtime 广播——IT 计划后续把整套 realtime 机制用纯 Spring Boot 重做，这次
  明确排除在范围外。已登录但停在原地不发任何请求的页面不会立刻自己跳走，要等用户有下一步操作或刷新
  才会被踢出。
- 没有做真实浏览器端到端测试（开关开启 → 另一个已登录会话被踢 → 该会话重新登录看到维护弹窗）这条
  完整链路，只验证了 `vite build` 编译通过。

---

## 7. 参考文件

- [`SystemMaintenanceModeSwitch.jsx`](../src/pages/announcement/components/SystemMaintenanceModeSwitch.jsx)
- [`systemMaintenanceMode.css`](../src/pages/announcement/components/systemMaintenanceMode.css)
- [`systemMaintenanceModeApi.js`](../src/pages/announcement/systemMaintenanceModeApi.js)
- [`AnnouncementPage.jsx`](../src/pages/announcement/AnnouncementPage.jsx) / [`AnnouncementPanels.jsx`](../src/pages/announcement/components/AnnouncementPanels.jsx) / [`AnnouncementCommon.jsx`](../src/pages/announcement/components/AnnouncementCommon.jsx)
- [`AuthenticatedLayout.jsx`](../src/components/AuthenticatedLayout.jsx)
- [`sidebarPermissions.js`](../src/utils/auth/sidebarPermissions.js) / [`loginScope.js`](../src/utils/company/loginScope.js)
- [`LoginPage.jsx`](../src/pages/login/LoginPage.jsx)
- [`login-shadcn.css`](../public/css/login-shadcn.css)
- [`announcementTranslate.js`](../src/translateFile/pages/announcementTranslate.js) / [`authTranslate.js`](../src/translateFile/auth/authTranslate.js)
- 后端对应文档：`Count/docs/it-role-maintenance-mode-and-sidebar-fix.md`
