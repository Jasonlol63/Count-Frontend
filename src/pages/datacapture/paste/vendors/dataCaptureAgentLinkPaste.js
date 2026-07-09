/** AGENT_LINK paste. */
import { detectHtmlTableInClipboard } from "../core/dataCaptureClipboard.js";
import { parseAgentLinkTableFormat } from "./dataCaptureAgentLinkParser.js";



import { applyParsedMatrixToGrid, parseGenericHtmlTable } from "../core/dataCapturePasteApply.js";
import { notifyPasteUser, recomputeSubmitStateAfterPaste } from "../../lib/dataCaptureBridge.js";

/** @returns {boolean} */
export function handleAgentLinkPaste(e, pastedData) {
        console.log('PS3838 mode detected, attempting to parse...');
        console.log('Pasted data length:', pastedData.length);
        console.log('Pasted data sample (first 500 chars):', pastedData.substring(0, 500));

        // 先尝试 HTML 表格解析（从网页复制的内容通常是 HTML 格式）
        // 优先使用现有的 parseAndFillHTMLTable 函数，它更可靠
        const htmlDataFromDetect = detectHtmlTableInClipboard(e);
        let agentLinkParsed = null;

        if (htmlDataFromDetect) {
            console.log('PS3838: HTML data detected via detectAndParseHTML');
            const startCell = e.target;
            const filled = parseGenericHtmlTable(htmlDataFromDetect, startCell);
            if (filled) {
                console.log('PS3838: Successfully filled using parseAndFillHTMLTable');
                recomputeSubmitStateAfterPaste();
                return true;
            } else {
                console.log('PS3838: parseAndFillHTMLTable returned false, trying manual HTML parsing');
            }
        }

        // 如果上面的方法失败，尝试手动解析HTML
        let htmlData = null;
        try {
            htmlData = e.clipboardData.getData('text/html');
            if (!htmlData || !htmlData.toLowerCase().includes('<table')) {
                htmlData = null;
            }
        } catch (err) {
            console.log('PS3838: Could not get HTML data from clipboard:', err);
        }

        if (htmlData) {
            console.log('PS3838: HTML data detected, length:', htmlData.length);
            console.log('PS3838: HTML data sample (first 500 chars):', htmlData.substring(0, 500));
            // 解析 HTML 表格
            try {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = htmlData;

                const table = tempDiv.querySelector('table');
                if (table) {
                    console.log('PS3838: HTML table found');
                    let dataMatrix = [];

                    // 处理表头（如果有）
                    const thead = table.querySelector('thead');
                    if (thead) {
                        const headerRows = thead.querySelectorAll('tr');
                        headerRows.forEach(tr => {
                            const row = [];
                            const cells = tr.querySelectorAll('th, td');
                            cells.forEach(cell => {
                                const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                                let text = cell.textContent || cell.innerText || '';
                                text = text.replace(/\s+/g, ' ').trim();
                                row.push(text);
                                for (let i = 1; i < colspan; i++) {
                                    row.push('');
                                }
                            });
                            if (row.length > 0) {
                                dataMatrix.push(row);
                            }
                        });
                    }

                    // 处理表体
                    let bodyContainer = table.querySelector('tbody');
                    if (!bodyContainer) {
                        bodyContainer = table;
                    }

                    const bodyRows = bodyContainer.querySelectorAll('tr');
                    bodyRows.forEach((tr) => {
                        // 跳过已经在 thead 中处理过的行
                        if (thead && tr.closest('thead')) {
                            return;
                        }

                        const row = [];
                        const cells = tr.querySelectorAll('td, th');
                        cells.forEach(cell => {
                            const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
                            let text = cell.textContent || cell.innerText || '';
                            text = text.replace(/\s+/g, ' ').trim();
                            row.push(text);
                            for (let i = 1; i < colspan; i++) {
                                row.push('');
                            }
                        });

                        // 检查是否是 Total 行，如果是且第一个单元格是 "Total"，需要插入3个空列
                        if (row.length > 0) {
                            const firstCell = row[0].trim().toUpperCase();
                            if (firstCell === 'TOTAL' && row.length > 1) {
                                // 检查第2、3、4个单元格是否都是空的（说明HTML已经正确）
                                // 如果第2个单元格有内容，说明需要插入3个空列
                                const secondCell = (row[1] || '').trim();
                                const thirdCell = (row[2] || '').trim();
                                const fourthCell = (row[3] || '').trim();

                                // 如果第2、3、4个单元格不全是空的，需要插入3个空列
                                if (secondCell !== '' || thirdCell !== '' || fourthCell !== '') {
                                    // 在 "Total" 后插入3个空列
                                    const totalValue = row[0];
                                    const restOfRow = row.slice(1);
                                    row.length = 0; // 清空数组
                                    row.push(totalValue);
                                    row.push('', '', ''); // 插入3个空列
                                    row.push(...restOfRow); // 添加剩余数据
                                }
                            }
                            dataMatrix.push(row);
                        }
                    });

                    if (dataMatrix.length > 0) {
                        // 确保所有行的列数相同
                        let maxCols = Math.max(...dataMatrix.map(row => row.length));
                        dataMatrix.forEach(row => {
                            while (row.length < maxCols) {
                                row.push('');
                            }
                        });

                        console.log('PS3838: HTML parsing successful -', dataMatrix.length, 'rows x', maxCols, 'cols');
                        console.log('PS3838: First row sample:', dataMatrix[0] ? dataMatrix[0].slice(0, 10) : 'empty');

                        agentLinkParsed = {
                            dataMatrix: dataMatrix,
                            maxRows: dataMatrix.length,
                            maxCols: maxCols
                        };
                    } else {
                        console.log('PS3838: HTML table found but no data rows extracted');
                    }
                } else {
                    console.log('PS3838: HTML data exists but no table element found');
                }
            } catch (htmlErr) {
                console.error('PS3838 HTML parser error:', htmlErr);
            }
        } else {
            console.log('PS3838: No HTML data detected, will try text parsing');
        }

        // 如果 HTML 解析失败，尝试纯文本解析
        if (!agentLinkParsed) {
            console.log('PS3838: Attempting text format parsing...');
            agentLinkParsed = parseAgentLinkTableFormat(pastedData);
            if (agentLinkParsed) {
                console.log('PS3838: Text parsing successful -', agentLinkParsed.maxRows, 'rows x', agentLinkParsed.maxCols, 'cols');
            } else {
                console.log('PS3838: Text parsing failed');
            }
        }

        if (agentLinkParsed) {
            const { dataMatrix, maxRows, maxCols } = agentLinkParsed;
            const { successCount } = applyParsedMatrixToGrid(dataMatrix, e.target, {
                startColOverride: 0,
                trimValues: true,
            });

            if (successCount > 0) {
                notifyPasteUser(`Successfully pasted PS3838 data (${maxRows} rows x ${maxCols} cols)!`, 'success');
            } else {
                notifyPasteUser('No cells were pasted from PS3838 format.', 'danger');
            }

            return true;
        } else {
            // PS3838 模式下解析失败，给出提示但不阻止（让用户知道）
            console.log('PS3838 parser returned null, data may not match expected format');
            // 不 return，继续尝试其他解析器
        }
  return false;
}

