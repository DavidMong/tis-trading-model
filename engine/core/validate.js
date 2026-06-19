'use strict';

// Input validation at the engine boundary. Reject nonsensical trades with a clear, descriptive
// error rather than letting NaN / Infinity propagate silently into financial figures.

function num(value, path) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid input: '${path}' must be a finite number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function positive(value, path) {
  num(value, path);
  if (value <= 0) throw new Error(`Invalid input: '${path}' must be > 0, got ${value}`);
  return value;
}

function nonNegative(value, path) {
  num(value, path);
  if (value < 0) throw new Error(`Invalid input: '${path}' must be >= 0, got ${value}`);
  return value;
}

function proportion(value, path) {
  num(value, path);
  if (value < 0 || value > 1) throw new Error(`Invalid input: '${path}' must be within [0,1], got ${value}`);
  return value;
}

// Guard a value that the engine computed (not a raw input) before it is used as a divisor.
function computedPositive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Computed ${label} must be a finite number > 0, got ${value}`);
  }
  return value;
}

module.exports = { num, positive, nonNegative, proportion, computedPositive };
