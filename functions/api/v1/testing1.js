const SETTINGS = {
    TOTAL_LAYERS: 5,
    RATE_LIMIT_MS: 10000,
    RATE_LIMIT_MAX: 3,
    SESSION_TTL: 600, // TTL dalam detik (10 menit) untuk KV
    PLAIN_TEXT_URL: "https://pastefy.app/cMzbfLvJ/raw",
    REAL_SCRIPT_URL: "https://raw.githubusercontent.com/xvndr4wz/loader-api/refs/heads/main/scripts/NdraawzHubBF.lua",
    LOGGER_SCRIPT_URL: "https://raw.githubusercontent.com/xvndr4wz/loader-api/refs/heads/main/api/logger/logscript.lua"
};

// --- Helper Functions ---

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
    
    // Menggunakan task.spawn untuk eksekusi loadstring agar tidak menghambat script utama
    return `task.spawn(function() local ${varName}={${arrayStr}}loadstring(game:HttpGet(${concatStr}))() end)`;
}

// --- Main Request Handler ---

export async function onRequest(context) {
    const { request, env } = context;
    const kv = env.ndraawzontop;

    if (!kv) {
        return new Response("KV Binding 'ndraawzontop' not found. Check wrangler.toml.", { status: 500 });
    }

    const headers = {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers });
    }

    const now = Date.now();
    const ip = request.headers.get('cf-connecting-ip') ||
               request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               "unknown";
    const agent = request.headers.get('user-agent') || "";
    const cleanIp = ip.replace('::ffff:', '').trim();

    const isRoblox = agent.includes("Roblox") && 
                     (request.headers.get('roblox-id') || 
                      request.headers.get('x-roblox-place-id') || 
                      agent.includes("RobloxApp"));
    const isDiscord = agent.includes("Discordbot");

    // Security check for Non-Roblox agents
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
        // ========== STEP 0: RATE LIMIT + INIT SESSION ==========
        if (currentStep === 0) {
            let rateData = await kv.get(`ratelimit:${cleanIp}`, { type: "json" });

            if (rateData) {
                const elapsed = now - rateData.firstRequestAt;
                const sisaCooldown = Math.ceil((SETTINGS.RATE_LIMIT_MS - elapsed) / 1000);

                if (elapsed < SETTINGS.RATE_LIMIT_MS) {
                    rateData.count++;
                    await kv.put(`ratelimit:${cleanIp}`, JSON.stringify(rateData), { expirationTtl: 600 });

                    if (rateData.count > SETTINGS.RATE_LIMIT_MAX) {
                        await sendSecurityLogToLogJs(
                            `🚨 **SPAM DETECTED**\n` +
                            `📡 **IP:** \`${cleanIp}\`\n` +
                            `🔢 **Load ke:** ${rateData.count}x (maks ${SETTINGS.RATE_LIMIT_MAX}x per ${SETTINGS.RATE_LIMIT_MS / 1000} detik)\n` +
                            `⏳ **Sisa cooldown:** ${sisaCooldown} detik lagi`,
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
                    await kv.put(`ratelimit:${cleanIp}`, JSON.stringify(rateData), { expirationTtl: 600 });
                }
            } else {
                rateData = { count: 1, firstRequestAt: now };
                await kv.put(`ratelimit:${cleanIp}`, JSON.stringify(rateData), { expirationTtl: 600 });
            }

            let sequence = [];
            while (sequence.length < SETTINGS.TOTAL_LAYERS) {
                let r = Math.floor(Math.random() * 300) + 1;
                if (!sequence.includes(r)) sequence.push(r);
            }

            // Generate Session
            const ipPart = cleanIp.split('.').pop() || "0";
            const seed = parseInt(ipPart) + Math.floor(Math.random() * 10000);
            const newSessionID = seed.toString(36).substring(0, 4).padEnd(4, 'x');
            const nextKey = Math.random().toString(36).substring(2, 8);

            const sessionData = {
                ownerIP: cleanIp,
                stepSequence: sequence,
                currentIndex: 0,
                nextKey: nextKey,
                lastTime: now,
                used: false
            };

            await kv.put(`session:${newSessionID}`, JSON.stringify(sessionData), { expirationTtl: 600 });
            
            const nextUrl = "https://" + host + currentPath + "?" + sequence[0] + "." + newSessionID + "." + nextKey;
            return new Response(obfuscateUrl(nextUrl), {
                status: 200,
                headers
            });
        }

        // ========== VALIDASI HANDSHAKE ==========
        const session = await kv.get(`session:${id}`, { type: "json" });

        if (!session || session.ownerIP !== cleanIp) {
            const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
            return new Response(plainResp || "SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        if (currentStep !== session.stepSequence[session.currentIndex]) {
            session.used = true;
            await kv.put(`session:${id}`, JSON.stringify(session), { expirationTtl: 600 });
            return new Response("SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        // ========== CEK REPLAY ATTACK ==========
        if (session.used === true) {
            await sendSecurityLogToLogJs(
                `🚫 **REPLAY ATTACK DETECTED**\n` +
                `📡 **IP:** \`${cleanIp}\`\n` +
                `🔑 **Key:** \`${key}\`\n` +
                `🆔 **Session ID:** \`${id}\`\n` +
                `⚠️ Mencoba mengakses link yang sudah mati`,
                cleanIp,
                "replay_attack"
            );
            return new Response("SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        // ========== CEK INVALID KEY ==========
        if (session.nextKey !== key) {
            await sendSecurityLogToLogJs(
                `🔑 **INVALID KEY DETECTED**\n` +
                `📡 **IP:** \`${cleanIp}\`\n` +
                `❌ **Key dikirim:** \`${key}\`\n` +
                `⚠️ Key tidak cocok`,
                cleanIp,
                "invalid_key"
            );
            session.used = true;
            await kv.put(`session:${id}`, JSON.stringify(session), { expirationTtl: 600 });
            return new Response("SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        const idx = session.currentIndex;

        // ========== LAYER TERAKHIR: MAIN SCRIPT ==========
        if (idx === SETTINGS.TOTAL_LAYERS - 1) {
            const mainScript = await fetchRaw(SETTINGS.REAL_SCRIPT_URL);
            session.used = true;
            await kv.put(`session:${id}`, JSON.stringify(session), { expirationTtl: 600 });
            return new Response(mainScript || '', {
                status: 200,
                headers
            });
        }

        // ========== LAYER SEBELUM TERAKHIR: LOGGER + LOADSTRING ==========
        if (idx === SETTINGS.TOTAL_LAYERS - 2) {
            const nextIdx = SETTINGS.TOTAL_LAYERS - 1;
            const nextStepNumber = session.stepSequence[nextIdx];
            
            // Create New Session for Next Step
            const nextKey = Math.random().toString(36).substring(2, 8);
            const newSessionData = {
                ...session,
                currentIndex: nextIdx,
                nextKey: nextKey,
                lastTime: now
            };
            
            // Mark current session as used
            session.used = true;
            await kv.put(`session:${id}`, JSON.stringify(session), { expirationTtl: 600 });
            
            // Save new session (using same ID or new one, for simplicity using same ID is fine if we manage 'used' state carefully, but let's use a new one to be safe like Node.js)
            const seed = Math.floor(Math.random() * 10000);
            const newSessionID = seed.toString(36).substring(0, 4).padEnd(4, 'x');
            await kv.put(`session:${newSessionID}`, JSON.stringify(newSessionData), { expirationTtl: 600 });

            const loggerScript = await fetchRaw(SETTINGS.LOGGER_SCRIPT_URL);
            const nextUrl = "https://" + host + currentPath + "?" + nextStepNumber + "." + newSessionID + "." + nextKey;

            const luaScript = obfuscateUrl(nextUrl) + "\n" + (loggerScript || '');
            return new Response(luaScript, {
                status: 200,
                headers
            });
        }

        // ========== LAYER BIASA: REDIRECT ==========
        const nextIdx = idx + 1;
        const nextStepNumber = session.stepSequence[nextIdx];
        
        // Create New Session for Next Step
        const nextKey = Math.random().toString(36).substring(2, 8);
        const newSessionData = {
            ...session,
            currentIndex: nextIdx,
            nextKey: nextKey,
            lastTime: now
        };

        // Mark current session as used
        session.used = true;
        await kv.put(`session:${id}`, JSON.stringify(session), { expirationTtl: 600 });

        const seed = Math.floor(Math.random() * 10000);
        const newSessionID = seed.toString(36).substring(0, 4).padEnd(4, 'x');
        await kv.put(`session:${newSessionID}`, JSON.stringify(newSessionData), { expirationTtl: 600 });

        const nextUrl = "https://" + host + currentPath + "?" + nextStepNumber + "." + newSessionID + "." + nextKey;
        return new Response(obfuscateUrl(nextUrl), {
            status: 200,
            headers
        });

    } catch (err) {
        const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
        return new Response(plainResp || "SECURITY : BANNED ACCESS!", {
            status: getRandomError(),
            headers
        });
    }
          }
          
