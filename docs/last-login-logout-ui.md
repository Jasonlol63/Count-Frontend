# Admin User List & Account List：Last Login / Last Logout 展示

> 适用范围：`src/pages/userlist/`（Admin User 列表）、`src/pages/account/`（Account/Member 列表）
> 及相关 CSS（`userlist.css` / `accountCSS.css` / `admin-responsive.css` / `global-13inch.css`）。
> 这份文档只记录前端展示/交互部分；后端字段是怎么补齐的见 `Count` 仓库的
> [`docs/last-login-logout-tracking.md`](../../Count/docs/last-login-logout-tracking.md)。

两个列表页面各自独立实现（组件、CSS grid 变量都不共享），但用的是同一套设计：新增一列
"Last Logout"，紧跟在已有的 "Last Login" 列后面，格式和交互跟 Last Login 完全对称。

## 共同的展示规则

- **日期格式**：单元格只显示 `DD-MM-YYYY`；鼠标悬浮显示 `title` tooltip，内容是 `HH:MM:SS`
  （只有时间，不重复日期）。空值显示 `-`。
- **可排序**：表头点击排序，跟其他列一样的升/降序切换；空值排在最后。
- **列的插入位置**：紧跟在 Last Login 后面、Created By（Admin）或 Remark（Account）之前，不打乱
  其余列的顺序。

## 1. Admin User List（`src/pages/userlist/`）

- **格式化函数**：[`userListLogic.js`](../src/pages/userlist/userListLogic.js) 新增
  `formatUserLastLogoutDate` / `formatUserLastLogoutTimeTitle`，逻辑跟既有的
  `formatUserLastLoginDate` / `...TimeTitle` 一致（复制粘贴同一套日期解析）；排序分支
  `sortColumn === "lastLogout"` 复用既有的 `lastLoginSortMs` 通用日期比较函数。
- **数据映射**：[`userListApi.js`](../src/pages/userlist/userListApi.js) 的
  `normalizeAdminListItem` 加 `lastLogout: admin.lastLogout ?? null`。
- **页面接线**：[`UserListPage.jsx`](../src/pages/userlist/UserListPage.jsx)
  - `toLegacyAdminRow` 加 `last_logout: item.lastLogout ?? null`。
  - 表头在 Last Login 和 Created By 之间插入一个新的可排序 header item
    （`handleUserListSort("lastLogout")`）。
- **行渲染**：[`UserCardsList.jsx`](../src/pages/userlist/components/UserCardsList.jsx) 在
  Last Login 单元格后面加一个新的 `card-item`，用上面两个格式化函数。
- **Owner 影子行不需要额外处理**：Admin User List 里合成的 Owner 行（`isOwnerShadow`）读的是
  同一个 `admin.lastLogin` / `admin.lastLogout` JSON 字段，本节改动天然覆盖它，不用为 Owner 单独
  写一套前端逻辑。
- **i18n**：[`userListTranslate.js`](../src/translateFile/pages/userListTranslate.js) 英文/中文
  各加一行 `lastLogout: "Last Logout"` / `"最后登出"`。

### CSS：9 列 grid 变成 10 列

原来的 `--user-list-grid-cols`（No / Login ID / Name / Email / Role / Status / Last Login /
Created By / Action，9 条轨道）在 Last Login 后面插入一条新轨道，Bulk-delete 变体
（`--user-list-grid-cols-bulk`）同样处理，尾部 48px 的勾选框轨道保持不变。

- [`userlist.css`](../public/css/userlist.css)：默认和中文（`body.lang-zh`）两套 grid 变量都改；
  `--list-table-min-width` 从 `1040px` 调到 `1150px`，避免新列把其他列挤窄。
- [`admin-responsive.css`](../public/css/admin-responsive.css)：窄屏（≤1440px 附近）断点的
  grid 变量同步加一条轨道；最小宽度从 `980px` 调到 `1090px`。
- [`global-13inch.css`](../public/css/global-13inch.css)：13 寸屏适配断点的 grid 变量（默认 +
  中文两套）同步加一条轨道。
- 新轨道宽度统一用跟 Last Login 相同的 `minmax(...)` 值（同一列的两个"时间列"给一样的空间）。
- 没有改动任何 `nth-child` 定位样式——Role/Status 相关的窄屏省略号规则用的是第 5/6 列，插入点在
  第 7 列之后，不影响它们的序号。

## 2. Account List（`src/pages/account/`）

- **格式化函数**：[`accountLogic.js`](../src/pages/account/accountLogic.js) 新增
  `formatAccountLastLogoutDate` / `formatAccountLastLogoutTimeTitle`，同样复用既有
  `parseAccountLastLogin` 的日期解析逻辑。
- **数据映射**：[`accountListApi.js`](../src/pages/account/accountListApi.js) 的
  `normalizeAccountListItem` 加 `last_logout: item.lastLogout ?? item.last_logout ?? null`。
- **页面接线**：[`AccountListPage.jsx`](../src/pages/account/AccountListPage.jsx)
  - 排序 `getValue` 加 `if (sortColumn === "lastLogout") return account.last_logout;`。
  - 表头在 Last Login 和 Remark 之间插入 `renderSortableHeader(t("lastLogout"), "lastLogout")`。
  - 行渲染在 Last Login 单元格后面加一个新的 `account-card-item`。
- **i18n**：[`accountTranslate.js`](../src/translateFile/pages/accountTranslate.js) 英文/中文各加
  `lastLogout: "Last Logout"` / `"最后登出"`。

### CSS：9 列 grid 变成 10 列

原来的 `--account-list-grid-cols`（No / Account / Name / Role / Alert / Status / Last Login /
Remark / Action）同样在 Last Login 后面插入一条轨道。

- [`accountCSS.css`](../public/css/accountCSS.css)：`--account-list-grid-cols` 和
  `--account-list-grid-cols-bulk` 都加一条轨道；`--list-table-min-width` 从 `980px` 调到
  `1090px`。
- [`global-13inch.css`](../public/css/global-13inch.css)：13 寸屏断点的
  `--account-list-grid-cols` 同步加一条轨道（这个断点原本没有单独的 bulk 变体覆盖，沿用
  `accountCSS.css` 里的）。
- 窄屏下 Role/Alert/Status 的 `nth-child(4)/(5)/(6)` 省略号规则同样不受影响（插入点在第 7 列
  之后）。

## 已知限制

- Last Logout 只有用户点"退出登录"按钮才会有值；关浏览器/token 过期不会记录，列表上会一直显示
  `-`。这是后端认证机制的限制，不是前端展示 bug（详见后端文档）。
- 这几处改动只在本地跑过 `vite build` 做语法检查，没有做像素级视觉回归；上线前建议实机过一遍
  Admin User List 和 Account List 在窄屏（≤1440px、13 寸屏）下的表格是否还对齐。
