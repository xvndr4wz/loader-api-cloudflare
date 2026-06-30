// functions/api/[[path]].js - Cloudflare Pages Functions
// 100% sama dengan versi Node.js asli

const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1452653310443257970/SkdnTLTdZUq5hJUf7POXHYcILxlYIVTS7TVc-NYKruBSlotTJtA2BzHY9bEACJxrlnd5";

const BOT_USERNAME = "Ndraawz Hub Logger";
const BOT_AVATAR_URL = "https://cdn.discordapp.com/attachments/1464912658108125278/1472698650848395451/icon.png";
const FOOTER_ICON_URL = "https://cdn.discordapp.com/attachments/1464912658108125278/1472698650848395451/icon.png";
const EMBED_COLOR = 0x00e5ff;

// Sama persis dengan fungsi getGeoInfo asli
async function getGeoInfo(ip) {
    try {
        const url = `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,as,org,query`;
        
        // Cloudflare Workers/Pages menggunakan fetch API
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'success') {
            return {
                country: data.country || "N/A",
                region: data.regionName || "N/A",
                city: data.city || "N/A",
                isp: data.isp || "N/A",
                as: data.as || "N/A",
                org: data.org || "N/A"
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Sama persis dengan fungsi sendToDiscord asli (tapi pake fetch)
async function sendToDiscord(embed) {
    const payload = JSON.stringify({
        username: BOT_USERNAME,
        avatar_url: BOT_AVATAR_URL,
        embeds: [embed]
    });

    try {
        const response = await fetch(DISCORD_WEBHOOK, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length.toString()
            },
            body: payload
        });
        return response.status === 204 || response.status === 200;
    } catch (e) {
        return false;
    }
}

// Fungsi untuk membaca raw body (mirip getRawBody)
async function getRawBody(request) {
    try {
        const data = await request.json();
        return data;
    } catch (e) {
        return null;
    }
}

// Export handler untuk Cloudflare Pages
export async function onRequest(context) {
    const { request } = context;
    
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle OPTIONS
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
    }

    // Only allow POST
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            }
        });
    }

    // Get client IP (sama seperti versi Node.js)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('cf-connecting-ip') ||
                    request.headers.get('x-real-ip') || 
                    "unknown";
    const cleanIp = clientIp.replace('::ffff:', '').trim();

    try {
        // Baca body (sama seperti getRawBody)
        const data = await getRawBody(request);
        if (!data) {
            return new Response(JSON.stringify({ error: 'Empty body' }), {
                status: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            });
        }

        // Handle security type
        if (data.type === "security") {
            const embed = {
                title: "❗️ Ndraawz Security System ❗️",
                description: data.message || "No message",
                color: EMBED_COLOR,
                footer: { text: "Ndraawz Logger System", icon_url: FOOTER_ICON_URL },
                timestamp: new Date().toISOString()
            };
            await sendToDiscord(embed);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            });
        }

        // Handle player type
        if (data.type === "player" && Array.isArray(data.fields)) {
            const geoData = await getGeoInfo(cleanIp);

            const allFields = [
                ...data.fields,
                { name: "━━━━━━━━━━━━━━ 🌐 IP INFORMATION ━━━━━━━━━━━━━━", value: "ㅤ", inline: false },
                { name: "📡 IP Address", value: cleanIp || "N/A", inline: false }
            ];

            if (geoData) {
                allFields.push(
                    { name: "🚩 Country", value: geoData.country, inline: false },
                    { name: "📍 Region", value: geoData.region, inline: false },
                    { name: "🏙️ City", value: geoData.city, inline: false },
                    { name: "🏢 ISP", value: geoData.isp, inline: false },
                    { name: "📡 AS / Org", value: `${geoData.as} / ${geoData.org}`, inline: false }
                );
            } else {
                allFields.push({ name: "⚠️ Info", value: "Geolokasi gagal diambil", inline: false });
            }

            const embed = {
                title: "🚀 Ndraawz Logger System",
                color: EMBED_COLOR,
                fields: allFields,
                footer: { text: "Ndraawz Logger System", icon_url: FOOTER_ICON_URL },
                timestamp: new Date().toISOString()
            };

            await sendToDiscord(embed);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            });
        }

        return new Response(JSON.stringify({ error: 'Invalid request format' }), {
            status: 400,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            }
        });

    } catch (err) {
        console.error(`[LOG] Error: ${err.message}`);
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            }
        });
    }
          }
