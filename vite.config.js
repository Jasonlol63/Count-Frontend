import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const springTarget = env.VITE_SPRING_PROXY_TARGET || "http://127.0.0.1:8082";

  return {
    plugins: [
      react(),
      {
        name: "legacy-deleted-log-redirect",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const raw = req.url || "";
            const pathname = raw.split("?")[0] || "";
            if (pathname === "/deleted-log.php" || pathname === "/deleted_log.php") {
              const q = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
              res.statusCode = 302;
              res.setHeader("Location", `/p/3f5cf41e-53c2-45c5-a2c2-92e26352d8a1${q}`);
              res.end();
              return;
            }
            next();
          });
        },
      },
    ],
    base: mode === "production" ? "/frontend/dist/" : "/",
    server: {
      proxy: {
        "/auth": { target: springTarget, changeOrigin: true },
        "/api": { target: springTarget, changeOrigin: true },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
