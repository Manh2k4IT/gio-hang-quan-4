const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { installAdminAuth } = require("./admin-auth");

test("admin auth gates pages and APIs, remembers devices, expires and revokes sessions", async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gusa-auth-test-"));
    const email = "auth@example.test";
    const password = crypto.randomBytes(24).toString("hex");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
    let server;
    let origin;
    const readPaths = ["/products/all", "/orders", "/traffic-insights", "/diagnostics/save-health", "/settings/purchase-limit"];
    const writePaths = ["/product/add", "/product/1", "/order/1", "/settings/logo", "/settings/purchase-limit", "/upload"];
    const originalEnv = { ADMIN_EMAIL: process.env.ADMIN_EMAIL, ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH, DATA_DIR: process.env.DATA_DIR };
    async function stop() {
        if (server) {
            server.closeAllConnections();
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            server = null;
        }
    }
    t.after(async () => {
        await stop();
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await fs.rm(directory, { recursive: true, force: true });
    });
    async function start(passwordHash = hash) {
        process.env.ADMIN_EMAIL = email;
        process.env.ADMIN_PASSWORD_HASH = passwordHash;
        process.env.DATA_DIR = directory;
        const app = express();
        app.set("trust proxy", 1);
        app.use(express.json());
        installAdminAuth(app);
        app.use(express.static(path.join(__dirname, "public")));
        for (const route of readPaths) app.get(route, (req, res) => res.json({ success: true }));
        for (const route of writePaths) app.post(route, (req, res) => res.json({ success: true }));
        app.get("/products", (req, res) => res.json([]));
        app.get("/cart", (req, res) => res.json([]));
        app.post("/checkout", (req, res) => res.json({ success: true }));
        server = await new Promise(resolve => {
            const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
        });
        origin = `http://127.0.0.1:${server.address().port}`;
    }
    const request = (url, options = {}) => fetch(origin + url, options);
    const login = (body = { email, password }, headers = {}) => request("/admin/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Admin-Request": "1", ...headers },
        body: JSON.stringify(body)
    });
    await start();
    for (const url of ["/admin.html", "/ADMIN.html", "/admin%2ehtml", "/admin.html?category=LINEN"]) {
        const response = await request(url, { redirect: "manual" });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), "/admin-login.html");
    }
    for (const url of readPaths) assert.equal((await request(url)).status, 401);
    for (const url of writePaths) assert.equal((await request(url, { method: "POST" })).status, 401);
    assert.equal((await request("/shop.html")).status, 200);
    assert.equal((await request("/products")).status, 200);
    assert.equal((await request("/cart")).status, 200);
    assert.equal((await request("/checkout", { method: "POST" })).status, 200);
    assert.equal((await request("/admin-login.html")).status, 200);
    assert.equal((await login({ email, password: "wrong" })).status, 401);
    assert.equal((await login({ email: "wrong@example.test", password })).status, 401);
    assert.equal((await login({ email, password }, { Origin: "https://evil.example" })).status, 403);
    const loggedIn = await login();
    assert.equal(loggedIn.status, 200);
    const setCookie = loggedIn.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Max-Age=2592000/);
    const cookie = setCookie.split(";")[0];
    assert.equal((await request("/admin.html", { headers: { cookie } })).status, 200);
    for (const url of readPaths) assert.equal((await request(url, { headers: { cookie } })).status, 200);
    assert.equal((await request("/product/add", { method: "POST", headers: { cookie } })).status, 403);
    assert.equal((await request("/product/add", { method: "POST", headers: { cookie, "X-Admin-Request": "1", origin: "https://evil.example" } })).status, 403);
    assert.equal((await request("/product/add", { method: "POST", headers: { cookie, "X-Admin-Request": "1" } })).status, 200);
    const stored = await fs.readFile(path.join(directory, "admin-sessions.json"), "utf8");
    assert.equal(stored.includes(cookie.split("=")[1]), false);
    assert.equal(stored.includes(password), false);
    await stop();
    await start();
    assert.equal((await request("/admin.html", { headers: { cookie } })).status, 200);
    assert.equal((await request("/admin/auth/session", { headers: { cookie } })).status, 200);
    const logout = await request("/admin/auth/logout", { method: "POST", headers: { cookie, "X-Admin-Request": "1" } });
    assert.equal(logout.status, 200);
    assert.equal((await request("/orders", { headers: { cookie } })).status, 401);
    await stop();
    await start();
    assert.equal((await request("/orders", { headers: { cookie } })).status, 401);
    const second = await login();
    const secondCookie = second.headers.get("set-cookie").split(";")[0];
    await stop();
    const saved = JSON.parse(await fs.readFile(path.join(directory, "admin-sessions.json"), "utf8"));
    saved.sessions = saved.sessions.map(([key]) => [key, Date.now() - 1]);
    await fs.writeFile(path.join(directory, "admin-sessions.json"), JSON.stringify(saved));
    await start();
    assert.equal((await request("/orders", { headers: { cookie: secondCookie } })).status, 401);
    const third = await login(undefined, { "X-Forwarded-Proto": "https", Origin: origin.replace("http:", "https:") });
    assert.match(third.headers.get("set-cookie"), /Secure/);
    const thirdCookie = third.headers.get("set-cookie").split(";")[0];
    await stop();
    await start(`scrypt:${salt}:${crypto.scryptSync("changed", salt, 64).toString("hex")}`);
    assert.equal((await request("/orders", { headers: { cookie: thirdCookie } })).status, 401);
    await stop();
    await start("");
    assert.equal((await login()).status, 503);
    assert.equal((await request("/orders")).status, 401);
    assert.equal((await request("/shop.html")).status, 200);
    await stop();
    await start();
    for (let attempt = 0; attempt < 10; attempt += 1) assert.equal((await login({ email, password: "wrong" })).status, 401);
    assert.equal((await login()).status, 429);
});
