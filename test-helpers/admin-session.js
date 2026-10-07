const crypto = require("node:crypto");
const password = crypto.randomBytes(24).toString("hex");
const salt = crypto.randomBytes(16).toString("hex");
const email = "admin@example.test";
const adminTestEnv = {
    ADMIN_EMAIL: email,
    ADMIN_PASSWORD_HASH: `scrypt:${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`
};

function createAdminTestFetch(origin) {
    let adminCookie = "";
    const authenticatedFetch = (url, options = {}) => {
        const headers = new Headers(options.headers);
        if (adminCookie) headers.set("cookie", [headers.get("cookie"), adminCookie].filter(Boolean).join("; "));
        headers.set("X-Admin-Request", "1");
        return fetch(url, { ...options, headers });
    };
    authenticatedFetch.login = async () => {
        const response = await authenticatedFetch(`${origin}/admin/auth/login`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        if (!response.ok) throw new Error(`Test admin login failed: ${await response.text()}`);
        const sessionCookie = response.headers.getSetCookie().find(cookie => cookie.startsWith("gusa_admin_session="));
        if (!sessionCookie) throw new Error("Test login did not set admin session cookie");
        adminCookie = sessionCookie.split(";")[0];
    };
    return authenticatedFetch;
}

module.exports = { adminTestEnv, createAdminTestFetch };
