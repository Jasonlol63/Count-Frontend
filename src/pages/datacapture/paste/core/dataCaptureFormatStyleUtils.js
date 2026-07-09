/** Ported from js/datacapture.js — 2.Format style sanitization (Phase 4c). */

export function sanitizeCopiedStyleString(styleString) {
    if (!styleString) return '';
    const blocked = new Set([
        'position',
        'top',
        'left',
        'right',
        'bottom',
        'z-index',
        'float',
        'transform'
    ]);

    const parts = String(styleString).split(';')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(decl => {
            const idx = decl.indexOf(':');
            const prop = (idx >= 0 ? decl.slice(0, idx) : decl).trim().toLowerCase();
            return !blocked.has(prop);
        });

    return parts.length ? (parts.join('; ') + ';') : '';
}

/** 2.Format模式：从样式字符串中移除背景相关属性，使粘贴后数据格无背景色 */
export function stripBackgroundFromStyle(styleString) {
    if (!styleString || !String(styleString).trim()) return '';
    return String(styleString)
        .replace(/\s*background-color\s*:[^;]*;?/gi, '')
        .replace(/\s*background\s*:[^;]*;?/gi, '')
        .trim().replace(/;\s*$/, '');
}

// 2.Format：清洗HTML片段，移除class/id，并过滤style里的布局属性（保留颜色/下划线/背景等）
export function sanitizeFormatHtmlFragment(html) {
    if (!html) return '';
    try {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = String(html);

        const all = wrapper.querySelectorAll('*');
        all.forEach(el => {
            el.removeAttribute('class');
            el.removeAttribute('id');
            const styleAttr = el.getAttribute('style');
            if (styleAttr) {
                const sanitized = sanitizeCopiedStyleString(styleAttr);
                if (sanitized) el.setAttribute('style', sanitized);
                else el.removeAttribute('style');
            }
        });

        return wrapper.innerHTML;
    } catch (_) {
        return String(html);
    }
}
