const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>');
}

export function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'Unknown IP';
}

export async function sendSecurityAlert(title, details = {}) {
    if (!BOT_TOKEN || !CHAT_ID) {
        return;
    }

    const detailLines = Object.entries(details)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `• <b>${escapeHtml(key)}:</b> <code>${escapeHtml(value)}</code>`)
        .join('\n');

    const text = [
        `🚨 <b>${escapeHtml(title)}</b>`,
        detailLines,
        `🕒 <b>Time:</b> <code>${escapeHtml(new Date().toISOString())}</code>`
    ]
        .filter(Boolean)
        .join('\n');

    try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text,
                parse_mode: 'HTML'
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Telegram API error:', errText);
        }
    } catch (err) {
        console.error('Failed to send Telegram alert:', err.message);
    }
}