const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { rateLimit } = require("express-rate-limit");

const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = "gusa_admin_session";

function installAdminAuth(app) {
    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const hash = String(process.env.ADMIN_PASSWORD_HASH || "");
    const match = hash.match(/^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/);
    const configured = Boolean(email && match);
    if (!configured) console.error("Admin login unavailable: configure ADMIN_EMAIL and ADMIN_PASSWORD_HASH.");
    const sessionsFile = path.join(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data"), "admin-sessions.json");
    const credentialKey = crypto.createHash("sha256").update(`${email}:${hash}`).digest("hex");
    let sessions = new Map();
    if (fs.existsSync(sessionsFile)) {
        const saved = JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
        if (!saved || typeof saved.credentialKey !== "string" || !Array.isArray(saved.sessions)
            || saved.sessions.some(entry => !Array.isArray(entry) || entry.length !== 2
                || !/^[a-f0-9]{64}$/.test(entry[0]) || !Number.isSafeInteger(entry[1]))) {
            throw new Error("Invalid saved admin sessions");
        }
        if (configured && saved.credentialKey === credentialKey) {
            sessions = new Map(saved.sessions.filter(([, expiry]) => expiry > Date.now()));
        }
    }

    function tokenKey(token) {
        return crypto.createHash("sha256").update(token).digest("hex");
    }

    function persistSessions() {
        fs.mkdirSync(path.dirname(sessionsFile), { recursive: true });
        fs.writeFileSync(`${sessionsFile}.tmp`, JSON.stringify({ credentialKey, sessions: [...sessions] }), { mode: 0o600 });
        fs.renameSync(`${sessionsFile}.tmp`, sessionsFile);
    }

    function sessionToken(req) {
        const cookie = String(req.headers.cookie || "").split(";").map(part => part.trim())
            .find(part => part.startsWith(`${COOKIE_NAME}=`));
        return cookie ? cookie.slice(COOKIE_NAME.length + 1) : "";
    }

    function authenticated(req) {
        const token = tokenKey(sessionToken(req));
        const expiresAt = sessions.get(token);
        if (!expiresAt || expiresAt <= Date.now()) {
            sessions.delete(token);
            return false;
        }
        return true;
    }

    function setCookie(req, res, token, maxAge) {
        res.cookie(COOKIE_NAME, token, {
            httpOnly: true, sameSite: "strict", secure: req.secure,
            path: "/", maxAge
        });
    }

    function sameOrigin(req, res, next) {
        const origin = req.get("origin");
        if ((origin && origin !== `${req.protocol}://${req.get("host")}`)
            || req.get("x-admin-request") !== "1") {
            return res.status(403).json({ error: "Yêu cầu quản trị không hợp lệ" });
        }
        next();
    }

    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, limit: 10,
        standardHeaders: true, legacyHeaders: false,
        message: { error: "Đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút." }
    });

    app.use("/admin/auth", (req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
    });
    app.get("/admin/auth/session", (req, res) => {
        res.json({ authenticated: authenticated(req) });
    });
    app.post("/admin/auth/login", loginLimiter, sameOrigin, async (req, res, next) => {
        if (!configured) return res.status(503).json({ error: "Chưa cấu hình tài khoản quản trị trên máy chủ" });
        const suppliedEmail = req.body?.email;
        const password = req.body?.password;
        if (typeof suppliedEmail !== "string" || typeof password !== "string" || password.length > 256) {
            return res.status(400).json({ error: "Thông tin đăng nhập không hợp lệ" });
        }
        try {
            const candidate = await scrypt(password, match[1], 64);
            const validPassword = crypto.timingSafeEqual(candidate, Buffer.from(match[2], "hex"));
            if (!validPassword || suppliedEmail.trim().toLowerCase() !== email) {
                return res.status(401).json({ error: "Tài khoản hoặc mật khẩu không đúng" });
            }
            for (const [token, expiry] of sessions) {
                if (expiry <= Date.now()) sessions.delete(token);
            }
            sessions.delete(tokenKey(sessionToken(req)));
            const token = crypto.randomBytes(32).toString("hex");
            sessions.set(tokenKey(token), Date.now() + SESSION_MS);
            persistSessions();
            setCookie(req, res, token, SESSION_MS);
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    });
    app.post("/admin/auth/logout", sameOrigin, (req, res) => {
        sessions.delete(tokenKey(sessionToken(req)));
        persistSessions();
        setCookie(req, res, "", 0);
        res.json({ success: true });
    });

    app.use((req, res, next) => {
        let routePath;
        try {
            routePath = path.posix.normalize(decodeURIComponent(req.path)).toLowerCase();
        } catch (error) {
            if (!(error instanceof URIError)) throw error;
            return res.status(400).json({ error: "Đường dẫn không hợp lệ" });
        }
        req.isAdminAuthenticated = authenticated(req);
        const adminPage = /^\/admin(?:\.html|\/)?$/i.test(routePath);
        const adminRead = ["/products/all", "/orders", "/traffic-insights", "/diagnostics/save-health", "/settings/purchase-limit"].includes(routePath.replace(/\/$/, ""));
        const adminWrite = !["GET", "HEAD", "OPTIONS"].includes(req.method)
            && /^\/(?:product|order|settings|upload)(?:\/|$)/i.test(routePath);
        if (!adminPage && !adminRead && !adminWrite) return next();
        res.setHeader("Cache-Control", "no-store");
        if (!req.isAdminAuthenticated) {
            if (adminPage) return res.redirect("/admin-login.html");
            return res.status(401).json({ error: "Vui lòng đăng nhập quản trị", code: "ADMIN_LOGIN_REQUIRED" });
        }
        if (adminWrite) return sameOrigin(req, res, next);
        next();
    });
}

module.exports = { installAdminAuth };
