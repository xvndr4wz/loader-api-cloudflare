// session-do-worker/src/index.js
// Worker ini KHUSUS untuk meng-host class Durable Object "SessionManager".
// Tidak menerima traffic publik langsung — hanya dipanggil oleh Pages Function
// (functions/api/v1/testing1.js) lewat binding SESSION_DO.

const SETTINGS = {
    RATE_LIMIT_MS: 10000,
    RATE_LIMIT_MAX: 3,
    SESSION_TTL_MS: 600000, // 10 menit
};

export class SessionManager {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map();
        this.rateLimits = new Map();
        this.hydrated = false;
    }

    async hydrate() {
        if (this.hydrated) return;
        const stored = await this.state.storage.list();
        for (const [key, value] of stored) {
            if (key.startsWith('session:')) {
                this.sessions.set(key.slice(8), value);
            } else if (key.startsWith('ratelimit:')) {
                this.rateLimits.set(key.slice(10), value);
            }
        }
        this.hydrated = true;
    }

    async fetch(request) {
        await this.hydrate();
        const url = new URL(request.url);
        const action = url.pathname.replace(/^\//, '');
        const body = request.method === 'POST' ? await request.json() : {};

        switch (action) {
            case 'check-rate-limit':
                return this.checkRateLimit(body.ip);
            case 'create-session':
                return this.createSession(body.ip, body.stepSequence, body.currentIndex);
            case 'validate-session':
                return this.validateSession(body.id, body.ip, body.step, body.key);
            case 'mark-used':
                return this.markUsed(body.id);
            default:
                return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400 });
        }
    }

    async checkRateLimit(ip) {
        const now = Date.now();
        const key = `ratelimit:${ip}`;
        let data = this.rateLimits.get(ip);

        if (data) {
            const elapsed = now - data.firstRequestAt;
            if (elapsed < SETTINGS.RATE_LIMIT_MS) {
                data.count++;
                this.rateLimits.set(ip, data);
                await this.state.storage.put(key, data);

                if (data.count > SETTINGS.RATE_LIMIT_MAX) {
                    const sisaCooldown = Math.ceil((SETTINGS.RATE_LIMIT_MS - elapsed) / 1000);
                    return this.json({ blocked: true, count: data.count, sisaCooldown });
                }
                return this.json({ blocked: false, count: data.count });
            } else {
                data = { count: 1, firstRequestAt: now };
                this.rateLimits.set(ip, data);
                await this.state.storage.put(key, data);
                return this.json({ blocked: false, count: 1 });
            }
        } else {
            data = { count: 1, firstRequestAt: now };
            this.rateLimits.set(ip, data);
            await this.state.storage.put(key, data);
            return this.json({ blocked: false, count: 1 });
        }
    }

    async createSession(ip, stepSequence, currentIndex) {
        const now = Date.now();
        const ipPart = ip.split('.').pop() || "0";
        const seed = parseInt(ipPart) + Math.floor(Math.random() * 10000);
        const sessionID = seed.toString(36).substring(0, 4).padEnd(4, 'x');
        const nextKey = Math.random().toString(36).substring(2, 8);

        const sessionData = {
            ownerIP: ip,
            stepSequence,
            currentIndex,
            nextKey,
            lastTime: now,
            used: false,
        };

        this.sessions.set(sessionID, sessionData);
        await this.state.storage.put(`session:${sessionID}`, sessionData);
        this.scheduleCleanup();

        return this.json({ sessionID, nextKey });
    }

    async validateSession(id, ip, step, key) {
        const session = this.sessions.get(id);

        if (!session || session.ownerIP !== ip) {
            return this.json({ valid: false, reason: 'not_found_or_ip_mismatch' });
        }

        if (session.used === true) {
            return this.json({ valid: false, reason: 'replay_attack', session });
        }

        if (step !== session.stepSequence[session.currentIndex]) {
            session.used = true;
            this.sessions.set(id, session);
            await this.state.storage.put(`session:${id}`, session);
            return this.json({ valid: false, reason: 'wrong_step', session });
        }

        if (session.nextKey !== key) {
            session.used = true;
            this.sessions.set(id, session);
            await this.state.storage.put(`session:${id}`, session);
            return this.json({ valid: false, reason: 'invalid_key', session });
        }

        return this.json({ valid: true, session });
    }

    async markUsed(id) {
        const session = this.sessions.get(id);
        if (session) {
            session.used = true;
            this.sessions.set(id, session);
            await this.state.storage.put(`session:${id}`, session);
        }
        return this.json({ ok: true });
    }

    scheduleCleanup() {
        this.state.storage.setAlarm(Date.now() + SETTINGS.SESSION_TTL_MS).catch(() => {});
    }

    async alarm() {
        const now = Date.now();
        for (const [id, s] of this.sessions) {
            if (now - s.lastTime > SETTINGS.SESSION_TTL_MS) {
                this.sessions.delete(id);
                await this.state.storage.delete(`session:${id}`);
            }
        }
        for (const [ip, r] of this.rateLimits) {
            if (now - r.firstRequestAt > SETTINGS.RATE_LIMIT_MS * 5) {
                this.rateLimits.delete(ip);
                await this.state.storage.delete(`ratelimit:${ip}`);
            }
        }
    }

    json(obj) {
        return new Response(JSON.stringify(obj), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// Default export wajib ada supaya Worker ini valid & bisa di-deploy,
// walaupun tidak ada yang mengakses fetch() ini secara langsung dari luar.
export default {
    async fetch(request) {
        return new Response("Session DO worker is running. This endpoint is not meant to be accessed directly.", { status: 200 });
    }
};
          
