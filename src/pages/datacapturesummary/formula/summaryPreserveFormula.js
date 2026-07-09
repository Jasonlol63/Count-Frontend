/**
 * preserveFormulaStructure (extracted from js/datacapturesummary.js).
 * Regenerate: node frontend/scripts/extract-preserve-formula.mjs
 */
import { createFormulaDisplayFromExpression } from "../../../shared/formula/index.js";
import {
  formatNegativeNumbersInFormula,
  removeThousandsSeparators,
  getFormulaNumberMatches,
} from "./summaryFormulaParseUtils.js";

function formatDecimalValue(num) {
  const n = Number(num);
  return Number.isNaN(n) ? String(num) : String(n);
}

function createSourcePercentDisplay(sourcePercentValue) {
  try {
    if (!sourcePercentValue || String(sourcePercentValue).trim() === "") return "(0)";
    const sourcePercentExpr = String(sourcePercentValue).trim();
    if (/[+\-*/]/.test(sourcePercentExpr)) {
      return `(${removeThousandsSeparators(sourcePercentExpr)})`;
    }
    const numValue = parseFloat(sourcePercentExpr);
    if (!Number.isNaN(numValue)) return `(${formatDecimalValue(numValue)})`;
    return `(${sourcePercentExpr})`;
  } catch {
    return "(0)";
  }
}

export function preserveFormulaStructure(savedFormulaDisplay, newSourceData, sourcePercentValue, enableSourcePercent) {
    try {
        console.log('preserveFormulaStructure called:', {
            savedFormulaDisplay,
            newSourceData,
            sourcePercentValue,
            enableSourcePercent
        });

        if (!savedFormulaDisplay || !newSourceData) {
            console.log('Missing savedFormulaDisplay or newSourceData, using fallback');
            // Fallback to creating new formula display
            return createFormulaDisplayFromExpression(newSourceData, sourcePercentValue, enableSourcePercent);
        }

        // Extract numbers from newSourceData (remove thousands separators first)
        // IMPORTANT: Use getFormulaNumberMatches to properly handle negative numbers
        // This preserves negative signs when extracting numbers from source data
        // But we should only extract base numbers (excluding structure numbers like 0.008, 0.002, 0.90)
        const cleanSourceData = removeThousandsSeparators(newSourceData);
        const numberMatches = getFormulaNumberMatches(cleanSourceData);
        const structurePatterns = [/\*0\.\d+/, /\/0\.\d+/, /\*\(0\.\d+/, /\/\(0\.\d+/];

        // Filter out structure numbers, only keep base numbers
        const numbers = [];
        numberMatches.forEach((matchObj) => {
            const numStr = matchObj.raw;
            const startPos = matchObj.startIndex;
            const endPos = matchObj.endIndex;

            // Check if this number is part of a structure pattern (*0.008, /0.90, etc.)
            const contextBefore = newSourceData.substring(Math.max(0, startPos - 3), startPos);
            const contextAfter = newSourceData.substring(endPos, Math.min(newSourceData.length, endPos + 3));
            const testStr = contextBefore + numStr + contextAfter;
            const isStructureNumber = structurePatterns.some(pattern => pattern.test(testStr));

            if (!isStructureNumber) {
                numbers.push(matchObj.displayValue);
            }
        });

        console.log('Extracted base numbers from newSourceData (excluding structure):', numbers);

        if (numbers.length === 0) {
            console.log('No numbers found in newSourceData, keeping original');
            return savedFormulaDisplay; // Keep original if no numbers found
        }

        // Extract the percent part from saved formula (e.g., *0.2, *(0.05), *(0.0085/2), *0, *0.1, etc.)
        // Pattern: ...*percent or ...*(percent-expression)
        // IMPORTANT: Handle cases where * is inside parentheses (e.g., (-4014.6*0.1)+0)
        // Strategy: Check if the last * is inside parentheses. If so, don't extract it as percent part.
        // Instead, treat the entire formula as formulaPart and replace numbers while preserving structure.
        // IMPORTANT: First check if formula ends with source percent (e.g., *(1) or *(0.05))
        // If so, temporarily remove it to check if there's a * inside parentheses in the base formula
        let percentPart = '';
        let lastStarIndex = -1;
        let isPercentInsideParens = false;
        let trailingSourcePercent = '';
        let hadOriginalSourcePercent = false; // Track if original formula had source percent

        // First, check if formula ends with source percent pattern: *(number) or *(expression)
        // This is the source percent added by createFormulaDisplayFromExpression
        const trailingSourcePercentPattern = /^(.+)\*\(([0-9.]+(?:\/[0-9.]+)?)\)\s*$/;
        const trailingMatch = savedFormulaDisplay.match(trailingSourcePercentPattern);
        if (trailingMatch) {
            // Formula ends with source percent, mark that original formula had source percent
            hadOriginalSourcePercent = true;
            // Formula ends with source percent, temporarily remove it for analysis
            const baseFormula = trailingMatch[1];
            trailingSourcePercent = trailingMatch[0].substring(baseFormula.length);

            // Now check if base formula has * inside parentheses
            const baseLastStarIndex = baseFormula.lastIndexOf('*');
            if (baseLastStarIndex >= 0) {
                const beforeStar = baseFormula.substring(0, baseLastStarIndex);
                const openParens = (beforeStar.match(/\(/g) || []).length;
                const closeParens = (beforeStar.match(/\)/g) || []).length;
                isPercentInsideParens = openParens > closeParens;

                if (isPercentInsideParens) {
                    console.log('Base formula has * inside parentheses, treating entire base formula as formulaPart (will preserve *0.1 structure):', baseFormula);
                    // Use base formula as formulaPart, and trailing source percent will be re-added later
                    lastStarIndex = -1; // Reset to indicate no percent part extraction from base
                } else {
                    // Base formula doesn't have * inside parentheses, but ends with source percent
                    // Extract the trailing source percent as percentPart
                    lastStarIndex = baseFormula.length; // Position where trailing source percent starts
                    percentPart = trailingSourcePercent;
                    console.log('Formula ends with source percent, extracted as percentPart:', percentPart);
                }
            } else {
                // Base formula has no *, so trailing source percent is the only percent part
                lastStarIndex = baseFormula.length;
                percentPart = trailingSourcePercent;
                console.log('Base formula has no *, extracted trailing source percent as percentPart:', percentPart);
            }
        } else {
            // Formula doesn't end with source percent pattern, check normally
            // Find the last occurrence of *
            lastStarIndex = savedFormulaDisplay.lastIndexOf('*');
            if (lastStarIndex >= 0) {
                // Check if this * is inside parentheses
                const beforeStar = savedFormulaDisplay.substring(0, lastStarIndex);
                const openParens = (beforeStar.match(/\(/g) || []).length;
                const closeParens = (beforeStar.match(/\)/g) || []).length;
                isPercentInsideParens = openParens > closeParens;

                // If * is inside parentheses, don't extract it as percent part
                // The entire formula should be treated as formulaPart
                if (isPercentInsideParens) {
                    console.log('Last * is inside parentheses, treating entire formula as formulaPart (will preserve *0.1 structure):', savedFormulaDisplay);
                    percentPart = ''; // Don't extract percent part
                    lastStarIndex = -1; // Reset to indicate no percent part extraction
                }
            }
        }

        // Only extract percent part if * is NOT inside parentheses
        if (lastStarIndex >= 0 && !isPercentInsideParens) {
            // Get the substring from the last * to the end
            const afterStar = savedFormulaDisplay.substring(lastStarIndex).trim();

            // Check if * is followed by an opening parenthesis
            if (afterStar.startsWith('*(')) {
                // Find the matching closing parenthesis
                let parenCount = 0;
                let endIndex = -1;
                for (let i = 1; i < afterStar.length; i++) {
                    if (afterStar[i] === '(') {
                        parenCount++;
                    } else if (afterStar[i] === ')') {
                        if (parenCount === 0) {
                            // Found the matching closing parenthesis
                            endIndex = i + 1;
                            break;
                        }
                        parenCount--;
                    }
                }
                if (endIndex > 0) {
                    // Extract the percent part including the parentheses: *(0.1) or *(0.0085/2)
                    percentPart = afterStar.substring(0, endIndex).trim();
                } else {
                    // No matching closing parenthesis found, try to match as much as possible
                    // This handles cases like *(0.1 where closing paren might be part of formula
                    let percentMatchParen = afterStar.match(/^\*\(\s*[0-9+\-*/.\s]+/);
                    if (percentMatchParen) {
                        // If we can't find matching paren, check if there's a ) after the expression
                        const matchEnd = percentMatchParen[0].length;
                        if (matchEnd < afterStar.length && afterStar[matchEnd] === ')') {
                            percentPart = afterStar.substring(0, matchEnd + 1).trim();
                        } else {
                            // No closing paren found, use the match as-is (might be incomplete)
                            percentPart = percentMatchParen[0].trim();
                        }
                    }
                }
            } else {
                // No opening parenthesis after *, try to match a simple number
                // Match *0.1 or *0.1) (where ) might be part of formula part)
                let percentMatchSimple = afterStar.match(/^\*([0-9.]+)/);
                if (percentMatchSimple) {
                    const percentValue = percentMatchSimple[1];
                    const matchEnd = percentMatchSimple[0].length;
                    const charAfterNumber = matchEnd < afterStar.length ? afterStar[matchEnd] : '';

                    // IMPORTANT: If there's an operator (+ - * /) after the number, 
                    // this is part of the formula, not a percent part
                    // Example: "4.6*0.17+8.6-0" - *0.17 is formula part, not percent
                    if (/[+\-*/]/.test(charAfterNumber)) {
                        // This is part of the formula, not percent part
                        console.log(`*${percentValue} is followed by operator "${charAfterNumber}", treating as formula part, not percent part`);
                        percentPart = ''; // Don't extract as percent part
                    } else if (charAfterNumber === ')') {
                        // The ) is likely part of the formula part, not percent part
                        // So percent part is just *0.1
                        // But also check if the number is in 0-1 range (typical for percentages)
                        const numValue = parseFloat(percentValue);
                        if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
                            // Could be a percent, but ) suggests it's part of formula structure
                            // Check if this is at the end of the formula (likely percent) or has more content
                            const afterParen = afterStar.substring(matchEnd + 1).trim();
                            if (afterParen === '' || /^[+\-*/]/.test(afterParen)) {
                                // At end or followed by operator, likely percent
                                percentPart = `*${percentValue}`;
                            } else {
                                // More content after ), likely formula part
                                console.log(`*${percentValue} is followed by ) and more content, treating as formula part`);
                                percentPart = '';
                            }
                        } else {
                            // Number > 1, definitely formula part
                            console.log(`*${percentValue} is > 1, treating as formula part`);
                            percentPart = '';
                        }
                    } else {
                        // No ) or operator after number
                        // Check if number is in 0-1 range (typical for percentages)
                        const numValue = parseFloat(percentValue);
                        if (!isNaN(numValue) && numValue >= 0 && numValue <= 1) {
                            // Could be a percent if at the end of formula
                            // Check if this is at the end of the formula
                            const remainingAfterNumber = afterStar.substring(matchEnd).trim();
                            if (remainingAfterNumber === '' || remainingAfterNumber === ')') {
                                // At end of formula, likely percent
                                percentPart = `*${percentValue}`;
                            } else {
                                // More content after number, likely formula part
                                console.log(`*${percentValue} is followed by more content "${remainingAfterNumber}", treating as formula part`);
                                percentPart = '';
                            }
                        } else {
                            // Number > 1, definitely formula part
                            console.log(`*${percentValue} is > 1, treating as formula part`);
                            percentPart = '';
                        }
                    }
                } else {
                    // Try to match parenthesized expression that might not start with (
                    // This handles edge cases
                    let percentMatchParen = afterStar.match(/^\*\(\s*[0-9+\-*/.\s]+\s*\)\s*$/);
                    if (percentMatchParen) {
                        percentPart = percentMatchParen[0].trim();
                    } else {
                        console.log('No percent pattern found after last *:', afterStar);
                    }
                }
            }
        } else {
            console.log('No * found in savedFormulaDisplay:', savedFormulaDisplay);
        }

        if (!percentPart) {
            console.log('No percent part extracted from savedFormulaDisplay:', savedFormulaDisplay);
            // If no percent part was extracted, reset lastStarIndex to indicate no percent part
            // This ensures the entire formula is treated as formulaPart
            lastStarIndex = -1;
        }

        // Extract the formula part (everything before the percent part)
        // Use lastStarIndex to ensure we preserve the complete formula structure including parentheses
        let formulaPart = savedFormulaDisplay;
        let afterPercentPart = ''; // Store any content after percent part (like closing parentheses)

        if (trailingSourcePercent && isPercentInsideParens) {
            // Formula ends with source percent, but base formula has * inside parentheses
            // Use base formula (without trailing source percent) as formulaPart
            formulaPart = savedFormulaDisplay.substring(0, savedFormulaDisplay.length - trailingSourcePercent.length);
            afterPercentPart = '';
            console.log('Percent inside parentheses in base formula - using base formula as formulaPart:', formulaPart);
        } else if (isPercentInsideParens) {
            // Percent part is inside parentheses (e.g., (-4014.6*0.1)+0)
            // Treat entire formula as formulaPart, but skip numbers in percentage part when replacing
            formulaPart = savedFormulaDisplay;
            afterPercentPart = '';
            console.log('Percent inside parentheses - using entire formula as formulaPart:', formulaPart);
        } else if (lastStarIndex >= 0 && percentPart) {
            // Formula part is everything before the last *
            formulaPart = savedFormulaDisplay.substring(0, lastStarIndex);
            // Check if there's content after the percent part that belongs to formula part
            // This handles cases like (7+6)-((7+6+5)*0.1) where the last ) belongs to formula part
            afterPercentPart = savedFormulaDisplay.substring(lastStarIndex + percentPart.length);
        } else {
            // No percent part extracted (percentPart is empty), use entire formula as formulaPart
            // This handles cases like "4.6*0.17+8.6-0" where *0.17 is part of the formula, not percent
            formulaPart = savedFormulaDisplay;
            afterPercentPart = '';
            console.log('No percent part extracted, using entire formula as formulaPart:', formulaPart);
        }

        console.log('Extracted formulaPart:', formulaPart);

        // Extract numbers from saved formula part (excluding percent)
        // We need to preserve the order of numbers as they appear in the formula
        // IMPORTANT: Use getFormulaNumberMatches to properly handle negative numbers
        // This preserves negative signs when extracting numbers from saved formula
        // But we should only extract base numbers (excluding structure numbers like 0.008, 0.002, 0.90)
        const savedNumberMatches = getFormulaNumberMatches(formulaPart);

        // Filter out structure numbers and percentage numbers, only keep base numbers
        const savedNumbers = [];
        savedNumberMatches.forEach((matchObj) => {
            const numStr = matchObj.raw;
            const startPos = matchObj.startIndex;
            const endPos = matchObj.endIndex;

            // CRITICAL FIX: Always exclude numbers after / operator
            // User explicitly stated that numbers after / are NOT from data capture table
            // They are manual inputs and should not be counted in savedNumbers
            const charBefore = startPos > 0 ? formulaPart[startPos - 1] : '';
            if (charBefore === '/') {
                // Skip numbers after / operator (they are manual inputs, not from data capture table)
                return;
            }

            // Check if this number is part of a structure pattern (*0.008, /0.90, etc.)
            const contextBefore = formulaPart.substring(Math.max(0, startPos - 3), startPos);
            const contextAfter = formulaPart.substring(endPos, Math.min(formulaPart.length, endPos + 3));
            const testStr = contextBefore + numStr + contextAfter;
            const isStructureNumber = structurePatterns.some(pattern => pattern.test(testStr));

            // If percent is inside parentheses, also skip numbers that are part of percentage (e.g., *0.1)
            let isPercentNumber = false;
            if (isPercentInsideParens) {
                // Check if this number is immediately after a * and between 0-1 (likely percentage)
                const numValue = parseFloat(numStr);
                if (charBefore === '*' && !isNaN(numValue) && numValue >= 0 && numValue <= 1) {
                    isPercentNumber = true;
                }
            }

            if (!isStructureNumber && !isPercentNumber) {
                savedNumbers.push(matchObj.displayValue);
            }
        });

        console.log('Extracted base savedNumbers from formulaPart (excluding structure):', savedNumbers);
        console.log('Base numbers from newSourceData:', numbers);

        // 骨干数字个数不一致时，直接保留原公式，不再尝试“聪明替换”，
        // 避免出现你截图中那种 New formulaPart after replacement 被意外改写的情况。
        // 这样 Summary 里的展示公式会始终与数据库中保存的 formula_display / Edit 灰色框一致。
        if (savedNumbers.length !== numbers.length) {
            console.warn('Base number count mismatch, preserving original formula_display without replacement:', {
                savedNumbers: savedNumbers.length,
                newNumbers: numbers.length,
                savedFormulaPart: formulaPart,
                newSourceData: newSourceData
            });
            return savedFormulaDisplay;
        }

        // Note: We don't check if values match because value changes are expected when Data Capture Table data changes
        // For example, if Data Capture Table data changes from 862500 to 1, we want to update the formula
        console.log('Base number counts match, proceeding with number replacement');

        // Replace numbers in formula part with numbers from new sourceData
        // Preserve the structure (parentheses, operators, etc.) and structure numbers (*0.008, /0.90, etc.)
        // IMPORTANT: Preserve manually entered numbers after * or / operators (e.g., *0.9/2)
        // Use /-?\d+\.?\d*/g to match numbers including negative sign
        // This allows us to replace the entire number (including sign) from newSourceData correctly
        let numberIndex = 0;
        let newFormulaPart = formulaPart.replace(/-?\d+\.?\d*/g, (match, offset, string) => {
            // Check if this number is part of a structure pattern (*0.008, /0.90, etc.)
            const contextBefore = string.substring(Math.max(0, offset - 3), offset);
            const contextAfter = string.substring(offset + match.length, Math.min(string.length, offset + match.length + 3));
            const testStr = contextBefore + match + contextAfter;
            const isStructureNumber = structurePatterns.some(pattern => pattern.test(testStr));

            if (isStructureNumber) {
                // Keep structure numbers as-is
                return match;
            }

            // IMPORTANT: Preserve manually entered numbers after * or / operators
            // These are user's manual inputs (e.g., *0.9/2) and should not be replaced
            // Check if this number is immediately after a * or / operator
            const charBefore = offset > 0 ? string[offset - 1] : '';
            if (charBefore === '*' || charBefore === '/') {
                // CRITICAL FIX: Always preserve numbers after / operator
                // User explicitly stated that numbers after / are NOT from data capture table
                // They are manual inputs and should never be replaced
                if (charBefore === '/') {
                    console.log(`Preserving manually entered number ${match} at position ${offset} (after / operator, always manual input)`);
                    return match;
                }

                // For * operator, check if this is part of a manual expression (e.g., *0.9/2, /0.5*3)
                // Look ahead to see if there's a / or * after this number
                const afterMatch = string.substring(offset + match.length).trim();
                if (afterMatch.startsWith('/') || afterMatch.startsWith('*')) {
                    // This is part of a manual expression (e.g., *0.9/2), preserve it
                    console.log(`Preserving manually entered number ${match} at position ${offset} (part of manual expression after ${charBefore})`);
                    return match;
                }
                // Also preserve if it's a decimal number after * or / (likely manual input)
                // But only if it's not in the savedNumbers list (meaning it's not from data capture table)
                const numValue = parseFloat(match);
                const isInSavedNumbers = savedNumbers.some(savedNum => Math.abs(parseFloat(savedNum) - numValue) < 0.0001);
                if (!isInSavedNumbers && !isNaN(numValue)) {
                    console.log(`Preserving manually entered number ${match} at position ${offset} (not in savedNumbers, likely manual input)`);
                    return match;
                }
            }

            // If percent is inside parentheses, skip numbers that are part of percentage (e.g., *0.1)
            if (isPercentInsideParens) {
                const numValue = parseFloat(match);
                // Check if this number is immediately after a * and between 0-1 (likely percentage)
                if (charBefore === '*' && !isNaN(numValue) && numValue >= 0 && numValue <= 1) {
                    console.log(`Skipping replacement for ${match} at position ${offset} (percentage number inside parentheses)`);
                    return match; // Don't replace percentage numbers
                }
            }

            // Check if this number is part of the percent (for traditional case where percent is at the end)
            // 之前的实现是：只要前 5 个字符里包含 "*" 就当成百分比的一部分，
            // 在公式形如 "1+1*0.6+4+1*0.8" 时，会把中间的 "4" 也误判为百分比区间，导致不会被新数字替换。
            // 这里改为：
            //  - 只在「紧挨着数字前面」是 "*" 的情况下才认为可能是百分比；
            //  - 并且该数字必须在 0~1 之间（例如 0.6、0.08），整数 4、7 等不会被当成百分比。
            if (!isPercentInsideParens) {
                const numForPercentCheck = parseFloat(match);
                if (
                    charBefore === '*' &&
                    !isNaN(numForPercentCheck) &&
                    numForPercentCheck >= 0 &&
                    numForPercentCheck <= 1
                ) {
                    // Check if this number is in savedNumbers (from data capture table) or not (manual input)
                    const isInSavedNumbersForPercent = savedNumbers.some(savedNum => Math.abs(parseFloat(savedNum) - numForPercentCheck) < 0.0001);
                    if (!isInSavedNumbersForPercent) {
                        // This is likely a manual input, preserve it
                        console.log(`Preserving manually entered percentage number ${match} at position ${offset} (not in savedNumbers)`);
                        return match;
                    }
                    console.log(`Skipping replacement for ${match} at position ${offset} (likely part of percent after '*')`);
                    return match; // Don't replace if it's the percent number itself
                }
            }

            // Determine if this match is a negative number or part of a subtraction operator
            // The regex matches "-6" or "6", so we need to check if "-6" is actually a negative number
            let isNegativeNumber = false;
            if (match.startsWith('-')) {
                // Check the character before the '-' to determine if it's unary minus or subtraction
                if (offset > 0) {
                    const charBefore = string[offset - 1];
                    // If char before '-' is an operator, opening parenthesis, or whitespace, it's a negative number
                    if (/[+\-*/\(\s]/.test(charBefore)) {
                        isNegativeNumber = true;
                    }
                    // Otherwise, '-' is part of a subtraction operator (e.g., "5-6" where match is "-6")
                } else {
                    // '-' is at the start, so it's a negative number
                    isNegativeNumber = true;
                }
            }

            // Skip if this is a subtraction operator (not a negative number)
            // 但仍然需要更新其后数字，只是保留减号
            // 如果替换后的值是负数，需要用括号包裹
            if (match.startsWith('-') && !isNegativeNumber) {
                if (numberIndex < numbers.length) {
                    let replacement = numbers[numberIndex++];
                    const replacementValue = parseFloat(replacement);
                    // 如果替换后的值是负数，需要用括号包裹
                    if (!isNaN(replacementValue) && replacementValue < 0) {
                        // 保留负号，然后用括号包裹：-264.34 -> (-264.34)
                        // 注意：在减法操作符后，负数应该显示为 -(-264.34)
                        console.log(`Replacing subtraction operand ${match} with -(${replacement}) at position ${offset} (negative value needs parentheses)`);
                        return `-(${replacement})`;
                    } else {
                        replacement = replacement.replace(/^-/, '');
                        console.log(`Replacing subtraction operand ${match} with -${replacement} at position ${offset}`);
                        return '-' + replacement;
                    }
                }
                return match; // No replacement available
            }

            // Replace with corresponding number from new sourceData
            if (numberIndex < numbers.length) {
                let replacement = numbers[numberIndex++];
                // Use replacement directly from newSourceData, which already has the correct sign
                // This preserves negative numbers correctly when loading from database

                // 如果替换后的值是负数，需要用括号包裹
                const replacementValue = parseFloat(replacement);
                if (!isNaN(replacementValue) && replacementValue < 0) {
                    // 检查前一个字符，确定是否需要括号
                    const charBefore = offset > 0 ? string[offset - 1] : '';
                    const needsParentheses = offset === 0 || /[+\-*/\(\s]/.test(charBefore);

                    if (needsParentheses) {
                        // 保留负号，然后用括号包裹：-264.34 -> (-264.34)
                        console.log(`Replacing ${match} with (${replacement}) at position ${offset} (negative value needs parentheses)`);
                        return `(${replacement})`;
                    }
                }

                console.log(`Replacing ${match} with ${replacement} at position ${offset} (was negative: ${isNegativeNumber})`);
                return replacement;
            } else {
                // If isPercentInsideParens and numbers are exhausted, keep original to preserve structure
                // This allows partial updates when number counts don't match
                if (isPercentInsideParens) {
                    console.log(`No replacement available for ${match} at position ${offset}, keeping original (preserving structure with percent inside parentheses)`);
                } else {
                    console.warn(`No replacement available for ${match} at position ${offset}, keeping original`);
                }
                return match; // Keep original if no replacement available
            }
        });

        console.log('New formulaPart after replacement:', newFormulaPart);

        // Keep formula as-is, don't automatically add parentheses
        // Only preserve what user originally wrote
        // newFormulaPart already preserves the structure from formulaPart (including parentheses if any)
        const finalFormulaPart = newFormulaPart;

        // Combine new formula part with preserved percent part
        let result = finalFormulaPart;

        // If percent is inside parentheses, finalFormulaPart already contains the complete formula
        // (including the percentage part), so we need to add source percent at the end if enabled
        if (isPercentInsideParens && trailingSourcePercent) {
            // Base formula has * inside parentheses and ends with trailing source percent
            // Use finalFormulaPart (with updated numbers) and add source percent at the end if enabled
            if (enableSourcePercent && sourcePercentValue && sourcePercentValue.trim() !== '') {
                // 使用统一的 Source Percent 展示逻辑，支持表达式（例如 0.5/2 -> (0.005/2)）
                const percentDisplay = createSourcePercentDisplay(sourcePercentValue);
                result = finalFormulaPart + `*${percentDisplay}`;
                console.log('Percent inside parentheses in base formula - added source percent at end (with expression support):', result);
            } else {
                // Source percent disabled, use finalFormulaPart only
                result = finalFormulaPart;
                console.log('Percent inside parentheses in base formula - source percent disabled, using finalFormulaPart only:', result);
            }
        } else if (isPercentInsideParens) {
            // Percent is inside parentheses but no trailing source percent
            result = finalFormulaPart;
            console.log('Percent inside parentheses - using finalFormulaPart directly:', result);
        } else if (percentPart) {
            // If percentPart was found in saved formula
            // Check if it's a trailing source percent (added by createFormulaDisplayFromExpression)
            // or a user-manually-entered percentage (like *0.1 inside the formula)
            if (trailingSourcePercent && percentPart === trailingSourcePercent) {
                // This is a trailing source percent, replace it with new source percent if enabled
                if (enableSourcePercent && sourcePercentValue && sourcePercentValue.trim() !== '') {
                    // Replace with new source percent，统一支持表达式
                    try {
                        const percentDisplay = createSourcePercentDisplay(sourcePercentValue);
                        percentPart = `*${percentDisplay}`;
                        result = finalFormulaPart + percentPart + afterPercentPart;
                        console.log('Replaced trailing source percent with new source percent (with expression support):', result);
                    } catch (e) {
                        console.warn('Could not create source percent display from value:', sourcePercentValue, e);
                        // If source percent disabled or invalid, remove trailing source percent
                        result = finalFormulaPart + afterPercentPart;
                        console.log('Removed trailing source percent (invalid or disabled):', result);
                    }
                } else {
                    // Source percent disabled, remove trailing source percent
                    result = finalFormulaPart + afterPercentPart;
                    console.log('Removed trailing source percent (disabled):', result);
                }
            } else {
                // This is a user-manually-entered percentage (like *0.1 inside the formula)
                // Always preserve it regardless of enableSourcePercent setting
                // IMPORTANT: 如果是形如 *(0.0085/2) 的"括号里含运算符"的表达式，必须原样保留，不能格式化为纯数字
                // 判断是否为括号内含有运算符的表达式：*( 0.0085/2 )，若是则完全保留
                const isParenExpr = /^\*\(\s*[0-9+\-*/.\s]+\)\s*$/.test(percentPart);
                if (!isParenExpr) {
                    // 仅在"纯数字"或"包着括号的纯数字"时做格式化，去掉多余的尾零
                    const percentNumMatch = percentPart.match(/^\*\(?\s*([0-9.]+)\s*\)?\s*$/);
                    if (percentNumMatch) {
                        const percentNum = parseFloat(percentNumMatch[1]);
                        if (!isNaN(percentNum)) {
                            const formattedPercentNum = formatDecimalValue(percentNum);
                            percentPart = percentPart.includes('(') ? `*(${formattedPercentNum})` : `*${formattedPercentNum}`;
                        }
                    }
                    // 若也不是纯数字，就保持原样（保险起见）
                }
                result = finalFormulaPart + percentPart + afterPercentPart;
                console.log('Combined with percentPart (user manual percentage, preserved):', result);
            }
        } else if (enableSourcePercent && sourcePercentValue && sourcePercentValue.trim() !== '' && hadOriginalSourcePercent) {
            // Only add source percent if the original formula had one
            // This prevents adding source percent to formulas that don't have it (e.g., "4.6*0.17+8.6-0")
            try {
                // 统一通过 createSourcePercentDisplay 来生成百分比展示，支持表达式
                const percentDisplay = createSourcePercentDisplay(sourcePercentValue);
                percentPart = `*${percentDisplay}`;
                result = finalFormulaPart + percentPart;
                console.log('Created percentPart from sourcePercentValue (original had source percent, with expression support):', percentPart, 'Result:', result);
            } catch (e) {
                console.warn('Could not create percentPart from sourcePercentValue:', sourcePercentValue, e);
                result = finalFormulaPart; // Fallback to formula part only
            }
        } else {
            // No percentPart found and either:
            // - enableSourcePercent is false
            // - no sourcePercentValue
            // - original formula didn't have source percent (hadOriginalSourcePercent is false)
            console.log('No percentPart found. enableSourcePercent:', enableSourcePercent, 'sourcePercentValue:', sourcePercentValue, 'hadOriginalSourcePercent:', hadOriginalSourcePercent);
            result = finalFormulaPart; // Return formula part only (preserve original formula without adding source percent)
        }

        console.log('Final result:', result);

        // Format negative numbers in the final result
        return formatNegativeNumbersInFormula(result);
    } catch (error) {
        console.error('Error preserving formula structure:', error);
        // Fallback to creating new formula display
        return createFormulaDisplayFromExpression(newSourceData, sourcePercentValue, enableSourcePercent);
    }
}
