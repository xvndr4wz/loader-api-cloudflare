// functions/api/loader/kv-helper.js
// HELPER DENGAN PREFIX UNTUK MULTIPLE KV

const SETTINGS = {
    SESSION_TTL: 10000,
    RATE_LIMIT_MS: 10000
};

export default function(kv) {
    // ========== SESSION FUNCTIONS (Prefix: session:) ==========
    
    async function saveSession(sessionId, sessionData) {
        try {
            await kv.put(`session:${sessionId}`, JSON.stringify(sessionData), {
                expirationTtl: 30
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    async function getSession(sessionId) {
        try {
            const data = await kv.get(`session:${sessionId}`);
            if (!data) return null;
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    async function deleteSession(sessionId) {
        try {
            await kv.delete(`session:${sessionId}`);
            return true;
        } catch (e) {
            return false;
        }
    }

    // ========== RATE LIMIT FUNCTIONS (Prefix: ratelimit:) ==========
    
    async function saveRateLimit(ip, data) {
        try {
            await kv.put(`ratelimit:${ip}`, JSON.stringify(data), {
                expirationTtl: 15
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    async function getRateLimit(ip) {
        try {
            const data = await kv.get(`ratelimit:${ip}`);
            if (!data) return null;
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }

    // ========== FUNGSI UNTUK LIST ALL SESSIONS ==========
    async function listAllSessions() {
        try {
            const { keys } = await kv.list({ prefix: 'session:' });
            return keys.map(key => key.name);
        } catch (e) {
            return [];
        }
    }

    // ========== FUNGSI UNTUK LIST ALL RATE LIMITS ==========
    async function listAllRateLimits() {
        try {
            const { keys } = await kv.list({ prefix: 'ratelimit:' });
            return keys.map(key => key.name);
        } catch (e) {
            return [];
        }
    }

    // ========== SESSION MAKER ==========
    
    async function makeSession(ownerIp, stepSequence, currentIndex) {
        const now = Date.now();
        const ipPart = ownerIp.split('.').pop() || "0";
        const seed = parseInt(ipPart) + Math.floor(Math.random() * 10000);
        const newSessionID = seed.toString(36).substring(0, 4).padEnd(4, 'x');
        const nextKey = Math.random().toString(36).substring(2, 8);

        const sessionData = {
            ownerIP: ownerIp,
            stepSequence: stepSequence,
            currentIndex: currentIndex,
            nextKey: nextKey,
            lastTime: now,
            used: false
        };

        await saveSession(newSessionID, sessionData);
        return { newSessionID, nextKey };
    }

    // ========== EXPIRE SESSION ==========
    
    async function expireSession(id) {
        const session = await getSession(id);
        if (session) {
            session.used = true;
            await saveSession(id, session);
            setTimeout(async () => {
                await deleteSession(id);
            }, SETTINGS.SESSION_TTL);
        }
    }

    // ========== CLEANUP (Manual) ==========
    async function cleanup() {
        // Hapus session yang sudah expired
        // KV sudah auto-expire, tapi ini untuk manual cleanup
        const sessions = await listAllSessions();
        for (const key of sessions) {
            const data = await kv.get(key);
            if (data) {
                const parsed = JSON.parse(data);
                if (parsed.used && (Date.now() - parsed.lastTime > SETTINGS.SESSION_TTL)) {
                    await kv.delete(key);
                }
            }
        }
    }

    // ========== EXPORT ==========
    return {
        saveSession,
        getSession,
        deleteSession,
        saveRateLimit,
        getRateLimit,
        makeSession,
        expireSession,
        cleanup,
        listAllSessions,
        listAllRateLimits
    };
    }
