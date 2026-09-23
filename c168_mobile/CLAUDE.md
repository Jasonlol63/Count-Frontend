# c168_mobile

C168 的独立移动端 SPA + Capacitor Android 壳工程。跟仓库里的桌面版 `Count-frontend/src`
是**两套完全独立的前端**，除了共享这个 git 仓库和顶层 `.git` 历史，没有代码层面的耦合——
不要在两者之间加跨目录 `import`，也不要假设改了桌面版某个文件、mobile 会跟着变。

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
│   ├── docs/            # mobile 专属设计稿类文档（跟迁移进度文档分开，见下）
│   └── vite.config.js    # dev proxy：按 `.php` 后缀把请求分流到 Spring / 旧版 PHP，见文件内注释
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
[`docs/c168-mobile-springboot-api-audit.md`](../docs/c168-mobile-springboot-api-audit.md)
（仓库根目录的 `docs/`，不是这里的 `frontend/docs/`）——这是唯一权威来源，不要在这份
CLAUDE.md 里重复记录模块状态，改动了就去更新那份文档。

## 本地开发

```bash
npm install                          # 在仓库根目录跑一次即可（workspace 会一并装好 frontend/ 的依赖）
npm run dev --workspace=c168_mobile/frontend   # 或直接 cd c168_mobile/frontend && npm run dev
```

Dev server 固定在 `5174` 端口（`vite.config.js` 里 `strictPort: true`），同时代理两个后端：
- 不带 `.php` 的 `/api`、`/auth`、`/ws` → Spring Boot（默认 `127.0.0.1:8082`，可用
  `VITE_SPRING_PROXY_TARGET` 覆盖）
- 带 `.php` 后缀的路径 + `/dashboard.php`/`/member.php`/`/images`/`/js` 等 → 旧版 PHP
  （默认 `127.0.0.1:8000`，可用 `VITE_PHP_PROXY_TARGET` 覆盖，起 PHP server 用
  `npm run dev:php`）

## 线上部署

`c168_mobile/.htaccess` 把 `/c168_mobile/*` 路由限定到 `frontend/dist/`，跟桌面版的路由规则
（仓库根 `dist/.htaccess`）完全分开，两边构建产物也输出到各自独立的 `dist/` 目录，互不覆盖。
