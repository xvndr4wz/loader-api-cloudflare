export default function kvHelper(kvNamespace) {
    if (!kvNamespace) {
        throw new Error("KV Namespace 'ndraawzontop' tidak ditemukan. Pastikan binding di wrangler.toml sudah benar.");
    }

    return {
        async makeSession(ownerIP, stepSequence, currentIndex) {
            const now = Date.now();
            const ipPart = ownerIP.split(".").pop() || "0";
            const seed = parseInt(ipPart) + Math.floor(Math.random() * 10000);
            const newSessionID = seed.toString(36).substring(0, 4).padEnd(4, "x");
            const nextKey = Math.random().toString(36).substring(2, 8);

            const sessionData = {
                ownerIP: ownerIP,
                stepSequence: stepSequence,
                currentIndex: currentIndex,
                nextKey: nextKey,
                lastTime: now,
                used: false
            };
            
            // Simpan data sesi ke KV dengan TTL 10 menit (600 detik)
            await kvNamespace.put(`session:${newSessionID}`, JSON.stringify(sessionData), { expirationTtl: 600 });
            return { newSessionID, nextKey };
        },

        async getSession(id) {
            const sessionData = await kvNamespace.get(`session:${id}`);
            return sessionData ? JSON.parse(sessionData) : null;
        },

        async expireSession(id) {
            const sessionData = await kvNamespace.get(`session:${id}`);
            if (sessionData) {
                const session = JSON.parse(sessionData);
                session.used = true;
                // Update KV dan tetap simpan selama 10 menit untuk mencegah replay attack
                await kvNamespace.put(`session:${id}`, JSON.stringify(session), { expirationTtl: 600 });
            }
        },

        async getRateLimit(ip) {
            const rateData = await kvNamespace.get(`ratelimit:${ip}`);
            return rateData ? JSON.parse(rateData) : null;
        },

        async saveRateLimit(ip, data) {
            // Simpan data rate limit ke KV dengan TTL 10 menit
            await kvNamespace.put(`ratelimit:${ip}`, JSON.stringify(data), { expirationTtl: 600 });
        }
    };
        }
        
