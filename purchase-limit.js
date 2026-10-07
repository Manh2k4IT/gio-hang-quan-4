const crypto = require("crypto");
class PurchaseLimitStateError extends Error {}

function createPurchaseLimit() {
    return { enabled: false, productIds: [], roundId: "", startedAt: "", purchases: {} };
}

function getPurchaseLimitSettings(rule) {
    return { enabled: rule.enabled, productIds: [...rule.productIds], roundId: rule.roundId, startedAt: rule.startedAt };
}

function configurePurchaseLimit(rule, enabled, productIds) {
    if (typeof enabled !== "boolean" || !Array.isArray(productIds)
        || productIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
        throw new Error("Cấu hình giới hạn mua không hợp lệ");
    }
    const ids = [...new Set(productIds)];
    if (enabled && !rule.enabled && !ids.length) throw new Error("Vui lòng chọn ít nhất một sản phẩm trước khi bật");
    if (enabled && !rule.enabled) {
        return { enabled, productIds: ids, roundId: crypto.randomUUID(), startedAt: new Date().toISOString(), purchases: {} };
    }
    if (!enabled && rule.enabled) {
        return { ...rule, enabled: false, productIds: [] };
    }
    return { ...rule, enabled, productIds: ids };
}

function getPhoneKey(phone, roundId) {
    let digits = String(phone || "").replace(/\D+/g, "");
    if (digits.startsWith("84") && digits.length >= 10) digits = `0${digits.slice(2)}`;
    if (!/^0\d{9}$/.test(digits)) throw new Error("Vui lòng nhập số điện thoại Việt Nam hợp lệ gồm 10 số (hoặc +84)");
    return crypto.createHash("sha256").update(`${roundId}:${digits}`).digest("hex");
}

function checkPurchaseLimit(rule, phone, productIds) {
    const restricted = [...new Set(productIds)].filter((id) => rule.productIds.includes(id));
    if (!rule.enabled || !restricted.length) return { phoneKey: "", productIds: [] };
    const phoneKey = getPhoneKey(phone, rule.roundId);
    const purchased = rule.purchases[phoneKey] || [];
    const blocked = restricted.filter((id) => purchased.includes(id));
    return { phoneKey, productIds: restricted, blocked };
}

function recordLimitedPurchase(rule, check, purchasedIds) {
    if (!check.phoneKey) return;
    const ids = check.productIds.filter((id) => purchasedIds.includes(id));
    if (!ids.length) return;
    rule.purchases[check.phoneKey] = [...new Set([...(rule.purchases[check.phoneKey] || []), ...ids])];
}

function restorePurchaseLimit(value) {
    if (value === undefined) return createPurchaseLimit();
    if (!value || typeof value.enabled !== "boolean" || !Array.isArray(value.productIds)
        || value.productIds.some((id) => !Number.isSafeInteger(id) || id <= 0)
        || typeof value.roundId !== "string" || typeof value.startedAt !== "string"
        || (value.enabled && (!value.roundId || !Number.isFinite(Date.parse(value.startedAt))))
        || !value.purchases || typeof value.purchases !== "object" || Array.isArray(value.purchases)
        || Object.entries(value.purchases).some(([key, ids]) => !/^[a-f0-9]{64}$/.test(key)
            || !Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0))) {
        throw new PurchaseLimitStateError("Dữ liệu giới hạn mua đã lưu không hợp lệ");
    }
    return value;
}

module.exports = { PurchaseLimitStateError, createPurchaseLimit, getPurchaseLimitSettings, configurePurchaseLimit, checkPurchaseLimit, recordLimitedPurchase, restorePurchaseLimit };
