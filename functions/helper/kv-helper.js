import kvHelper from '../../helper/kv-helper.js';

const SETTINGS = {
    SESSION_TTL: 10000,
    RATE_LIMIT_MS: 10000
};

export default function(kv) {
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

    async function cleanup() {
        return true;
    }

    return {
        saveSession,
        getSession,
        deleteSession,
        saveRateLimit,
        getRateLimit,
        makeSession,
        expireSession,
        cleanup
    };
                }
