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
        // Full API migration to Spring Boot is done (see docs/c168-mobile-springboot-api-audit.md
        // §22 — the last live PHP call, frankfurterRates.js's fx_rates_api.php, was replaced by
        // Spring's /api/fx/rates the same day). No `.php`-suffix routing rule is needed any more:
        // every `/api`, `/auth`, `/ws` request goes straight to Spring.
        "/api": { target: springTarget, changeOrigin: true },
        "/auth": { target: springTarget, changeOrigin: true },
        "/ws": { target: springTarget, changeOrigin: true, ws: true },
        // `/images` and `/js` stay on PHP: they are static assets shared from the PHP site root
        // (`c168_mobile/.htaccess`: "shares api/, includes/, images/ at site root"), an
        // asset-hosting dependency unrelated to the API migration — nothing to move here.
        "/images": { target: phpTarget, changeOrigin: true },
        "/js": { target: phpTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
