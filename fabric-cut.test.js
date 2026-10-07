const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { Script } = require("node:vm");
const QuantityUtils = require("./public/js/quantity-utils");
const { adminTestEnv, createAdminTestFetch } = require("./test-helpers/admin-session");

test("meter quantity helpers preserve decimals and parse comma input", () => {
    assert.equal(QuantityUtils.parseQuantityInputValue("2,7m"), 2.7);
    assert.equal(QuantityUtils.formatQuantityValue(2.7), "2.7");
    assert.equal(QuantityUtils.roundQuantity(1.1 + 0.1), 1.2);
    assert.equal(QuantityUtils.getQuantityStep(), 0.1);
    assert.equal(QuantityUtils.clampQuantity(10, 2.7, 1), 2.7);
});

test("storefront inline scripts have valid syntax", async () => {
    const html = await fs.readFile(path.join(__dirname, "public", "shop.html"), "utf8");
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        new Script(match[1]);
    }
});

test("fabric modes preserve decimal stock, snapshots, restrictions and restart state", { timeout: 30000 }, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gusa-fabric-test-"));
    const dataDir = path.join(directory, "data");
    await fs.mkdir(dataDir);
    let child;
    async function stop() {
        if (child && child.exitCode === null) {
            const exited = once(child, "exit");
            child.kill();
            await exited;
        }
    }
    t.after(async () => {
        await stop();
        await fs.rm(directory, { recursive: true, force: true });
    });
    const listener = net.createServer();
    listener.listen(0, "127.0.0.1");
    await once(listener, "listening");
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const fetch = createAdminTestFetch(origin);
    const product = (id, stock, length, extra = {}) => ({
        id, name: `Fabric ${id}`, sku: `FAB-${id}`, price: 100000, category: "LINEN",
        stock, image: `/uploads/test-${id}.jpg`, images: [`/uploads/test-${id}.jpg`],
        variantNames: [length ? `Blue (${length}m)` : "Blue"],
        variantCutLengths: [length], variantPrices: [100000],
        variantStocks: [stock], variantColorStocks: [stock], ...extra
    });
    await fs.writeFile(path.join(dataDir, "state.json"), JSON.stringify({
        products: [
            product(1, 5.4, 2.7), product(2, 10.5, null, { isFabricCut: false }),
            product(3, 6, 1.5, { isFabricCut: true }),
            product(4, 6, 1.5, {
                isFabricCut: true,
                images: ["/uploads/test-4.jpg", "/uploads/test-4b.jpg"],
                variantNames: ["Blue (1.5m)", "Red (1.5m)"],
                variantCutLengths: [1.5, 1.5],
                variantStocks: [3, 3], variantColorStocks: [3, 3]
            })
        ],
        cart: [], orders: [], settings: {}
    }));
    async function start() {
        child = spawn(process.execPath, ["server.js"], {
            cwd: __dirname,
            env: {
                ...process.env, ...adminTestEnv, PORT: String(port), ALLOW_PORT_FALLBACK: "0",
                DATA_DIR: dataDir, UPLOAD_DIR: path.join(directory, "uploads"),
                STARTUP_IMAGE_MAINTENANCE_ENABLED: "false"
            },
            stdio: ["ignore", "pipe", "pipe"]
        });
        let output = "";
        child.stdout.on("data", chunk => { output += chunk; });
        child.stderr.on("data", chunk => { output += chunk; });
        for (let attempt = 0; attempt < 100; attempt += 1) {
            if (child.exitCode !== null) assert.fail(`Server exited: ${output}`);
            if (output.includes(`http://localhost:${port}/shop.html`)) {
                await fetch.login();
                return;
            }
            await delay(50);
        }
        assert.fail(`Server not ready: ${output}`);
    }
    let cookie;
    async function request(url, body, method = "POST", expectedStatus = 200) {
        const response = await fetch(origin + url, {
            method: body === undefined ? "GET" : method,
            headers: { ...(cookie ? { cookie } : {}), "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const newCookie = response.headers.get("set-cookie");
        if (newCookie) cookie = newCookie.split(";")[0];
        const result = await response.json();
        assert.equal(response.status, expectedStatus, JSON.stringify(result));
        return result;
    }
    const buyer = phone => ({ customer: "Fabric test", phone, address: "Test address" });
    await start();
    let products = await request("/products/all");
    assert.equal(products.find(p => p.id === 1).isFabricCut, true);
    assert.equal(products.find(p => p.id === 2).isFabricCut, false);
    await request("/add", { id: 1 });
    let cart = await request("/cart");
    assert.equal(cart[0].comboStock, 2);
    assert.equal(cart[0].isFabricCut, true);
    await request("/change", { id: 1, qty: 1.5 }, "POST", 400);
    await request("/change", { id: 1, qty: 2 });
    await request("/checkout", buyer("0900000001"));
    products = await request("/products/all");
    assert.equal(products.find(p => p.id === 1).stock, 0);
    let orders = await request("/orders");
    assert.equal(orders[0].items[0].qty, 2);
    assert.equal(orders[0].items[0].isFabricCut, true);
    assert.equal(orders[0].items[0].variantCutLength, 2.7);
    await request("/add", { id: 2 });
    await request("/change", { id: 2, qty: 2.7 });
    assert.equal((await request("/cart"))[0].qty, 2.7);
    await request("/checkout", buyer("0900000002"));
    products = await request("/products/all");
    assert.equal(products.find(p => p.id === 2).stock, 7.8);
    orders = await request("/orders");
    const meterOrder = orders.find(order => order.phone === "0900000002");
    assert.equal(meterOrder.items[0].qty, 2.7);
    assert.equal(meterOrder.items[0].isFabricCut, false);
    assert.equal(meterOrder.subtotal, 270000);
    await request("/checkout/quick", { ...buyer("0900000003"), productId: 2, qty: 1.3 });
    assert.equal((await request("/products/all")).find(p => p.id === 2).stock, 6.5);
    await request("/checkout/quick", { ...buyer("0900000003"), productId: 2, qty: "abc" }, "POST", 400);
    await request("/checkout/quick", { ...buyer("0900000003"), productId: 3, qty: 1.5 }, "POST", 400);
    const config = await request("/settings/purchase-limit");
    await request("/settings/purchase-limit", { enabled: true, productIds: [2, 3], roundId: config.roundId }, "PUT", 400);
    await request("/add", { id: 3 });
    await request("/change", { id: 3, qty: 2 });
    await request("/add", { id: 4, variantIndex: 0 });
    await request("/add", { id: 4, variantIndex: 1 });
    const limited = await request("/settings/purchase-limit", { enabled: true, productIds: [3, 4], roundId: config.roundId }, "PUT");
    const cartBeforeBlock = await request("/cart");
    await request("/checkout", buyer("0900000004"), "POST", 400);
    assert.deepEqual(await request("/cart"), cartBeforeBlock);
    assert.equal((await request("/products/all")).find(p => p.id === 3).stock, 6);
    for (const item of cartBeforeBlock.filter(item => item.id === 4)) {
        await request("/change", { id: 4, qty: 0, itemKey: item.itemKey });
    }
    await request("/checkout/quick", { ...buyer("0900000004"), productId: 3, qty: 2 }, "POST", 400);
    await request("/change", { id: 3, qty: 1 });
    await request("/add", { id: 3 }, "POST", 400);
    await request("/change", { id: 3, qty: 2 }, "POST", 400);
    await request("/checkout", buyer("0900000004"));
    await request("/checkout/quick", { ...buyer("+84900000004"), productId: 3, qty: 1 }, "POST", 409);
    await request("/checkout/quick", { ...buyer("0900000004"), productId: 4, qty: 1, variantIndex: 0 });
    await request("/checkout/quick", { ...buyer("0900000004"), productId: 4, qty: 1, variantIndex: 1 }, "POST", 409);
    await request("/add", { id: 4, variantIndex: 0 });
    await request("/add", { id: 4, variantIndex: 1 }, "POST", 400);
    await request("/change", { id: 4, qty: 0 });
    await request("/checkout/quick", { ...buyer("0900000004"), productId: 2, qty: 1.1 });
    await request("/checkout/quick", { ...buyer("+84900000004"), productId: 2, qty: 1.2 });
    const finalMeterStock = (await request("/products/all")).find(p => p.id === 2).stock;
    assert.equal(finalMeterStock, 4.2);
    assert.equal((await request("/products/all")).find(p => p.id === 3).stock, 4.5);
    await request("/product/3", { isFabricCut: false }, "PUT");
    const meterMode = (await request("/products/all")).find(p => p.id === 3);
    assert.equal(meterMode.isFabricCut, false);
    assert.deepEqual(meterMode.variantCutLengths, [null]);
    assert.deepEqual((await request("/settings/purchase-limit")).productIds, [4]);
    await request("/checkout/quick", { ...buyer("0900000005"), productId: 3, qty: 1.5 });
    assert.equal((await request("/products/all")).find(p => p.id === 3).stock, 3);
    await request("/product/3", { isFabricCut: true, variantCutLengths: [1.5] }, "PUT");
    await request("/settings/purchase-limit", { enabled: true, productIds: [3], roundId: limited.roundId }, "PUT");
    const added = await request("/product/add", { ...product(10, 2.7, null), id: undefined });
    assert.equal(added.isFabricCut, false);
    const defaultCut = await request("/product/add", { ...product(11, 2.7, null), id: undefined, isFabricCut: true });
    assert.deepEqual(defaultCut.variantCutLengths, [1]);
    await request("/checkout/quick", { ...buyer("0900000006"), productId: defaultCut.id, qty: 3 });
    assert.equal((await request("/products/all")).find(p => p.id === defaultCut.id).stock, 0.7);
    assert.equal((await request("/orders")).find(order => order.phone === "0900000006").items[0].qty, 2);
    const beforeRestart = await request("/orders");
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const saved = JSON.parse(await fs.readFile(path.join(dataDir, "state.json"), "utf8"));
        if (JSON.stringify(saved.orders) === JSON.stringify(beforeRestart)
            && saved.purchaseLimit?.productIds.includes(3)) break;
        if (attempt === 99) assert.fail("Fabric orders and purchase rule were not persisted");
        await delay(50);
    }
    await stop();
    await start();
    assert.deepEqual(await request("/orders"), beforeRestart);
    products = await request("/products/all");
    assert.equal(products.find(p => p.id === 2).stock, finalMeterStock);
    assert.equal(products.find(p => p.id === 3).isFabricCut, true);
    await request("/checkout/quick", { ...buyer("0900000004"), productId: 3, qty: 1 }, "POST", 409);
});
