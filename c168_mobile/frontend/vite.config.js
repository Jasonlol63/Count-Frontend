import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Cloudflare Rocket Loader breaks Vite ES modules on count168.site */
function cloudflareModuleFix() {
  return {
    name: "cloudflare-module-fix",
    transformIndexHtml(html) {
      return html
        .replace(
          /<script type="module"(?![^>]*data-cfasync)/g,
          '<script type="module" data-cfasync="false"',
        )
        .replace(
          /<link rel="stylesheet"(?![^>]*data-cfasync)/g,
          '<link rel="stylesheet" data-cfasync="false"',
        );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const phpTarget = env.VITE_PHP_PROXY_TARGET || "http://127.0.0.1:8000";
  const springTarget = env.VITE_SPRING_PROXY_TARGET || "http://127.0.0.1:8082";

  return {
    plugins: [react(), tailwindcss(), cloudflareModuleFix()],
    base: mode === "production" ? "/c168_mobile/frontend/dist/" : "/",
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        // Mid-migration split: Spring endpoints never carry a `.php` suffix, legacy PHP
        // endpoints always do — route by that, not by a fixed prefix, since both live
        // under /api. Regex rules (leading `^`) are matched in the order Vite is given
        // them, so this must come before the generic "/api" rule below.
        "^/api/.*\\.php": { target: phpTarget, changeOrigin: true },
        "/api": { target: springTarget, changeOrigin: true },
        "/auth": { target: springTarget, changeOrigin: true },
        "/ws": { target: springTarget, changeOrigin: true, ws: true },
        // `/dashboard.php`, `/member.php` and `/reset-password` used to be proxied to PHP here.
        // The first two were the pre-SPA pages and nothing has requested them for a long time; the
        // third shadowed mobile's own `/reset-password` SPA route, so a hard reload of that page
        // went to PHP instead of the React app. Reset Password now lives at that route and talks to
        // `/auth/*` (see pages/login/ResetPasswordPage.jsx).
        //
        // `/images` and `/js` stay on PHP: they are static assets shared from the PHP site root
        // (`c168_mobile/.htaccess`: "shares api/, includes/, images/ at site root"), which is an
        // asset-hosting dependency rather than an API one.
        "/images": { target: phpTarget, changeOrigin: true },
        "/js": { target: phpTarget, changeOrigin: true },
        // Realtime is STOMP over the backend's /ws endpoint (see the "/ws" rule above). The
        // legacy SSE hub (`services/tx-realtime`, port 3911) and its `/realtime` proxy were
        // removed with the Phase 3 rewrite — nothing calls the SSE ticket endpoint any more.
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
