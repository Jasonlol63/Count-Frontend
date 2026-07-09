/**
 * Route / feature CSS only (e.g. userlist.css, processCSS.css). Never use for app-shell
 * (dashboard, sidebar, global-13inch) — those load via main.jsx → app-shell.css.
 * Dedup: same pathname = one <link> (ignores ?query).
 */
export function stylesheetPathKey(href) {
  try {
    const u = new URL(href, window.location.origin);
    let p = u.pathname.replace(/\/+$/, "") || "/";
    if (!p.startsWith("/")) p = `/${p}`;
    return p;
  } catch {
    return String(href || "").split(/[?#]/)[0];
  }
}

/**
 * @param {string} href
 * @param {{ promoteToEnd?: boolean }} [opts] — if link already exists, move it to end of &lt;head&gt; (override order)
 */
export function injectStylesheet(href, opts = {}) {
  return new Promise((resolve) => {
    if (!href) {
      resolve();
      return;
    }
    const key = stylesheetPathKey(href);
    const nodes = document.querySelectorAll('link[rel="stylesheet"]');
    for (let i = 0; i < nodes.length; i += 1) {
      try {
        if (stylesheetPathKey(nodes[i].href) === key) {
          if (opts.promoteToEnd) document.head.appendChild(nodes[i]);
          resolve();
          return;
        }
      } catch {
        /* ignore */
      }
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}
