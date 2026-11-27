import jwt from 'jsonwebtoken';
import { getClientIp, sendSecurityAlert } from '../utils/telegramAlert.js';

const ADMIN_ROLES = ['ADMIN', 'TEACHER', 'SUPERADMIN'];

export async function requireAdmin(req, res, next) {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    // 1. គ្មាន Token -> 401 Unauthorized
    if (!token) {
        await sendSecurityAlert('Unauthorized Admin Access - Missing Token (401)', {
            IP: ip,
            Method: req.method,
            Path: req.originalUrl,
            UserAgent: userAgent
        });
        return res.status(401).json({ message: 'សូមចូលប្រព័ន្ធជាមុនសិន!' });
    }

    // 2. ផ្ទៀងផ្ទាត់ JWT Token
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        await sendSecurityAlert('Invalid or Expired Token on Admin Route (401)', {
            IP: ip,
            Method: req.method,
            Path: req.originalUrl,
            Reason: err.message,
            UserAgent: userAgent
        });
        return res.status(401).json({ message: 'Token មិនត្រឹមត្រូវ ឬផុតកំណត់!' });
    }

    req.user = decoded;

    // 3. ពិនិត្យ Role -> មិនមែន Admin/Teacher/Superadmin -> 403 Forbidden
    const role = String(req.user?.role || '').toUpperCase().trim();
    if (!ADMIN_ROLES.includes(role)) {
        await sendSecurityAlert('Forbidden Admin Access Attempt (403)', {
            UserId: req.user?.id || 'N/A',
            Email: req.user?.email || 'N/A',
            Role: req.user?.role || 'NONE',
            IP: ip,
            Method: req.method,
            Path: req.originalUrl,
            UserAgent: userAgent
        });
        return res.status(403).json({ message: 'អ្នកមិនមានសិទ្ធិចូលប្រើមុខងារនេះទេ!' });
    }

    next();
}