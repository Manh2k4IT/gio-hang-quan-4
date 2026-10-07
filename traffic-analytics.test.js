const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { createTrafficState, restoreTrafficState, recordTrafficVisit, recordProductClick, getTrafficInsights } = require("./traffic-analytics");

test("counts views, deduplicates browsers across days, and uses Vietnam dates", () => {
    const now = new Date("2026-10-07T18:00:00Z");
    const state = createTrafficState(now);
    recordTrafficVisit(state, "browser-one", now);
    recordTrafficVisit(state, "browser-one", now);
    recordTrafficVisit(state, "browser-two", now);
    recordTrafficVisit(state, "browser-one", new Date("2026-10-08T18:00:00Z"));
    const result = getTrafficInsights(state, 7, new Date("2026-10-08T18:00:00Z"));
    assert.equal(result.totalViews, 4);
    assert.equal(result.uniqueVisitors, 2);
    assert.equal(result.todayViews, 1);
    assert.equal(result.averageDailyViews, 0.6);
    assert.deepEqual(result.daily.slice(-2), [
        { date: "2026-10-08", views: 3, visitors: 2 },
        { date: "2026-10-09", views: 1, visitors: 1 }
    ]);
    assert.equal(JSON.stringify(state).includes("browser-one"), false);
    assert.equal(JSON.stringify(result).includes(state.daily["2026-10-08"].visitors[0]), false);
});

test("keeps the 90-day boundary and removes older dates", () => {
    const state = createTrafficState();
    recordTrafficVisit(state, "old-browser", new Date("2026-07-09T00:00:00Z"));
    recordTrafficVisit(state, "boundary-browser", new Date("2026-07-10T00:00:00Z"));
    recordTrafficVisit(state, "today-browser", new Date("2026-10-07T00:00:00Z"));
    assert.equal(state.daily["2026-07-09"], undefined);
    const result = getTrafficInsights(state, 90, new Date("2026-10-07T00:00:00Z"));
    assert.equal(result.daily.length, 90);
    assert.equal(result.daily[0].date, "2026-07-10");
    assert.equal(result.totalViews, 2);
    assert.equal(getTrafficInsights(state, 7, new Date("2026-10-07T00:00:00Z")).totalViews, 1);
    assert.throws(() => getTrafficInsights(state, 0), /Invalid/);
});

test("restores saved analytics and initializes legacy state", () => {
    const state = createTrafficState();
    recordTrafficVisit(state, "browser-one");
    assert.deepEqual(restoreTrafficState(JSON.parse(JSON.stringify(state))), state);
    assert.deepEqual(restoreTrafficState(undefined).daily, {});
    assert.throws(() => restoreTrafficState({ startedAt: "invalid", daily: {} }), /Invalid/);
    assert.throws(() => restoreTrafficState({ startedAt: new Date().toISOString(), daily: { bad: {} } }), /Invalid/);
    assert.equal(getTrafficInsights(createTrafficState(), 30).totalViews, 0);
});

test("custom ranges include both boundaries and keep today's metric independent", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const state = createTrafficState(now);
    recordTrafficVisit(state, "browser-one", new Date("2026-10-01T00:00:00Z"));
    recordTrafficVisit(state, "browser-one", new Date("2026-10-03T00:00:00Z"));
    recordTrafficVisit(state, "browser-two", now);
    const result = getTrafficInsights(state, { startDate: "2026-10-01", endDate: "2026-10-03" }, now);
    assert.equal(result.days, 3);
    assert.equal(result.totalViews, 2);
    assert.equal(result.uniqueVisitors, 1);
    assert.equal(result.todayViews, 1);
    assert.equal(result.averageDailyViews, 0.7);
    assert.deepEqual(result.daily, [
        { date: "2026-10-01", views: 1, visitors: 1 },
        { date: "2026-10-02", views: 0, visitors: 0 },
        { date: "2026-10-03", views: 1, visitors: 1 }
    ]);
    assert.equal(getTrafficInsights(state, { startDate: "2026-10-03", endDate: "2026-10-03" }, now).days, 1);
    assert.equal(getTrafficInsights(state, { startDate: "2026-07-10", endDate: "2026-10-07" }, now).days, 90);
    for (const range of [
        { startDate: "2026-10-03", endDate: "2026-10-01" },
        { startDate: "2026-07-09", endDate: "2026-10-07" },
        { startDate: "2026-10-07", endDate: "2026-10-08" },
        { startDate: "2026-09-31", endDate: "2026-10-07" },
        { startDate: "bad", endDate: "2026-10-07" },
        { startDate: "2026-10-07" },
        { startDate: ["2026-10-07"], endDate: "2026-10-07" }
    ]) {
        assert.throws(() => getTrafficInsights(state, range, now), RangeError);
    }
});

test("counts orders by creation date using inclusive Vietnam day boundaries", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const orders = [
        { id: 1, createdAt: "2026-09-30T16:59:59.999Z", status: "pending" },
        { id: 2, createdAt: "2026-09-30T17:00:00Z", status: "pending" },
        { id: 3, createdAt: "2026-10-03T16:59:59.999Z", status: "done" },
        { id: 4, createdAt: "2026-10-03T17:00:00Z", status: "confirmed" },
        { id: 5, createdAt: "2026-10-02T00:00:00Z", updatedAt: now.toISOString(), status: "confirmed" }
    ];
    const state = createTrafficState(now);
    const range = { startDate: "2026-10-01", endDate: "2026-10-03" };
    assert.equal(getTrafficInsights(state, range, now, orders).totalOrders, 3);
    assert.equal(getTrafficInsights(state, range, now, []).totalOrders, 0);
    assert.equal(getTrafficInsights(state, { startDate: "2026-10-02", endDate: "2026-10-02" }, now, orders).totalOrders, 1);
    const undated = getTrafficInsights(state, range, now, [{ id: 6, createdAt: "bad" }, { id: 7 }]);
    assert.equal(undated.totalOrders, 0);
    assert.equal(undated.undatedOrders, 2);
});

test("ranks at most ten clicked products, aggregates days, and restores snapshots", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const state = createTrafficState(now);
    for (let id = 1; id <= 12; id += 1) {
        for (let click = 0; click < id; click += 1) {
            recordProductClick(state, { id, name: `Product ${id}`, sku: `SKU-${id}` }, now);
        }
    }
    recordProductClick(state, { id: 1, name: "Older name", sku: "SKU-1" }, new Date("2026-10-06T00:00:00Z"));
    recordProductClick(state, { id: 1, name: "Latest name", sku: "SKU-1" }, now);
    const result = getTrafficInsights(state, 7, now);
    assert.equal(result.topProductClicks.length, 10);
    assert.deepEqual(result.topProductClicks.map((product) => product.productId), [12, 11, 10, 9, 8, 7, 6, 5, 4, 1]);
    assert.equal(result.topProductClicks[0].clicks, 12);
    assert.equal(result.topProductClicks[9].clicks, 3);
    assert.equal(result.topProductClicks[9].name, "Latest name");
    assert.equal(result.totalViews, 0);
    const yesterday = getTrafficInsights(state, { startDate: "2026-10-06", endDate: "2026-10-06" }, now);
    assert.deepEqual(yesterday.topProductClicks, [{ productId: 1, name: "Older name", sku: "SKU-1", clicks: 1 }]);
    assert.deepEqual(restoreTrafficState(JSON.parse(JSON.stringify(state))), state);
    assert.throws(() => recordProductClick(state, { id: -1 }), /Invalid product/);
    recordProductClick(state, { id: 99, name: "Expired", sku: "" }, new Date("2026-07-09T00:00:00Z"));
    recordProductClick(state, { id: 1, name: "Latest name", sku: "SKU-1" }, now);
    assert.equal(state.daily["2026-07-09"], undefined);
    assert.deepEqual(getTrafficInsights(createTrafficState(now), 7, now).topProductClicks, []);
});

test("HTTP tracking excludes admin/API/bots/prefetch and persists after restart", { timeout: 30000 }, async (t) => {
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "gusa-traffic-test-"));
    let child;
    t.after(async () => {
        if (child && child.exitCode === null) {
            const exited = once(child, "exit");
            child.kill();
            await exited;
        }
        await fs.rm(testDir, { recursive: true, force: true });
    });
    const listener = net.createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    async function start() {
        child = spawn(process.execPath, ["server.js"], {
            cwd: __dirname,
            env: {
                ...process.env, PORT: String(port), ALLOW_PORT_FALLBACK: "0",
                DATA_DIR: path.join(testDir, "data"), UPLOAD_DIR: path.join(testDir, "uploads"),
                STARTUP_IMAGE_MAINTENANCE_ENABLED: "false"
            },
            stdio: ["ignore", "pipe", "pipe"]
        });
        let output = "";
        child.stdout.on("data", (chunk) => { output += chunk; });
        child.stderr.on("data", (chunk) => { output += chunk; });
        for (let attempt = 0; attempt < 100; attempt += 1) {
            if (child.exitCode !== null) assert.fail(`Test server exited: ${output}`);
            if (output.includes(`http://localhost:${port}/shop.html`)) return;
            await delay(50);
        }
        assert.fail(`Test server did not start: ${output}`);
    }
    async function insights(days = 7) {
        const res = await fetch(`${origin}/traffic-insights?days=${days}`);
        assert.equal(res.status, 200);
        return res.json();
    }
    async function visit(url, headers = {}, method = "GET") {
        const res = await fetch(`${origin}${url}`, { method, headers });
        await res.text();
        assert.equal(res.status, 200);
        return res;
    }
    await start();
    assert.equal((await insights()).totalViews, 0);
    const first = await visit("/shop.html");
    const cookie = first.headers.get("set-cookie").split(";")[0];
    await visit("/shop.html?category=LINEN", { cookie });
    await visit("/shop.html?productId=1", { cookie });
    await visit("/shop.html");
    await visit("/admin.html", { cookie });
    await visit("/products/all", { cookie });
    await visit("/shop.html", { cookie }, "HEAD");
    await visit("/shop.html", { "user-agent": "Googlebot" });
    await visit("/shop.html", { "sec-purpose": "prefetch" });
    await visit("/");
    const expected = await insights();
    assert.equal(expected.totalViews, 5);
    assert.equal(expected.uniqueVisitors, 3);
    assert.deepEqual(expected.topProductClicks.map((product) => [product.productId, product.clicks]), [[1, 1]]);
    await visit("/shop.html?productId=999999");
    await visit("/shop.html?productId=1", { "user-agent": "Googlebot" });
    await visit("/shop.html?productId=1", { "sec-purpose": "prefetch" });
    assert.deepEqual((await insights()).topProductClicks, expected.topProductClicks);
    expected.totalViews += 1;
    expected.todayViews += 1;
    expected.uniqueVisitors += 1;
    expected.averageDailyViews = Number((expected.totalViews / 7).toFixed(1));
    expected.daily[expected.daily.length - 1].views += 1;
    expected.daily[expected.daily.length - 1].visitors += 1;
    assert.equal((await fetch(`${origin}/traffic-insights?days=8`)).status, 400);
    const rangeRes = await fetch(`${origin}/traffic-insights?startDate=${expected.today}&endDate=${expected.today}`);
    assert.equal(rangeRes.status, 200);
    const rangeData = await rangeRes.json();
    assert.equal(rangeData.days, 1);
    assert.equal(rangeData.totalViews, 6);
    assert.equal(rangeData.uniqueVisitors, 4);
    assert.equal(rangeData.daily.length, 1);
    for (const query of [
        `startDate=${expected.today}`,
        `startDate=invalid&endDate=${expected.today}`,
        `startDate=${expected.today}&endDate=${expected.earliestDate}`,
        `startDate=${expected.today}&endDate=2099-01-01`
    ]) {
        const invalid = await fetch(`${origin}/traffic-insights?${query}`);
        assert.equal(invalid.status, 400);
        assert.ok((await invalid.json()).error);
    }
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const saved = JSON.parse(await fs.readFile(path.join(testDir, "data", "state.json"), "utf8"));
        if (saved.trafficAnalytics && getTrafficInsights(saved.trafficAnalytics, 7).totalViews === 6) break;
        if (attempt === 99) assert.fail("Traffic was not saved");
        await delay(50);
    }
    const exited = once(child, "exit");
    child.kill();
    await exited;
    await start();
    assert.deepEqual(await insights(), expected);
});
