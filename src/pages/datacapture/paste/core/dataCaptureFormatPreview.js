/** Ported from js/datacapture.js — 2.Format preview helpers (Phase 4c). */

import { setFormatPreviewHtml } from '../../format/dataCaptureFormat.js';

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function sanitizePastedHTML(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = String(html)
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/javascript:/gi, '');

    const getTopLevelTables = (root) => Array.from(root.querySelectorAll('table')).filter(t => {
        const parentTable = t.parentElement ? t.parentElement.closest('table') : null;
        return !parentTable;
    });

    const getRowKey = (tr) => {
        if (!tr) return '';
        const first = Array.from(tr.children || []).find(el => {
            const tag = (el.tagName || '').toUpperCase();
            return tag === 'TD' || tag === 'TH';
        });
        return (first && first.textContent ? first.textContent : '').trim();
    };

    const pickLargestTable = (root) => {
        const tables = getTopLevelTables(root);
        if (tables.length === 0) return null;
        let best = tables[0];
        let bestScore = -1;
        tables.forEach(t => {
            const score = t.querySelectorAll('td, th').length;
            if (score > bestScore) {
                bestScore = score;
                best = t;
            }
        });
        return best;
    };

    const getTableRows = (table) => Array.from(table.querySelectorAll('tr'));
    const getDirectCells = (tr) => Array.from(tr.children || []).filter(el => {
        const tag = (el.tagName || '').toUpperCase();
        return tag === 'TD' || tag === 'TH';
    });
    const cellText = (cell) => (cell && cell.textContent ? cell.textContent : '').trim();

    const mergeTablesSideBySide = (leftTable, rightTable) => {
        const leftRows = getTableRows(leftTable);
        const rightRows = getTableRows(rightTable);
        const rowCount = Math.max(leftRows.length, rightRows.length);

        const merged = document.createElement('table');
        const tbody = document.createElement('tbody');
        merged.appendChild(tbody);

        for (let i = 0; i < rowCount; i++) {
            const tr = document.createElement('tr');
            const lRow = leftRows[i];
            const rRow = rightRows[i];

            const lCells = lRow ? getDirectCells(lRow) : [];
            const rCells = rRow ? getDirectCells(rRow) : [];

            // Avoid duplicated row index if both sides include it
            let rStart = 0;
            if (lCells.length && rCells.length) {
                const lt = cellText(lCells[0]);
                const rt = cellText(rCells[0]);
                if (lt && rt && lt === rt && (/^\d+$/.test(lt) || /^total$/i.test(lt))) {
                    rStart = 1;
                }
            }

            lCells.forEach(c => tr.appendChild(c.cloneNode(true)));
            rCells.slice(rStart).forEach(c => tr.appendChild(c.cloneNode(true)));
            tbody.appendChild(tr);
        }

        return merged;
    };

    const rowKeySet = (table) => {
        const keys = new Set();
        getTableRows(table).forEach(tr => {
            const k = getRowKey(tr);
            if (k) keys.add(k);
        });
        return keys;
    };

    const intersectionSize = (a, b) => {
        let cnt = 0;
        a.forEach(v => { if (b.has(v)) cnt++; });
        return cnt;
    };

    const mergeTablesSideBySideByKey = (leftTable, rightTable) => {
        const leftRows = getTableRows(leftTable);
        const rightRows = getTableRows(rightTable);

        const leftMap = new Map();
        leftRows.forEach((tr, idx) => {
            const k = getRowKey(tr) || `__idx_${idx}`;
            leftMap.set(k, tr);
        });

        const rightMap = new Map();
        rightRows.forEach((tr, idx) => {
            const k = getRowKey(tr) || `__idx_${idx}`;
            rightMap.set(k, tr);
        });

        const merged = document.createElement('table');
        const tbody = document.createElement('tbody');
        merged.appendChild(tbody);

        const allKeys = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()]));
        allKeys.forEach(k => {
            const lRow = leftMap.get(k);
            const rRow = rightMap.get(k);
            const tr = document.createElement('tr');

            const lCells = lRow ? getDirectCells(lRow) : [];
            const rCellsAll = rRow ? getDirectCells(rRow) : [];

            let rCells = rCellsAll;
            if (lCells.length && rCellsAll.length) {
                const lt = cellText(lCells[0]);
                const rt = cellText(rCellsAll[0]);
                if (lt && rt && lt === rt) {
                    rCells = rCellsAll.slice(1);
                }
            }

            lCells.forEach(c => tr.appendChild(c.cloneNode(true)));
            rCells.forEach(c => tr.appendChild(c.cloneNode(true)));
            tbody.appendChild(tr);
        });

        return merged;
    };

    const pickBestMergedTable = (root) => {
        const tables = getTopLevelTables(root);
        if (tables.length === 0) return null;
        if (tables.length === 1) return tables[0];

        // Best single
        const single = pickLargestTable(root);
        const singleScore = single ? single.querySelectorAll('td, th').length : 0;

        // Best pair merge (fixed-table copy often yields 2 side-by-side tables)
        // Prefer tables that share the most row keys (more reliable than raw cell count)
        let bestPair = null;
        let bestShared = -1;
        for (let i = 0; i < tables.length; i++) {
            for (let j = i + 1; j < tables.length; j++) {
                const a = tables[i], b = tables[j];
                const aRows = getTableRows(a).length;
                const bRows = getTableRows(b).length;
                if (aRows < 2 || bRows < 2) continue;
                if (Math.abs(aRows - bRows) > 3) continue;
                const shared = intersectionSize(rowKeySet(a), rowKeySet(b));
                if (shared > bestShared) {
                    bestShared = shared;
                    bestPair = [a, b];
                }
            }
        }

        // Use merged if it clearly contains more cells than any single
        if (bestPair && bestShared > 0) {
            // Merge by row-key alignment first (handles header/total better)
            const merged = mergeTablesSideBySideByKey(bestPair[0], bestPair[1]);
            const mergedScore = merged.querySelectorAll('td, th').length;
            if (mergedScore > singleScore) return merged;
            // fallback to index-based merge
            return mergeTablesSideBySide(bestPair[0], bestPair[1]);
        }

        return single;
    };

    // 只保留“最像主表/合并后的主表”
    const tableOrMerged = pickBestMergedTable(temp);
    if (!tableOrMerged) return '';
    const table = tableOrMerged;

    // 清除会把table“顶到页面最上面”的定位类样式
    const stripPosStyles = (el) => {
        try {
            if (!el || !el.style) return;
            el.style.removeProperty('position');
            el.style.removeProperty('top');
            el.style.removeProperty('left');
            el.style.removeProperty('right');
            el.style.removeProperty('bottom');
            el.style.removeProperty('z-index');
            el.style.removeProperty('float');
            el.style.removeProperty('transform');
        } catch (_) { }
    };

    stripPosStyles(table);
    table.querySelectorAll('*').forEach(el => {
        // 也移除class/id，避免外部CSS（例如fixedDataTable...）影响布局
        try {
            el.removeAttribute('class');
            el.removeAttribute('id');
        } catch (_) { }
        stripPosStyles(el);
        // 同步过滤style属性字符串（以防复制出来是style属性而不是CSSStyleDeclaration）
        try {
            const styleAttr = el.getAttribute && el.getAttribute('style');
            if (styleAttr) {
                const sanitized = sanitizeCopiedStyleString(styleAttr);
                if (sanitized) el.setAttribute('style', sanitized);
                else el.removeAttribute('style');
            }
        } catch (_) { }
    });

    try {
        table.removeAttribute('class');
        table.removeAttribute('id');
        const tableStyle = table.getAttribute('style');
        if (tableStyle) {
            const sanitized = sanitizeCopiedStyleString(tableStyle);
            if (sanitized) table.setAttribute('style', sanitized);
            else table.removeAttribute('style');
        }
    } catch (_) { }

    return table.outerHTML;
}

export function extractClipboardHtmlFragment(rawHtml) {
    const s = String(rawHtml || '');
    const start = s.search(/<!--\s*StartFragment\s*-->/i);
    const end = s.search(/<!--\s*EndFragment\s*-->/i);
    if (start >= 0 && end > start) {
        return s.slice(start, end).replace(/<!--\s*StartFragment\s*-->/i, '');
    }
    return s;
}

export function buildFormatPreviewFragmentFromClipboardHtml(rawHtml) {
    if (!rawHtml) return '';
    try {
        const fragmentHtml = extractClipboardHtmlFragment(rawHtml);
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(rawHtml), 'text/html');
        const fragDoc = parser.parseFromString(String(fragmentHtml), 'text/html');

        // Remove scripts
        doc.querySelectorAll('script').forEach(n => n.remove());
        fragDoc.querySelectorAll('script').forEach(n => n.remove());

        // Remove event handlers + javascript: URLs
        doc.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes || []).forEach(attr => {
                if (/^on/i.test(attr.name)) {
                    el.removeAttribute(attr.name);
                }
                if ((attr.name === 'href' || attr.name === 'src') && /^javascript:/i.test(attr.value || '')) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        fragDoc.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes || []).forEach(attr => {
                if (/^on/i.test(attr.name)) {
                    el.removeAttribute(attr.name);
                }
                if ((attr.name === 'href' || attr.name === 'src') && /^javascript:/i.test(attr.value || '')) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        // 预览目标：尽量“原样还原你复制的Table Format”，因此：
        // - 保留原始<style>（Excel/第三方表格常用class + style块定义颜色/对齐）
        // - 直接渲染StartFragment的body内容（可能包含左右两张table的wrapper结构）
        const styles = Array.from(doc.querySelectorAll('style'))
            .map(s => s.outerHTML)
            .join('\n');

        const fragmentBody = (fragDoc && fragDoc.body) ? (fragDoc.body.innerHTML || '') : '';
        return `${styles}\n${fragmentBody}`;
    } catch (_) {
        // Fallback: at least return the original html (caller may still render something)
        return String(rawHtml);
    }
}

export function tsvToHtmlTable(tsv) {
    const raw = String(tsv || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = raw.split('\n').filter(l => l !== '');
    const rows = lines.map(line => line.split('\t'));
    if (rows.length === 0) return '';
    let html = '<table><tbody>';
    rows.forEach(r => {
        html += '<tr>';
        r.forEach(c => {
            html += `<td>${escapeHtml(c)}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

export function clipboardLooksLikeTable(clipboard) {
    // 先用types判断（某些浏览器在某些阶段getData会返回空/抛错）
    try {
        const types = (clipboard && clipboard.types) ? Array.from(clipboard.types) : [];
        // 如果连text/plain都没有，大概率不是表格粘贴
        if (types.length > 0 && !types.includes('text/plain') && !types.includes('text/html')) {
            return false;
        }
    } catch (_) { }
    try {
        const html = (clipboard && clipboard.getData) ? (clipboard.getData('text/html') || '') : '';
        if (html && /<table\b/i.test(html)) return true;
    } catch (_) { }
    try {
        const text = (clipboard && clipboard.getData) ? (clipboard.getData('text/plain') || '') : '';
        if (text && text.includes('\t') && (text.includes('\n') || text.includes('\r'))) return true;
    } catch (_) { }
    return false;
}

export function renderFormatPreview(tableHtml) {
    const frame = document.getElementById('tablePreviewFrameFormat');
    if (!frame) {
        console.error('Format: tablePreviewFrameFormat not found');
        return;
    }

    const safeTable = tableHtml ? String(tableHtml) : '';
    console.log('Format: renderFormatPreview called, tableHtml length:', safeTable.length);

    // Cache preview HTML for restore/back flow (sessionStorage via dataCaptureFormat)
    try {
        setFormatPreviewHtml(safeTable);
    } catch (_) { }

    const docHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      body { font-family: Arial, sans-serif; font-size: 12px; }
      .wrap { padding: 10px; overflow: auto; width: 100vw; height: 100vh; box-sizing: border-box; background: #fff; }
      /* 不覆盖你复制出来的对齐/样式；仅做最小化默认 */
      table { border-collapse: collapse; }
    </style>
  </head>
  <body>
    <div class="wrap">${safeTable}</div>
  </body>
</html>`;

    // 确保预览容器可见
    const previewContainer = document.getElementById('tablePreviewFormat');
    if (previewContainer) {
        previewContainer.style.display = 'block';
        console.log('Format: Preview container set to block in renderFormatPreview');
        setFormatPreviewHtml(safeTable);
    }

    // Prefer srcdoc (works in modern browsers)
    try {
        frame.srcdoc = docHtml;
        console.log('Format: Frame srcdoc set successfully');
        // 等待 iframe 加载完成
        frame.onload = function () {
            console.log('Format: Frame loaded successfully');
        };
    } catch (e) {
        console.error('Format: Error setting srcdoc:', e);
        try {
            const doc = frame.contentDocument || frame.contentWindow.document;
            doc.open();
            doc.write(docHtml);
            doc.close();
            console.log('Format: Frame content written via contentDocument');
        } catch (e2) {
            console.error('Format: Error writing to contentDocument:', e2);
        }
    }
}

