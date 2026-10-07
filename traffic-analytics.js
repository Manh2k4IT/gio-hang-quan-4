const crypto = require("crypto");

const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

function getTrafficDate(now = new Date()) {
    const parts = dateFormatter.formatToParts(now);
    const value = (type) => parts.find((part) => part.type === type).value;
    return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftDate(date, offset) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}

function createTrafficState(now = new Date()) {
    return { startedAt: now.toISOString(), daily: {} };
}

function restoreTrafficState(value) {
    if (value === undefined) return createTrafficState();
    if (!value || !Number.isFinite(Date.parse(value.startedAt)) || !value.daily || typeof value.daily !== "object" || Array.isArray(value.daily)) {
        throw new Error("Invalid saved traffic analytics");
    }
    const state = { startedAt: value.startedAt, daily: {} };
    for (const [date, record] of Object.entries(value.daily)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
            || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
            || !record || !Number.isSafeInteger(record.views) || record.views < 0
            || !Array.isArray(record.visitors)
            || record.visitors.some((visitor) => typeof visitor !== "string" || !/^[a-f0-9]{64}$/.test(visitor))) {
            throw new Error("Invalid saved daily traffic analytics");
        }
        state.daily[date] = { views: record.views, visitors: [...new Set(record.visitors)] };
        if (record.productClicks !== undefined) {
            if (!record.productClicks || typeof record.productClicks !== "object" || Array.isArray(record.productClicks)) {
                throw new Error("Invalid saved product clicks");
            }
            state.daily[date].productClicks = {};
            for (const [id, click] of Object.entries(record.productClicks)) {
                if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !click
                    || !Number.isSafeInteger(click.clicks) || click.clicks < 1
                    || typeof click.name !== "string" || typeof click.sku !== "string") {
                    throw new Error("Invalid saved product click record");
                }
                state.daily[date].productClicks[id] = { name: click.name, sku: click.sku, clicks: click.clicks };
            }
        }
    }
    return state;
}

function getDailyTrafficRecord(state, now) {
    const date = getTrafficDate(now);
    const earliestDate = shiftDate(date, -(RETENTION_DAYS - 1));
    for (const savedDate of Object.keys(state.daily)) {
        if (savedDate < earliestDate) delete state.daily[savedDate];
    }
    return state.daily[date] || (state.daily[date] = { views: 0, visitors: [] });
}

function recordTrafficVisit(state, sessionId, now = new Date()) {
    const record = getDailyTrafficRecord(state, now);
    const visitor = crypto.createHash("sha256").update(sessionId).digest("hex");
    record.views += 1;
    if (!record.visitors.includes(visitor)) record.visitors.push(visitor);
}

function recordProductClick(state, product, now = new Date()) {
    if (!product || !Number.isSafeInteger(product.id) || product.id <= 0) {
        throw new Error("Invalid product for click analytics");
    }
    const record = getDailyTrafficRecord(state, now);
    if (!record.productClicks) record.productClicks = {};
    const id = String(product.id);
    const previous = record.productClicks[id];
    record.productClicks[id] = {
        name: String(product.name || "Sản phẩm"),
        sku: String(product.sku || ""),
        clicks: (previous ? previous.clicks : 0) + 1
    };
}

function resolveTrafficRange(range, now = new Date()) {
    const today = getTrafficDate(now);
    const earliestDate = shiftDate(today, -(RETENTION_DAYS - 1));
    if (typeof range === "number") {
        if (![7, 30, 90].includes(range)) throw new RangeError("Invalid traffic date range");
        return { startDate: shiftDate(today, -(range - 1)), endDate: today, days: range, today, earliestDate };
    }
    const isValidDate = (value) => typeof value === "string"
        && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!range || !isValidDate(range.startDate) || !isValidDate(range.endDate)) {
        throw new RangeError("Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ");
    }
    const { startDate, endDate } = range;
    if (startDate > endDate) throw new RangeError("Ngày bắt đầu không được sau ngày kết thúc");
    if (startDate < earliestDate || endDate > today) {
        throw new RangeError("Chỉ có thể xem trong 90 ngày gần nhất, không chọn ngày tương lai");
    }
    const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS + 1;
    return { startDate, endDate, days, today, earliestDate };
}

function getTrafficInsights(state, range, now = new Date(), orders = []) {
    const { startDate, endDate, days, today, earliestDate } = resolveTrafficRange(range, now);
    let undatedOrders = 0;
    const totalOrders = orders.filter((order) => {
        const createdAt = new Date(order.createdAt);
        if (!order.createdAt || !Number.isFinite(createdAt.getTime())) {
            undatedOrders += 1;
            return false;
        }
        const date = getTrafficDate(createdAt);
        return date >= startDate && date <= endDate;
    }).length;
    const visitors = new Set();
    const daily = [];
    const productClicks = new Map();
    let totalViews = 0;
    for (let offset = 0; offset < days; offset += 1) {
        const date = shiftDate(startDate, offset);
        const record = state.daily[date];
        const views = record ? record.views : 0;
        const visitorIds = record ? record.visitors : [];
        visitorIds.forEach((visitor) => visitors.add(visitor));
        totalViews += views;
        for (const [id, click] of Object.entries(record ? record.productClicks || {} : {})) {
            const previous = productClicks.get(id);
            productClicks.set(id, {
                productId: Number(id),
                name: click.name,
                sku: click.sku,
                clicks: (previous ? previous.clicks : 0) + click.clicks
            });
        }
        daily.push({ date, views, visitors: visitorIds.length });
    }
    return {
        startedAt: state.startedAt,
        timeZone: "Asia/Ho_Chi_Minh",
        retentionDays: RETENTION_DAYS,
        days,
        startDate,
        endDate,
        today,
        earliestDate,
        totalViews,
        totalOrders,
        undatedOrders,
        topProductClicks: [...productClicks.values()].sort((a, b) => b.clicks - a.clicks || a.productId - b.productId).slice(0, 10),
        uniqueVisitors: visitors.size,
        todayViews: state.daily[today] ? state.daily[today].views : 0,
        averageDailyViews: Number((totalViews / days).toFixed(1)),
        daily
    };
}

module.exports = { createTrafficState, restoreTrafficState, recordTrafficVisit, recordProductClick, getTrafficInsights };
