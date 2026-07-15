/** Wrap bare negative numbers in parentheses for formula display. */
export function formatNegativeNumbersInFormula(formula) {
  if (!formula || typeof formula !== "string") {
    return formula;
  }

  const pattern = /(^|[+\-*/(\s])(-(\d+\.?\d*))/g;

  let result = formula;
  let prev;
  do {
    prev = result;
    result = result.replace(pattern, (match, prefix, negativeNumber, _numberPart, offset, string) => {
      if (prefix === "(") {
        const afterMatch = string.substring(offset + match.length);
        if (afterMatch.startsWith(")")) {
          return match;
        }
      }
      return prefix + `(${negativeNumber})`;
    });
  } while (result !== prev);

  return result;
}
