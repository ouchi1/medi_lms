import { getClientIp, sendSecurityAlert } from '../utils/telegramAlert.js';
import { loginLimiter } from '../server.js';

// រក្សាទុកចំនួនដង login ខុសជាបណ្តោះអាសន្នក្នុង memory (Map)
const failedLoginTracker = new Map();
const FAILED_WINDOW_MS = 15 * 60 * 1000; // 15 នាទី
const ALERT_THRESHOLD = 3; // ផ្ញើ Telegram ពេល login ខុសចាប់ពី 3 ដងឡើងទៅ

function recordFailedLogin(ip, email) {
    const key = `${ip}:${String(email || '').toLowerCase().trim()}`;
    const now = Date.now();
    const current = failedLoginTracker.get(key);

    if (!current || now - current.firstAttempt > FAILED_WINDOW_MS) {
        const entry = { count: 1, firstAttempt: now };
        failedLoginTracker.set(key, entry);
        return entry.count;
    }

    current.count += 1;
    failedLoginTracker.set(key, current);
    return current.count;
}

function clearFailedLogin(ip, email) {
    const key = `${ip}:${String(email || '').toLowerCase().trim()}`;
    failedLoginTracker.delete(key);
}

// ឧទាហរណ៍ Login Endpoint (កែឱ្យត្រូវនឹង logic ផ្ទៀងផ្ទាត់ user/password របស់អ្នក)
router.post('/login', loginLimiter, async (req, res) => {
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { email, password } = req.body || {};

    try {
        if (!email || !password) {
            return res.status(400).json({ message: 'សូមបញ្ចូល Email និង Password!' });
        }

        // --- កន្លែងនេះ ជំនួសដោយ query ស្វែងរក user និងផ្ទៀងផ្ទាត់ password (bcrypt.compare) របស់អ្នក ---
        const user = await findUserByEmail(email);
        const isPasswordValid = user ? await verifyPassword(password, user.password_hash) : false;

        if (!user || !isPasswordValid) {
            const failCount = recordFailedLogin(ip, email);

            if (failCount >= ALERT_THRESHOLD) {
                await sendSecurityAlert('Repeated Failed Login Detected', {
                    Email: email,
                    FailedAttempts: `${failCount} times (in 15m)`,
                    IP: ip,
                    Path: req.originalUrl,
                    UserAgent: userAgent
                });
            }

            return res.status(401).json({ message: 'Email ឬ Password មិនត្រឹមត្រូវ!' });
        }

        // Login ជោគជ័យ -> លុប counter ចាស់
        clearFailedLogin(ip, email);

        // (ស្រេចចិត្ត) ប្រសិនបើជាគណនី ADMIN / SUPERADMIN អ្នកអាចផ្ញើ notification ប្រាប់ខ្លួនឯងពេលមានការ login
        if (['ADMIN', 'SUPERADMIN'].includes(String(user.role || '').toUpperCase())) {
            await sendSecurityAlert('Admin Login Success', {
                AdminEmail: user.email,
                Role: user.role,
                IP: ip,
                UserAgent: userAgent
            });
        }

        // បន្តបង្កើត JWT token និងផ្ញើ response ដូចធម្មតា
        return res.json({
            token: 'YOUR_JWT_TOKEN',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: 'មានបញ្ហាផ្ទៃក្នុងម៉ាស៊ីនមេ!' });
    }
});