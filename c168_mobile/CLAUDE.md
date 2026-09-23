# c168_mobile — 移动端（与桌面版 `Count-frontend/src` 完全独立的两套前端）

> **这份文档要解决的第一件事**：搞清**移动端**和**电脑端（桌面版）**的边界。两者是同一 git 仓库里
> **两套完全独立的前端**，除了共享仓库与顶层 `.git` 历史，**没有代码层面的耦合**——不要在两者之间加
> 跨目录 `import`，也不要假设改了桌面版某个文件、移动端会跟着变。

## 目录结构

```
c168_mobile/
├── frontend/          # 移动端 SPA 本体（Vite + React），本仓库的 npm workspace 成员
│   ├── src/
│   │   ├── pages/      # 按功能模块分（domain/、account/、transaction/、member/ 等）
│   │   ├── hooks/       # useMobileXxx —— 每个模块一个数据/状态 hook
│   │   ├── lib/         # Xxx Api.js —— 每个模块自己的后端调用层（见下方"接线约定"）
│   │   ├── components/  # 跨页面共享的展示组件（Sheet/MobileShell 等）
│   │   └── translateFile/  # i18n 文案
│   ├── docs/            # 设计稿类文档（如 domain-mobile-design.html）
│   └── vite.config.js    # dev proxy：按 `.php` 后缀把请求分流到 Spring / 旧版 PHP，见文件内注释
├── docs/               # 迁移进度记录（c168-mobile-springboot-api-audit.md），见下
└── app/                # Capacitor Android 壳工程（打包 frontend/dist 成 APK），独立的 npm 项目
```

## 接线约定（PHP → Spring Boot 迁移进行中）

这个项目正在从旧版 PHP 后端迁移到 `Count/backend`（Spring Boot）。约定是**复制桌面版
`Count-frontend/src` 里已经写好的调用逻辑到这里自己的 `lib/`，不跨包 import 共享源码**——
两边各自维护一份，字段映射/normalize 规则照抄但物理上是两份文件。原因：两边的 UI 数据形状
不完全一样，跨包共享反而会互相牵制迭代。

判断一个 `lib/xxxApi.js` 文件是不是已经迁移完，看它调用的路径：
- **没有 `.php` 后缀**（如 `api/domain/list`）→ 已经是 Spring 端点
- **带 `.php` 后缀**（如 `api/editdata/editdata_api.php`）→ 还是旧版 PHP，没迁移

**完整的迁移进度、每个模块的端点对照表、已知的遗留 PHP 调用清单，都在**
[`docs/c168-mobile-springboot-api-audit.md`](./docs/c168-mobile-springboot-api-audit.md)
（本目录下的 `docs/`，跟 `frontend/docs/` 里那批设计稿分开）——这是唯一权威来源，不要在本文件里
重复记录模块状态，改动了就去更新那份文档。

## 本地开发

```bash
npm install                          # 在仓库根目录跑一次即可（workspace 会一并装好 frontend/ 的依赖）
npm run dev --workspace=c168_mobile/frontend   # 或直接 cd c168_mobile/frontend && npm run dev
```

Dev server 固定在 `5174` 端口（`vite.config.js` 里 `strictPort: true`），同时代理两个后端：
- 不带 `.php` 的 `/api`、`/auth`、`/ws` → Spring Boot（默认 `127.0.0.1:8082`，可用
  `VITE_SPRING_PROXY_TARGET` 覆盖）
- 带 `.php` 后缀的路径 + `/images`、`/js` → 旧版 PHP（默认 `127.0.0.1:8000`，可用
  `VITE_PHP_PROXY_TARGET` 覆盖，起 PHP server 用 `npm run dev:php`）
  > 注意：`/dashboard.php`、`/member.php`、`/reset-password` 三条旧代理已于 2026-09-22 删除
  > （前两条是 SPA 化前的老页面、无人请求；第三条会遮蔽移动端自己的 `/reset-password` 路由）。

## 线上部署

`c168_mobile/.htaccess` 把 `/c168_mobile/*` 路由限定到 `frontend/dist/`，跟桌面版的路由规则
（仓库根 `dist/.htaccess`）完全分开，两边构建产物也输出到各自独立的 `dist/` 目录，互不覆盖。
