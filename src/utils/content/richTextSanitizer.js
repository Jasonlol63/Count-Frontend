const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
]);

const DROP_WITH_CHILDREN = new Set(["script", "style", "iframe", "object", "embed", "link", "meta"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value ?? ""));
}

function sanitizeHref(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("#") || raw.startsWith("/")) return raw;
  try {
    const parsed = new URL(raw, window.location.origin);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:" || protocol === "tel:") {
      return parsed.href;
    }
  } catch {
    return "";
  }
  return "";
}

function sanitizeNode(node, documentRef) {
  if (node.nodeType === Node.TEXT_NODE) {
    return documentRef.createTextNode(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return documentRef.createDocumentFragment();
  }

  const tag = node.tagName.toLowerCase();
  if (DROP_WITH_CHILDREN.has(tag)) {
    return documentRef.createDocumentFragment();
  }

  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = documentRef.createDocumentFragment();
    Array.from(node.childNodes).forEach((child) => {
      fragment.appendChild(sanitizeNode(child, documentRef));
    });
    return fragment;
  }

  const el = documentRef.createElement(tag);
  if (tag === "a") {
    const safeHref = sanitizeHref(node.getAttribute("href"));
    if (safeHref) {
      el.setAttribute("href", safeHref);
      if (safeHref.startsWith("http")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    }
  }

  Array.from(node.childNodes).forEach((child) => {
    el.appendChild(sanitizeNode(child, documentRef));
  });

  return el;
}

export function plainTextToHtml(value) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return "";
  return normalized
    .split("\n")
    .map((line) => (line.trim() === "" ? "<p><br></p>" : `<p>${escapeHtml(line)}</p>`))
    .join("");
}

export function sanitizeRichTextHtml(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return plainTextToHtml(raw);
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${raw}</div>`, "text/html");
  const container = parsed.body.firstElementChild;
  if (!container) return "";

  const safeRoot = document.createElement("div");
  Array.from(container.childNodes).forEach((child) => {
    safeRoot.appendChild(sanitizeNode(child, document));
  });
  return safeRoot.innerHTML.trim();
}

export function normalizeRichTextInput(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  return looksLikeHtml(raw) ? sanitizeRichTextHtml(raw) : plainTextToHtml(raw);
}

export function extractPlainTextFromRichText(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  if (typeof window === "undefined" || typeof document === "undefined") {
    return raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const holder = document.createElement("div");
  holder.innerHTML = normalizeRichTextInput(raw);
  const text = (holder.innerText || holder.textContent || "").replace(/\u00a0/g, " ");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function isRichTextEffectivelyEmpty(value) {
  return extractPlainTextFromRichText(value).trim().length === 0;
}

export function toSafeRenderHtml(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  if (!looksLikeHtml(raw)) return plainTextToHtml(raw);
  return sanitizeRichTextHtml(raw);
}
