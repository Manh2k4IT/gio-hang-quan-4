const test = require("node:test");
const assert = require("node:assert/strict");
const { createPurchaseLimit, configurePurchaseLimit, checkPurchaseLimit, recordLimitedPurchase, restorePurchaseLimit, getPurchaseLimitSettings } = require("./purchase-limit");

test("limits selected products per phone per enabled round", () => {
    let rule = createPurchaseLimit();
    assert.deepEqual(checkPurchaseLimit(rule, "", [1]).productIds, []);
    rule = configurePurchaseLimit(rule, true, [1, 2]);
    const check = checkPurchaseLimit(rule, "0901234567", [1, 1, 3]);
    assert.deepEqual(check.productIds, [1]);
    recordLimitedPurchase(rule, check, [1]);
    assert.deepEqual(checkPurchaseLimit(rule, "+84 901 234 567", [1, 2]).blocked, [1]);
    assert.deepEqual(checkPurchaseLimit(rule, "0901234568", [1]).blocked, []);
    assert.deepEqual(checkPurchaseLimit(rule, "0901234567", [2]).blocked, []);
    assert.deepEqual(checkPurchaseLimit(rule, "", [3]).productIds, []);
    assert.throws(() => checkPurchaseLimit(rule, "invalid", [1]), /điện thoại/);
    assert.deepEqual(restorePurchaseLimit(JSON.parse(JSON.stringify(rule))), rule);
    assert.equal(getPurchaseLimitSettings(rule).purchases, undefined);
    const round = rule.roundId;
    rule = configurePurchaseLimit(rule, true, [2]);
    rule = configurePurchaseLimit(rule, true, [1, 2]);
    assert.equal(rule.roundId, round);
    assert.deepEqual(checkPurchaseLimit(rule, "0901234567", [1]).blocked, [1]);
    rule = configurePurchaseLimit(rule, false, [1, 2]);
    assert.deepEqual(rule.productIds, []);
    assert.deepEqual(restorePurchaseLimit(JSON.parse(JSON.stringify(rule))).productIds, []);
    assert.deepEqual(checkPurchaseLimit(rule, "0901234567", [1]).productIds, []);
    rule = configurePurchaseLimit(rule, true, [1]);
    assert.notEqual(rule.roundId, round);
    assert.deepEqual(checkPurchaseLimit(rule, "0901234567", [1]).blocked, []);
});

test("allows preparing selections while disabled without enabling restrictions", () => {
    const rule = configurePurchaseLimit(createPurchaseLimit(), false, [1, 2]);
    assert.deepEqual(rule.productIds, [1, 2]);
    assert.equal(rule.enabled, false);
    assert.deepEqual(checkPurchaseLimit(rule, "0901234567", [1]).productIds, []);
});

test("does not consume skipped purchases and rejects invalid settings", () => {
    const rule = configurePurchaseLimit(createPurchaseLimit(), true, [1, 2]);
    const check = checkPurchaseLimit(rule, "0901234567", [1, 2]);
    recordLimitedPurchase(rule, check, [2]);
    assert.deepEqual(checkPurchaseLimit(rule, "0901234567", [1, 2]).blocked, [2]);
    assert.throws(() => configurePurchaseLimit(createPurchaseLimit(), true, []), /chọn/);
    const emptyActive = configurePurchaseLimit(rule, true, []);
    assert.equal(emptyActive.roundId, rule.roundId);
    assert.deepEqual(emptyActive.productIds, []);
    assert.deepEqual(restorePurchaseLimit(emptyActive), emptyActive);
    const reselected = configurePurchaseLimit(emptyActive, true, [2]);
    assert.deepEqual(checkPurchaseLimit(reselected, "0901234567", [2]).blocked, [2]);
    assert.throws(() => configurePurchaseLimit(rule, "true", [1]), /hợp lệ/);
    assert.throws(() => restorePurchaseLimit({ enabled: true }), /đã lưu/);
    assert.equal(restorePurchaseLimit(undefined).enabled, false);
});
