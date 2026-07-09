/**
 * Excel 复制保留表格样式（对齐 js/transaction.js initExcelCopyWithStyles）。
 * 仅处理 .transaction-table / .transaction-summary-table 内选中区域。
 */
export function installTransactionExcelCopy() {
  const onCopy = (e) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const table = range.commonAncestorContainer.closest?.("table");

    if (!table || (!table.classList.contains("transaction-table") && !table.classList.contains("transaction-summary-table"))) {
      return;
    }

    e.preventDefault();

    const selectedRows = [];

    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    let startRow = startContainer.nodeType === Node.TEXT_NODE ? startContainer.parentElement.closest("tr") : startContainer.closest("tr");
    let endRow = endContainer.nodeType === Node.TEXT_NODE ? endContainer.parentElement.closest("tr") : endContainer.closest("tr");

    if (!startRow && !endRow) {
      const cells = table.querySelectorAll("td, th");
      cells.forEach((cell) => {
        if (range.intersectsNode(cell)) {
          const row = cell.closest("tr");
          if (row && !selectedRows.includes(row)) {
            selectedRows.push(row);
          }
        }
      });
    } else {
      const allRows = Array.from(table.querySelectorAll("tr"));
      const startIndex = startRow ? allRows.indexOf(startRow) : 0;
      const endIndex = endRow ? allRows.indexOf(endRow) : allRows.length - 1;
      const minIndex = Math.min(startIndex, endIndex);
      const maxIndex = Math.max(startIndex, endIndex);
      for (let i = minIndex; i <= maxIndex; i += 1) {
        const row = allRows[i];
        if (row) selectedRows.push(row);
      }
    }

    if (selectedRows.length === 0) return;

    let html =
      '<html><body><table style="border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; font-size: small;">';

    function rgbToHex(rgb) {
      if (!rgb || rgb === "transparent" || rgb === "rgba(0, 0, 0, 0)") {
        return "#ffffff";
      }
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
      if (match) {
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        return (
          "#" +
          [r, g, b]
            .map((x) => {
              const hex = x.toString(16);
              return hex.length === 1 ? `0${hex}` : hex;
            })
            .join("")
        );
      }
      return rgb;
    }

    selectedRows.forEach((row) => {
      html += "<tr>";
      const cells = row.querySelectorAll("td, th");
      cells.forEach((cell) => {
        const isHeader = cell.tagName === "TH";
        const isFooter = row.closest("tfoot") !== null;
        const isAlertRow = row.classList.contains("transaction-alert-row");

        const computedStyle = window.getComputedStyle(cell);
        let bgColor = computedStyle.backgroundColor;
        let textColor = computedStyle.color;
        const fontWeight = computedStyle.fontWeight;
        const textAlign = computedStyle.textAlign;
        const border = computedStyle.border || "1px solid #d0d7de";
        const padding = computedStyle.padding || "4px 8px";

        const accountCell = cell.classList.contains("transaction-account-cell");
        if (accountCell) {
          const roleClasses = [
            "transaction-role-capital",
            "transaction-role-bank",
            "transaction-role-cash",
            "transaction-role-profit",
            "transaction-role-expenses",
            "transaction-role-company",
            "transaction-role-staff",
            "transaction-role-upline",
            "transaction-role-agent",
            "transaction-role-member",
            "transaction-role-none",
          ];
          for (let ri = 0; ri < roleClasses.length; ri += 1) {
            if (cell.classList.contains(roleClasses[ri])) {
              bgColor = computedStyle.backgroundColor;
              textColor = computedStyle.color;
              break;
            }
          }
        }

        if (isHeader) {
          bgColor = "#002C49";
          textColor = "#ffffff";
        }
        if (isFooter) {
          bgColor = "#f6f8fa";
        }
        if (isAlertRow) {
          bgColor = "#dc2626";
          textColor = "#ffffff";
        }

        const bgColorHex = rgbToHex(bgColor);
        const textColorHex = rgbToHex(textColor);

        const cellStyle = `background-color: ${bgColorHex}; color: ${textColorHex}; font-weight: ${fontWeight}; text-align: ${textAlign}; border: ${border}; padding: ${padding};`;

        const cellText = (cell.textContent || cell.innerText || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        const tag = isHeader ? "th" : "td";
        html += `<${tag} style="${cellStyle}">${cellText}</${tag}>`;
      });
      html += "</tr>";
    });

    html += "</table></body></html>";

    let text = "";
    selectedRows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll("td, th");
      const rowText = Array.from(cells)
        .map((cell) => cell.textContent || "")
        .join("\t");
      text += rowText;
      if (rowIndex < selectedRows.length - 1) text += "\n";
    });

    const clipboardData = e.clipboardData || window.clipboardData;
    if (clipboardData) {
      clipboardData.setData("text/html", html);
      clipboardData.setData("text/plain", text);
    }
  };

  document.addEventListener("copy", onCopy);
  return () => document.removeEventListener("copy", onCopy);
}
