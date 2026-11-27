const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./config/db');

const app = express();
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ==========================================
// កំណត់ការរក្សាទុករូបភាព (Multer Setup)
// ==========================================
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'school-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const existingRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingRes.rows.length > 0) {
            return res.status(400).json({ message: 'អុីមែលនេះមានក្នុងប្រព័ន្ធរួចហើយ!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const insertRes = await db.query(
            'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
            [fullName, email, hashedPassword, 'student']
        );
        const userId = insertRes.rows[0].id;

        await db.query('INSERT INTO student_profiles (user_id) VALUES ($1::text)', [String(userId)]);

        res.status(201).json({ message: 'ចុះឈ្មោះជាសិស្សជោគជ័យ!' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        const usersRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (usersRes.rows.length === 0) {
            return res.status(404).json({ message: 'រកមិនឃើញអុីមែលនេះនៅក្នុងប្រព័ន្ធទេ!' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashedPassword, email]);

        res.json({ message: 'កំណត់ពាក្យសម្ងាត់ថ្មីជោគជ័យ! សូមចូលប្រព័ន្ធជាថ្មី។' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post(['/api/login', '/api/auth/login'], async (req, res) => {
    try {
        const { email, password } = req.body;
        const usersRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);

        if (usersRes.rows.length === 0) {
            return res.status(400).json({ message: 'រកមិនឃើញអុីមែលនេះទេ!' });
        }

        const user = usersRes.rows[0];
        const userRole = user.role || 'student';

        if (userRole.toLowerCase() === 'student' && user.expire_date) {
            const today = new Date();
            const expireDate = new Date(user.expire_date);
            if (today > expireDate) {
                return res.status(403).json({
                    message: `គណនីរបស់អ្នកបានផុតកំណត់ចាប់តាំងពីថ្ងៃទី ${user.expire_date}! សូមទាក់ទង Admin ដើម្បីពន្យារពេល។`
                });
            }
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'ពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!' });
        }

        const token = jwt.sign(
            { id: user.id, name: user.full_name, role: userRole },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '1d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.full_name,
                email: user.email,
                role: userRole,
                expire_date: user.expire_date
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 2. LESSON ROUTES
// ==========================================
app.get('/api/lessons', async (req, res) => {
    try {
        const lessonsRes = await db.query(`
            SELECT l.*, s.name as subject_name
            FROM lessons l
            JOIN subjects s ON l.subject_id::text = s.id::text
            ORDER BY l.id DESC
        `);
        res.json(lessonsRes.rows);
    } catch (err) {
        console.error('Get lessons error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/lessons', async (req, res) => {
    try {
        const { title, subjectId, videoUrl, videoType, createdBy } = req.body;
        await db.query(
            'INSERT INTO lessons (title, subject_id, video_url, video_type, created_by) VALUES ($1, $2, $3, $4, $5)',
            [title, subjectId, videoUrl, videoType || 'embed', createdBy || 1]
        );
        res.status(201).json({ message: 'បន្ថែមមេរៀនជោគជ័យ!' });
    } catch (err) {
        console.error('Create lesson error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/lessons/:id', async (req, res) => {
    try {
        const lessonId = req.params.id;
        const { title, subjectId, videoUrl } = req.body;

        await db.query(
            'UPDATE lessons SET title = $1, subject_id = $2, video_url = $3 WHERE id::text = $4::text',
            [title, subjectId, videoUrl, lessonId]
        );
        res.json({ message: 'កែប្រែមេរៀនវីដេអូជោគជ័យ!' });
    } catch (err) {
        console.error('Update lesson error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/lessons/:id', async (req, res) => {
    try {
        const lessonId = req.params.id;
        await db.query('DELETE FROM lessons WHERE id::text = $1::text', [lessonId]);
        res.json({ message: 'លុបមេរៀនវីដេអូជោគជ័យ!' });
    } catch (err) {
        console.error('Delete lesson error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 3. SUBJECT ROUTES
// ==========================================

app.get('/api/qcm/subjects', async (req, res) => {
    try {
        const subjectsRes = await db.query(`
            SELECT s.id, s.name, s.parent_id, s.school_id, s.type, p.name as parent_name, COUNT(q.id)::int as question_count
            FROM subjects s
            LEFT JOIN subjects p ON s.parent_id::text = p.id::text
            LEFT JOIN quizzes q ON s.id::text = q.subject_id::text
            GROUP BY s.id, s.name, s.parent_id, s.school_id, s.type, p.name
            ORDER BY s.parent_id ASC NULLS FIRST, s.id ASC
        `);
        res.json(subjectsRes.rows);
    } catch (err) {
        console.error('Get QCM subjects error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/subjects', async (req, res) => {
    try {
        const rowsRes = await db.query('SELECT * FROM subjects ORDER BY id ASC');
        res.json(rowsRes.rows);
    } catch (err) {
        console.error('Get subjects error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/subjects', async (req, res) => {
    try {
        const { name, parentId, schoolId, type } = req.body;
        if (!name) return res.status(400).json({ message: 'សូមវាយបញ្ចូលឈ្មោះមុខវិជ្ជា!' });

        await db.query(
            'INSERT INTO subjects (name, parent_id, school_id, type) VALUES ($1, $2, $3, $4)',
            [name, parentId ? parseInt(parentId, 10) : null, schoolId ? parseInt(schoolId, 10) : null, type || 'qcm']
        );
        res.status(201).json({ message: 'បន្ថែមមុខវិជ្ជាជោគជ័យ!' });
    } catch (err) {
        console.error('Create subject error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/subjects/:id', async (req, res) => {
    try {
        const subjectId = req.params.id;
        const { name, parentId } = req.body;

        await db.query(
            'UPDATE subjects SET name = $1, parent_id = $2 WHERE id::text = $3::text',
            [name, parentId ? parseInt(parentId, 10) : null, subjectId]
        );
        res.json({ message: 'កែប្រែមុខវិជ្ជាជោគជ័យ!' });
    } catch (err) {
        console.error('Update subject error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/subjects/:id', async (req, res) => {
    try {
        const subjectId = req.params.id;
        await db.query('DELETE FROM subjects WHERE id::text = $1::text', [subjectId]);
        res.json({ message: 'លុបមុខវិជ្ជាជោគជ័យ!' });
    } catch (err) {
        console.error('Delete subject error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 4. QCM QUESTIONS ROUTES
// ==========================================

app.get('/api/qcm/questions/:subjectId', async (req, res) => {
    try {
        const subjectId = req.params.subjectId;
        const questionsRes = await db.query('SELECT * FROM quizzes WHERE subject_id::text = $1::text', [subjectId]);
        const questions = questionsRes.rows;

        for (const q of questions) {
            const optionsRes = await db.query('SELECT * FROM quiz_options WHERE quiz_id::text = $1::text', [String(q.id)]);
            q.options = optionsRes.rows;
        }
        res.json(questions);
    } catch (err) {
        console.error('Get QCM questions error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/qcm/questions', async (req, res) => {
    try {
        const { subjectId, questionText, explanation, options } = req.body;

        const qRes = await db.query(
            'INSERT INTO quizzes (subject_id, question_text, explanation, created_by) VALUES ($1, $2, $3, 1) RETURNING id',
            [subjectId, questionText, explanation || '']
        );
        const quizId = qRes.rows[0].id;

        for (const opt of options) {
            await db.query(
                'INSERT INTO quiz_options (quiz_id, option_text, is_correct) VALUES ($1, $2, $3)',
                [quizId, opt.option_text, opt.is_correct ? 1 : 0]
            );
        }

        res.status(201).json({ message: 'បន្ថែមសំណួរ QCM ជោគជ័យ!' });
    } catch (err) {
        console.error('Create QCM question error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/qcm/questions/bulk', async (req, res) => {
    try {
        const { questions } = req.body;
        if (!questions || !questions.length) {
            return res.status(400).json({ message: 'គ្មានទិន្នន័យសំណួរសម្រាប់បញ្ចូលទេ!' });
        }

        for (const q of questions) {
            const qRes = await db.query(
                'INSERT INTO quizzes (subject_id, question_text, explanation, created_by) VALUES ($1, $2, $3, 1) RETURNING id',
                [q.subjectId, q.questionText, q.explanation || '']
            );
            const quizId = qRes.rows[0].id;

            for (const opt of q.options) {
                await db.query(
                    'INSERT INTO quiz_options (quiz_id, option_text, is_correct) VALUES ($1, $2, $3)',
                    [quizId, opt.option_text, opt.is_correct ? 1 : 0]
                );
            }
        }

        res.status(201).json({ message: `បញ្ចូលសំណួរ QCM ចំនួន ${questions.length} ជោគជ័យ!` });
    } catch (err) {
        console.error('Bulk create QCM questions error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/qcm/questions/:id', async (req, res) => {
    try {
        const questionId = req.params.id;

        await db.query('DELETE FROM quiz_options WHERE quiz_id::text = $1::text', [questionId]);
        await db.query('DELETE FROM quizzes WHERE id::text = $1::text', [questionId]);

        res.json({ message: 'លុបសំណួរ QCM ជោគជ័យ!' });
    } catch (err) {
        console.error('Delete QCM question error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 5. SCHOOLS ROUTES
// ==========================================

app.get('/api/schools', async (req, res) => {
    try {
        const schoolsRes = await db.query('SELECT * FROM schools ORDER BY id ASC');
        res.json(schoolsRes.rows);
    } catch (err) {
        console.error('Get schools error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/schools', async (req, res) => {
    try {
        const { name, logo_type, logo_url, logo_value, description } = req.body;
        if (!name) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះសាលារៀន!' });

        const finalLogo = logo_url || logo_value || '🏫';

        await db.query(
            'INSERT INTO schools (name, logo_type, logo_url, description) VALUES ($1, $2, $3, $4)',
            [name, logo_type || 'emoji', finalLogo, description || '']
        );
        res.status(201).json({ message: 'បន្ថែមសាលារៀនជោគជ័យ!' });
    } catch (err) {
        console.error('Create school error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'សូមជ្រើសរើសរូបភាព!' });
    }
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ imageUrl: imageUrl });
});

app.put('/api/schools/:id', async (req, res) => {
    try {
        const schoolId = req.params.id;
        const { name, logo_type, logo_url, description } = req.body;

        if (!name) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះសាលារៀន!' });

        const existingRes = await db.query('SELECT * FROM schools WHERE id::text = $1::text', [schoolId]);
        if (existingRes.rows.length === 0) {
            return res.status(404).json({ message: 'រកមិនឃើញសាលានេះទេ!' });
        }

        const currentSchool = existingRes.rows[0];
        const finalLogoType = logo_type || currentSchool.logo_type || 'emoji';
        const finalLogoUrl = (logo_url !== undefined && logo_url !== '') ? logo_url : currentSchool.logo_url;
        const finalDesc = (description !== undefined) ? description : currentSchool.description;

        await db.query(
            'UPDATE schools SET name = $1, logo_type = $2, logo_url = $3, description = $4 WHERE id::text = $5::text',
            [name, finalLogoType, finalLogoUrl, finalDesc, schoolId]
        );

        res.json({ message: 'កែប្រែព័ត៌មានសាលារៀនជោគជ័យ!' });
    } catch (err) {
        console.error('Update school error:', err);
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/schools/:id', async (req, res) => {
    try {
        const schoolId = req.params.id;
        const delRes = await db.query('DELETE FROM schools WHERE id::text = $1::text', [schoolId]);

        if (delRes.rowCount === 0) {
            return res.status(404).json({ message: 'រកមិនឃើញសាលានេះទេ!' });
        }

        res.json({ message: 'លុបសាលារៀនបានជោគជ័យ!' });
    } catch (err) {
        console.error('Delete school error:', err);
        res.status(500).json({ message: 'មានបញ្ហាក្នុងការលុប: ' + err.message });
    }
});

// ==========================================
// 6. ADMIN CREATE STUDENT ROUTE
// ==========================================
app.post('/api/admin/students', async (req, res) => {
    try {
        const { name, email, password, expire_date } = req.body;

        if (!name || !email || !password || !expire_date) {
            return res.status(400).json({ message: 'សូមបំពេញព័ត៌មានឱ្យបានគ្រប់គ្រាន់!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertRes = await db.query(
            'INSERT INTO users (full_name, email, password_hash, expire_date, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, email, hashedPassword, expire_date, 'student']
        );

        const userId = insertRes.rows[0].id;
        await db.query('INSERT INTO student_profiles (user_id) VALUES ($1::text)', [String(userId)]);

        res.json({ message: 'បង្កើតគណនីសិស្ស និងកំណត់ថ្ងៃផុតកំណត់បានជោគជ័យ!', studentId: userId });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ message: 'អុីមែលនេះមានរួចហើយក្នុងប្រព័ន្ធ!' });
        }
        console.error('Admin create student error:', err);
        res.status(500).json({ message: 'មានបញ្ហាលើ Server: ' + err.message });
    }
});

// ==========================================
// Server Listening Port
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Medi-LMS Server running on http://localhost:${PORT}`));