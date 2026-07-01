const SETTINGS = {
    TOTAL_LAYERS: 5,
    RATE_LIMIT_MS: 10000,
    RATE_LIMIT_MAX: 3,
    SESSION_TTL: 10000,
    PLAIN_TEXT_URL: "https://pastefy.app/cMzbfLvJ/raw",
    REAL_SCRIPT_URL: "https://pastefy.app/Uy6DD9Dy/raw",
    LOGGER_SCRIPT_URL: "https://raw.githubusercontent.com/xvndr4wz/loader-api/refs/heads/main/api/logger/logscript.lua"
};

async function fetchRaw(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
        return null;
    }
}

function getRandomError() {
    const errorCodes = [400, 401, 403, 404, 500, 502, 503];
    return errorCodes[Math.floor(Math.random() * errorCodes.length)];
}

async function sendSecurityLogToLogJs(message, ip, type) {
    const data = JSON.stringify({
        type: "security",
        securityType: type,
        message: message,
        ip: ip
    });

    try {
        await fetch("https://ndraawzhub.pages.dev/api/logger/NZ-LOGGER", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data
        });
        return true;
    } catch (e) {
        return false;
    }
}

function obfuscateUrl(url) {
    const safeUrl = url.trim();
    const parts = [];
    let i = 0;
    while (i < safeUrl.length) {
        const len = Math.floor(Math.random() * 3) + 2;
        parts.push(safeUrl.substring(i, i + len));
        i += len;
    }

    const indices = [...Array(parts.length).keys()];
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    const shuffledParts = indices.map(i => parts[i]);
    const arrayStr = shuffledParts.map(p => {
        const escaped = p
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\0/g, '\\0');
        return `'${escaped}'`;
    }).join(',');

    const orderMap = new Array(parts.length);
    indices.forEach((originalIdx, shuffledIdx) => {
        orderMap[originalIdx] = shuffledIdx + 1;
    });

    const luaKeywords = ['do','if','in','or','and','end','for','nil','not','repeat','then','true','false','local','while','break','else','elseif','function','return','until'];
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let varName = '';
    do {
        varName = '';
        const varLen = Math.floor(Math.random() * 2) + 2;
        for (let i = 0; i < varLen; i++) {
            varName += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (luaKeywords.includes(varName));

    const concatStr = orderMap.map(i => `${varName}[${i}]`).join('..');
    
    return `task.spawn(function() local ${varName}={${arrayStr}}loadstring(game:HttpGet(${concatStr}))() end)`;
}

// ========== KV HELPER LANGSUNG DI SINI ==========
function kvHelper(kvNamespace) {
    if (!kvNamespace) {
        throw new Error("KV Namespace 'ndraawzontop' tidak ditemukan");
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
                await kvNamespace.put(`session:${id}`, JSON.stringify(session), { expirationTtl: 600 });
            }
        },

        async getRateLimit(ip) {
            const rateData = await kvNamespace.get(`ratelimit:${ip}`);
            return rateData ? JSON.parse(rateData) : null;
        },

        async saveRateLimit(ip, data) {
            await kvNamespace.put(`ratelimit:${ip}`, JSON.stringify(data), { expirationTtl: 600 });
        }
    };
}

// ========== HANDLER ==========
export async function onRequest(context) {
    const { request, env } = context;

    // Cek apakah KV binding ada
    if (!env['ndraawzontop']) {
        return new Response('KV Binding "ndraawzontop" not found!', { 
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }

    const kv = kvHelper(env['ndraawzontop']);
    const { 
        makeSession, 
        getSession, 
        expireSession, 
        getRateLimit, 
        saveRateLimit 
    } = kv;

    const headers = {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    };

    // Handle OPTIONS
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }

    // Hanya allow GET
    if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers });
    }

    const now = Date.now();
    const ip = request.headers.get('cf-connecting-ip') ||
               request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               "unknown";
    const agent = request.headers.get('user-agent') || "";
    const cleanIp = ip.replace('::ffff:', '').trim();

    // Cek Roblox
    const isRoblox = agent.includes("Roblox") && 
                     (request.headers.get('roblox-id') || 
                      request.headers.get('x-roblox-place-id') || 
                      agent.includes("RobloxApp"));
    const isDiscord = agent.includes("Discordbot");

    // Blokir non-Roblox
    if (!isRoblox || isDiscord) {
        const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
        return new Response(plainResp || "SECURITY : BANNED ACCESS!", {
            status: getRandomError(),
            headers
        });
    }

    const url = new URL(request.url);
    const queryString = url.search || "";
    const params = queryString ? queryString.replace('?', '').split('.') : [];

    const step = params[0] || '0';
    const id = params[1] || '';
    const key = params[2] || '';

    const currentStep = parseInt(step) || 0;
    const host = request.headers.get('host');
    const currentPath = url.pathname;

    try {
        // ========== STEP 0 ==========
        if (currentStep === 0) {
            let rateData = await getRateLimit(cleanIp);

            if (rateData) {
                const elapsed = now - rateData.firstRequestAt;
                const sisaCooldown = Math.ceil((SETTINGS.RATE_LIMIT_MS - elapsed) / 1000);

                if (elapsed < SETTINGS.RATE_LIMIT_MS) {
                    rateData.count++;
                    await saveRateLimit(cleanIp, rateData);

                    if (rateData.count > SETTINGS.RATE_LIMIT_MAX) {
                        await sendSecurityLogToLogJs(
                            `🚨 SPAM DETECTED\nIP: ${cleanIp}\nLoad ke: ${rateData.count}x\nSisa cooldown: ${sisaCooldown} detik`,
                            cleanIp,
                            "spam_detect"
                        );
                        const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
                        return new Response(plainResp || "SECURITY : BANNED ACCESS!", {
                            status: getRandomError(),
                            headers
                        });
                    }
                } else {
                    rateData = { count: 1, firstRequestAt: now };
                    await saveRateLimit(cleanIp, rateData);
                }
            } else {
                rateData = { count: 1, firstRequestAt: now };
                await saveRateLimit(cleanIp, rateData);
            }

            let sequence = [];
            while (sequence.length < SETTINGS.TOTAL_LAYERS) {
                let r = Math.floor(Math.random() * 300) + 1;
                if (!sequence.includes(r)) sequence.push(r);
            }

            const { newSessionID, nextKey } = await makeSession(cleanIp, sequence, 0);
            const nextUrl = "https://" + host + currentPath + "?" + sequence[0] + "." + newSessionID + "." + nextKey;
            
            return new Response(obfuscateUrl(nextUrl), {
                status: 200,
                headers
            });
        }

        // ========== VALIDASI SESSION ==========
        const session = await getSession(id);

        if (!session || session.ownerIP !== cleanIp) {
            const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
            return new Response(plainResp || "SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        if (currentStep !== session.stepSequence[session.currentIndex]) {
            await expireSession(id);
            return new Response("SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        // ========== REPLAY ATTACK ==========
        if (session.used === true) {
            await sendSecurityLogToLogJs(
                `REPLAY ATTACK DETECTED\nIP: ${cleanIp}\nKey: ${key}\nSession ID: ${id}`,
                cleanIp,
                "replay_attack"
            );
            return new Response("SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        // ========== INVALID KEY ==========
        if (session.nextKey !== key) {
            await sendSecurityLogToLogJs(
                `INVALID KEY DETECTED\nIP: ${cleanIp}\nKey dikirim: ${key}`,
                cleanIp,
                "invalid_key"
            );
            await expireSession(id);
            return new Response("SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        const idx = session.currentIndex;

        // ========== LAYER TERAKHIR ==========
        if (idx === SETTINGS.TOTAL_LAYERS - 1) {
            const mainScript = await fetchRaw(SETTINGS.REAL_SCRIPT_URL);
            await expireSession(id);
            return new Response(mainScript || '', {
                status: 200,
                headers
            });
        }

        // ========== LAYER SEBELUM TERAKHIR ==========
        if (idx === SETTINGS.TOTAL_LAYERS - 2) {
            const nextIdx = SETTINGS.TOTAL_LAYERS - 1;
            const nextStepNumber = session.stepSequence[nextIdx];
            const { newSessionID, nextKey } = await makeSession(session.ownerIP, session.stepSequence, nextIdx);
            await expireSession(id);

            const loggerScript = await fetchRaw(SETTINGS.LOGGER_SCRIPT_URL);
            const nextUrl = "https://" + host + currentPath + "?" + nextStepNumber + "." + newSessionID + "." + nextKey;

            const luaScript = obfuscateUrl(nextUrl) + "\n" + (loggerScript || '');
            return new Response(luaScript, {
                status: 200,
                headers
            });
        }

        // ========== LAYER BIASA ==========
        const nextIdx = idx + 1;
        const nextStepNumber = session.stepSequence[nextIdx];
        const { newSessionID, nextKey } = await makeSession(session.ownerIP, session.stepSequence, nextIdx);
        await expireSession(id);

        const nextUrl = "https://" + host + currentPath + "?" + nextStepNumber + "." + newSessionID + "." + nextKey;
        return new Response(obfuscateUrl(nextUrl), {
            status: 200,
            headers
        });

    } catch (err) {
        console.error(`[LOADER] Error: ${err.message}`);
        const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
        return new Response(plainResp || "SECURITY : BANNED ACCESS!", {
            status: getRandomError(),
            headers
        });
    }
}
