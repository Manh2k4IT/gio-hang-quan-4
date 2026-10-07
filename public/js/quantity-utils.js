(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.QuantityUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function roundQuantity(value, decimals = 2) {
    const safeValue = Number(value);
    if (!Number.isFinite(safeValue)) return 0;
    const factor = 10 ** decimals;
    return Math.round(safeValue * factor) / factor;
  }

  function normalizeQuantityValue(value, fallback = 1) {
    const safeValue = Number(value);
    if (!Number.isFinite(safeValue)) return fallback;
    if (safeValue < 0) return 0;
    return roundQuantity(safeValue, 2);
  }

  function formatQuantityValue(value, fallback = "0") {
    const safeValue = normalizeQuantityValue(value, 0);
    if (safeValue <= 0) return String(fallback || "0");
    return String(safeValue.toFixed(2)).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }

  function parseQuantityInputValue(value, fallback = 1) {
    if (typeof value === "number") {
      return normalizeQuantityValue(value, fallback);
    }
    const raw = String(value ?? "").trim();
    if (!raw) return fallback;
    const cleaned = raw.replace(/\s*(m|mét|met|meter|meters)$/i, "").replace(/,/g, ".").trim();
    const safeValue = Number(cleaned);
    if (!Number.isFinite(safeValue)) return fallback;
    return normalizeQuantityValue(safeValue, fallback);
  }

  function formatQuantityValueWithUnit(value, fallback = "0") {
    return `${formatQuantityValue(value, fallback)}m`;
  }

  function getQuantityStep() {
    return 0.1;
  }

  function clampQuantity(value, maxValue, minValue = 0.1) {
    const safeMin = Number.isFinite(Number(minValue)) ? Math.max(0, Number(minValue)) : 0.1;
    const safeValue = normalizeQuantityValue(value, safeMin);
    const safeMax = Number.isFinite(Number(maxValue)) ? Math.max(safeMin, Number(maxValue)) : null;
    if (safeValue <= 0) return safeMin;
    if (safeMax !== null && safeValue > safeMax) return safeMax;
    return Math.max(safeMin, safeValue);
  }

  return { roundQuantity, normalizeQuantityValue, parseQuantityInputValue, formatQuantityValue, formatQuantityValueWithUnit, getQuantityStep, clampQuantity };
});
