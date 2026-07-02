// functions/loader.js
// Cloudflare Pages Function. Butuh binding Durable Object "SESSION_DO"
// (lihat wrangler.toml). KV (env.ndraawzontop) tetap dipakai kalau kamu
// mau cache script statis, tapi TIDAK dipakai lagi untuk session/rate-limit.

const SETTINGS = {
    TOTAL_LAYERS: 5,
    PLAIN_TEXT_URL: "https://pastefy.app/cMzbfLvJ/raw",
    REAL_SCRIPT_URL: "https://raw.githubusercontent.com/xvndr4wz/loader-api/refs/heads/main/scripts/NdraawzHubBF.lua",
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
    const data = JSON.stringify({ type: "security", securityType: type, message, ip });
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
        const escaped = p.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '\\0');
        return `'${escaped}'`;
    }).join(',');
    const orderMap = new Array(parts.length);
    indices.forEach((originalIdx, shuffledIdx) => { orderMap[originalIdx] = shuffledIdx + 1; });
    const luaKeywords = ['do','if','in','or','and','end','for','nil','not','repeat','then','true','false','local','while','break','else','elseif','function','return','until'];
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let varName = '';
    do {
        varName = '';
        const varLen = Math.floor(Math.random() * 2) + 2;
        for (let i = 0; i < varLen; i++) varName += chars[Math.floor(Math.random() * chars.length)];
    } while (luaKeywords.includes(varName));
    const concatStr = orderMap.map(i => `${varName}[${i}]`).join('..');
    return `task.spawn(function() local ${varName}={${arrayStr}}loadstring(game:HttpGet(${concatStr}))() end)`;
}

function denyResponse(headers, msg) {
    return new Response(msg || "SECURITY : BANNED ACCESS!", { status: getRandomError(), headers });
}

export async function onRequest(context) {
    const { request, env } = context;

    if (!env.SESSION_DO) {
        return new Response("Durable Object binding 'SESSION_DO' not found. Check wrangler.toml.", { status: 500 });
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

    const ip = request.headers.get('cf-connecting-ip') ||
               request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') || "unknown";
    const agent = request.headers.get('user-agent') || "";
    const cleanIp = ip.replace('::ffff:', '').trim();

    const isRoblox = agent.includes("Roblox") &&
                     (request.headers.get('roblox-id') ||
                      request.headers.get('x-roblox-place-id') ||
                      agent.includes("RobloxApp"));
    const isDiscord = agent.includes("Discordbot");

    if (!isRoblox || isDiscord) {
        const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
        return denyResponse(headers, plainResp);
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

    // --- Ambil satu instance Durable Object global untuk semua session ---
    // (pakai idFromName dengan nama tetap supaya semua request hit object yang sama
    //  dan konsisten kuat / tidak race)
    const doId = env.SESSION_DO.idFromName("global-session-manager");
    const stub = env.SESSION_DO.get(doId);

    async function callDO(action, body) {
        const res = await stub.fetch(`https://do/${action}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        return res.json();
    }

    try {
        // ========== STEP 0: RATE LIMIT + INIT SESSION ==========
        if (currentStep === 0) {
            const rateResult = await callDO('check-rate-limit', { ip: cleanIp });

            if (rateResult.blocked) {
                await sendSecurityLogToLogJs(
                    `🚨 **SPAM DETECTED**\n📡 **IP:** \`${cleanIp}\`\n🔢 **Load ke:** ${rateResult.count}x\n⏳ **Sisa cooldown:** ${rateResult.sisaCooldown} detik lagi`,
                    cleanIp, "spam_detect"
                );
                const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
                return denyResponse(headers, plainResp);
            }

            let sequence = [];
            while (sequence.length < SETTINGS.TOTAL_LAYERS) {
                let r = Math.floor(Math.random() * 300) + 1;
                if (!sequence.includes(r)) sequence.push(r);
            }

            const { sessionID, nextKey } = await callDO('create-session', {
                ip: cleanIp, stepSequence: sequence, currentIndex: 0
            });

            const nextUrl = "https://" + host + currentPath + "?" + sequence[0] + "." + sessionID + "." + nextKey;
            return new Response(obfuscateUrl(nextUrl), { status: 200, headers });
        }

        // ========== VALIDASI HANDSHAKE (atomik lewat DO) ==========
        const result = await callDO('validate-session', { id, ip: cleanIp, step: currentStep, key });

        if (!result.valid) {
            if (result.reason === 'replay_attack') {
                await sendSecurityLogToLogJs(
                    `🚫 **REPLAY ATTACK DETECTED**\n📡 **IP:** \`${cleanIp}\`\n🔑 **Key:** \`${key}\`\n🆔 **Session ID:** \`${id}\``,
                    cleanIp, "replay_attack"
                );
            } else if (result.reason === 'invalid_key') {
                await sendSecurityLogToLogJs(
                    `🔑 **INVALID KEY DETECTED**\n📡 **IP:** \`${cleanIp}\`\n❌ **Key dikirim:** \`${key}\``,
                    cleanIp, "invalid_key"
                );
            }
            const plainResp = result.reason === 'not_found_or_ip_mismatch' ? await fetchRaw(SETTINGS.PLAIN_TEXT_URL) : null;
            return denyResponse(headers, plainResp);
        }

        const session = result.session;
        const idx = session.currentIndex;

        // ========== LAYER TERAKHIR: MAIN SCRIPT ==========
        if (idx === SETTINGS.TOTAL_LAYERS - 1) {
            const mainScript = await fetchRaw(SETTINGS.REAL_SCRIPT_URL);
            await callDO('mark-used', { id });
            return new Response(mainScript || '', { status: 200, headers });
        }

        // ========== LAYER SEBELUM TERAKHIR: LOGGER + LOADSTRING ==========
        if (idx === SETTINGS.TOTAL_LAYERS - 2) {
            const nextIdx = SETTINGS.TOTAL_LAYERS - 1;
            const nextStepNumber = session.stepSequence[nextIdx];

            await callDO('mark-used', { id });
            const { sessionID: newSessionID, nextKey } = await callDO('create-session', {
                ip: cleanIp, stepSequence: session.stepSequence, currentIndex: nextIdx
            });

            const loggerScript = await fetchRaw(SETTINGS.LOGGER_SCRIPT_URL);
            const nextUrl = "https://" + host + currentPath + "?" + nextStepNumber + "." + newSessionID + "." + nextKey;
            const luaScript = obfuscateUrl(nextUrl) + "\n" + (loggerScript || '');
            return new Response(luaScript, { status: 200, headers });
        }

        // ========== LAYER BIASA: REDIRECT ==========
        const nextIdx = idx + 1;
        const nextStepNumber = session.stepSequence[nextIdx];

        await callDO('mark-used', { id });
        const { sessionID: newSessionID, nextKey } = await callDO('create-session', {
            ip: cleanIp, stepSequence: session.stepSequence, currentIndex: nextIdx
        });

        const nextUrl = "https://" + host + currentPath + "?" + nextStepNumber + "." + newSessionID + "." + nextKey;
        return new Response(obfuscateUrl(nextUrl), { status: 200, headers });

    } catch (err) {
        const plainResp = await fetchRaw(SETTINGS.PLAIN_TEXT_URL);
        return denyResponse(headers, plainResp);
    }
}
