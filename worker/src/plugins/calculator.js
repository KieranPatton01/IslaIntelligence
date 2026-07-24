/**
 * calculator.js
 * Math calculator plugin for evaluating basic arithmetic operations safely.
 */

export const definition = {
  name: "calculate_expression",
  description: "Evaluate a mathematical or arithmetic expression. Use this tool when the user asks you to compute, calculate, solve, or evaluate math equations or arithmetic operations.",
  parameters: {
    type: "OBJECT",
    properties: {
      expression: {
        type: "STRING",
        description: "The arithmetic expression to evaluate (e.g. '4829 * 382 / 12' or '3.14159 * 15**2'). Supported characters: digits, +, -, *, /, (, ), ., ** (for power)."
      }
    },
    required: ["expression"]
  }
};

export async function execute({ expression }) {
  if (!expression || !expression.trim()) {
    return { error: "Empty or invalid math expression" };
  }

  try {
    const result = safeEvaluate(expression);
    
    if (typeof result !== 'number' || Number.isNaN(result) || !Number.isFinite(result)) {
      return { error: "Expression did not evaluate to a valid finite number" };
    }

    return {
      expression,
      result: Number(result.toFixed(6))
    };
  } catch (err) {
    return { error: `Failed to calculate: ${err.message}` };
  }
}

function safeEvaluate(expression) {
  // Strip out any characters that are NOT numbers, whitespace, parentheses, or basic math operators
  const sanitized = expression.replace(/[^0-9+\-*/().\s**]/g, '');
  let index = 0;

  function parseExpression() {
    let result = parseTerm();
    while (index < sanitized.length) {
      while (sanitized[index] === ' ') index++;
      const op = sanitized[index];
      if (op === '+' || op === '-') {
        index++;
        const nextTerm = parseTerm();
        if (op === '+') result += nextTerm;
        else result -= nextTerm;
      } else {
        break;
      }
    }
    return result;
  }

  function parseTerm() {
    let result = parseFactor();
    while (index < sanitized.length) {
      while (sanitized[index] === ' ') index++;
      const op = sanitized[index];
      if (op === '*' || op === '/') {
        if (op === '*' && sanitized[index + 1] === '*') {
          break; // Let parseFactor handle power operation
        }
        index++;
        const nextFactor = parseFactor();
        if (op === '*') result *= nextFactor;
        else {
          if (nextFactor === 0) throw new Error("Division by zero");
          result /= nextFactor;
        }
      } else {
        break;
      }
    }
    return result;
  }

  function parseFactor() {
    let result = parseBase();
    while (index < sanitized.length) {
      while (sanitized[index] === ' ') index++;
      if (sanitized[index] === '*' && sanitized[index + 1] === '*') {
        index += 2;
        const power = parseFactor(); // Right-associative
        result = Math.pow(result, power);
      } else {
        break;
      }
    }
    return result;
  }

  function parseBase() {
    while (sanitized[index] === ' ') index++;
    if (sanitized[index] === '(') {
      index++; // consume '('
      const result = parseExpression();
      while (sanitized[index] === ' ') index++;
      if (sanitized[index] === ')') {
        index++; // consume ')'
      }
      return result;
    }

    // Allow negative numbers
    let isNegative = false;
    if (sanitized[index] === '-') {
      isNegative = true;
      index++;
    }

    let start = index;
    while (index < sanitized.length && /[0-9.]/.test(sanitized[index])) {
      index++;
    }
    const numStr = sanitized.slice(start, index);
    const num = parseFloat(numStr);
    if (isNaN(num)) {
      throw new Error("Invalid number representation");
    }
    return isNegative ? -num : num;
  }

  const finalResult = parseExpression();
  while (sanitized[index] === ' ') index++;
  if (index < sanitized.length) {
    throw new Error(`Unexpected character at position ${index}`);
  }
  return finalResult;
}
