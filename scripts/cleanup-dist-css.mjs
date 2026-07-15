import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vite copies frontend/public/css → frontend/dist/css at build time.
 * Keep those files in dist so production can serve /frontend/dist/css/* when only
 * frontend/dist is deployed (Hostinger). Do not delete dist/css or rewrite links
 * to /frontend/public/css/ — that path requires a separate public/ deploy.
 */
const distCssDir = resolve(process.cwd(), "dist", "css");
const styleCss = resolve(distCssDir, "style.css");

if (!existsSync(styleCss)) {
  console.warn(
    "[cleanup] WARNING: dist/css/style.css missing after build. Login/secondary-password styles will not load in production.",
  );
} else {
  console.log("[cleanup] dist/css preserved for production (/frontend/dist/css/).");
}
