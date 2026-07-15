import {
  normalizeRichTextInput,
  sanitizeRichTextHtml,
} from "../../utils/content/richTextSanitizer.js";

const SECTION_HINT_RE = /本次更新|this update includes/i;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Split a stored announcement HTML into optional list-section label + body.
 * Label is taken from a leading h2–h4, or a short leading paragraph that looks like a section title.
 */
export function splitAnnouncementSection(html) {
  const safe = normalizeRichTextInput(html);
  if (!safe || typeof DOMParser === "undefined") {
    return { sectionLabel: "", bodyHtml: safe };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="root">${safe}</div>`, "text/html");
  const root = doc.getElementById("root");
  if (!root) return { sectionLabel: "", bodyHtml: safe };

  const firstEl = Array.from(root.children).find((el) => decodeText(el.textContent));
  if (!firstEl) return { sectionLabel: "", bodyHtml: safe };

  const tag = firstEl.tagName.toLowerCase();
  const text = decodeText(firstEl.textContent);
  const isHeading = /^h[2-4]$/.test(tag);
  const isHintParagraph = tag === "p" && text.length > 0 && text.length <= 40 && SECTION_HINT_RE.test(text);

  if (!isHeading && !isHintParagraph) {
    return { sectionLabel: "", bodyHtml: safe };
  }

  firstEl.remove();
  return {
    sectionLabel: text.slice(0, 80),
    bodyHtml: root.innerHTML.trim(),
  };
}

/** Rebuild HTML for API save: optional section label as leading h3 + body. */
export function composeAnnouncementSection(sectionLabel, bodyHtml) {
  const label = decodeText(sectionLabel).slice(0, 80);
  const { bodyHtml: strippedBody } = splitAnnouncementSection(bodyHtml);
  const body = sanitizeRichTextHtml(strippedBody || bodyHtml);
  if (!label) return body;
  return `<h3>${escapeHtml(label)}</h3>${body}`;
}
