import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Vite copies public/css → dist/css at build time.
 * Keep those files in dist so production can serve /frontend/dist/css/* when only
 * dist/ is deployed. Do not delete dist/css or rewrite links to /public/css/.
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
