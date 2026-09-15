# 登录页 Telegram 客服按钮 + 管理端 Contact 配置

> **范围**：登录页新增一个可选的悬浮 Telegram 按钮，链接由管理员在 Announcement 页面新增的
> **Contact** 分页里维护。这是一个全新功能，不是 PHP 迁移——后端是全新实现（见
> `Count/docs/telegram-support-link.md`）。
> **最后更新**：2026-09-15

---

## 1. 需求

登录页右下角要有一个 Telegram 客服入口，点击直接跳转到客服团队的 Telegram。这个链接不是写死的——
管理员要能自己在后台改，改完立刻对所有登录页生效，不需要重新部署前端。链接是**全局唯一一条**（不分
Company/Group），因为客服团队是平台方统一的。

---

## 2. 前端改动

| 文件 | 改动 |
|------|------|
| [`contactSettingsApi.js`](../src/pages/announcement/contactSettingsApi.js) | 新建，`fetchTelegramLink()` / `saveTelegramLink()`，跟 `announcementApi.js` 同一套 `getJson`/`postJson` 封装 |
| [`ContactSettingsPanel.jsx`](../src/pages/announcement/components/ContactSettingsPanel.jsx) | 新建，管理端的表单 + 状态展示面板 |
| [`AnnouncementPage.jsx`](../src/pages/announcement/AnnouncementPage.jsx) | `PagePillTabSwitch` 加第三个 tab `contact`，接入面板 |
| [`announcementTranslate.js`](../src/translateFile/pages/announcementTranslate.js) | 补齐 Contact 分页的中英文案 |
| [`LoginPage.jsx`](../src/pages/login/LoginPage.jsx) | 新增 `useEffect` 拉取 `api/settings/getTelegramLink`（公开接口，未登录也能调），有值才渲染悬浮按钮 |
| [`telegram-contact.css`](../public/css/telegram-contact.css) | 新建，登录页悬浮按钮 + Contact 面板样式**单独成文件**（用户明确要求这部分 CSS 不要混进 `announcement.css`/`login-shadcn.css`），在 [`index.html`](../index.html) 里全局 `<link>` 引入 |
| [`page-pill-tabs.css`](../public/css/page-pill-tabs.css) | 补了 `--count-3` 和 `.is-index-2` 两条规则（原来只支持 2 个 tab，见第 4 节） |

---

## 3. 管理端 Contact 面板设计

左右两栏布局，**直接复用 `.maintenance-layout`/`.maintenance-form-section`/`.maintenance-list-section`
这几个现成 class**，跟 Announcement/Maintenance 两个 tab 视觉上是同一套模板，不是独立设计的小卡片
（第一版做成独立卡片后被反馈"和别的 tab 比例不一致，看着很怪"，改成完全复用现成布局后解决）。

- **左栏**：标准 `form-group` 输入框 + `submit-btn`
- **右栏**：状态卡片，复用 `.maintenance-item`/`.maintenance-content`/`.announcement-meta`，展示当前
  生效链接、Active/Hidden 状态徽章、"Test link"（新开标签页验证）、`UPDATED BY`/`UPDATED AT`
  （仿照公告卡片的 `CREATED BY`/`CREATED AT` 元信息行）
- 未设置链接时右栏显示 `.empty-state`（和"暂无公告"一样的空状态文案）

### 固定域名前缀

输入框左边是不可编辑的灰色 `https://t.me/` 前缀（`.contact-link-prefix`），管理员只需要填用户名部分。
`toHandle()` 归一化函数在 `onChange` 时自动剥离用户粘贴内容里可能带的 `https://t.me/`、`t.me/`、`@`
前缀，只留纯用户名；提交时前端再拼回完整链接发给后端。校验规则相应改成只校验 handle 字符
（`^[A-Za-z0-9_+]{1,64}$`，`+` 是为了兼容私密邀请链接 `t.me/+AbCdEf` 这种格式）。

---

## 4. Tab 切换组件的 bug：3 个 tab 时滑块糊字

`PagePillTabSwitch` 会按 tab 数量生成 `page-tabs--count-{N}` 和 `is-index-{N}` class，但
`page-pill-tabs.css` 原来写死只支持 2 个 tab：

```css
/* 原来只有这些 */
.page-tabs--count-2 { --page-pill-tab-count: 2; }
.page-tabs.is-index-1 { --page-pill-thumb-x: 100%; }
```

加第三个 tab 后，`--page-pill-tab-count` 没有 `count-3` 的定义退回默认值 2，滑块按"两个 tab"算成
50% 宽；切到 Contact（index=2）时也没有 `is-index-2` 规则把滑块移过去，滑块卡在 Maintenance 和
Contact 中间，文字被盖住糊在一起。补了这两条规则（`--page-pill-tab-count: 3` /
`--page-pill-thumb-x: 200%`，只作用于 `body.announcement-page`）后正常。

---

## 5. 已知缺口

- **未做端到端真实登录测试**：Contact 分页需要管理员登录才能访问，这次会话里没有测试账号，只验证到
  `GET /api/settings/getTelegramLink` 返回 200、Vite 编译无报错、tab 滑块位置正确。保存链接 →
  刷新登录页看到按钮这条完整链路需要人工用真实账号跑一遍。
- 没有做移动端悬浮按钮遮挡输入框/其他元素的实际设备测试，只在 CSS 里加了 `@media (max-width: 640px)`
  缩小尺寸。

---

## 6. 参考文件

- [`ContactSettingsPanel.jsx`](../src/pages/announcement/components/ContactSettingsPanel.jsx)
- [`contactSettingsApi.js`](../src/pages/announcement/contactSettingsApi.js)
- [`AnnouncementPage.jsx`](../src/pages/announcement/AnnouncementPage.jsx)
- [`LoginPage.jsx`](../src/pages/login/LoginPage.jsx)
- [`telegram-contact.css`](../public/css/telegram-contact.css)
- [`page-pill-tabs.css`](../public/css/page-pill-tabs.css)
- [`announcementTranslate.js`](../src/translateFile/pages/announcementTranslate.js)
- 后端对应文档：`Count/docs/telegram-support-link.md`
