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
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'អុីមែលនេះមានក្នុងប្រព័ន្ធរួចហើយ!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [fullName, email, hashedPassword, 'student']
        );
        const userId = result.insertId;

        await db.query('INSERT INTO student_profiles (user_id) VALUES (?)', [userId]);

        res.status(201).json({ message: 'ចុះឈ្មោះជាសិស្សជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        
        const [users] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'រកមិនឃើញអុីមែលនេះនៅក្នុងប្រព័ន្ធទេ!' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash = ? WHERE email = ?', [hashedPassword, email]);

        res.json({ message: 'កំណត់ពាក្យសម្ងាត់ថ្មីជោគជ័យ! សូមចូលប្រព័ន្ធជាថ្មី។' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(400).json({ message: 'រកមិនឃើញអុីមែលនេះទេ!' });
        }

        const user = users[0];
        const userRole = user.role || 'student';

        // ពិនិត្យថ្ងៃផុតកំណត់ (Expire Date) សម្រាប់សិស្ស
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
            user: { id: user.id, name: user.full_name, email: user.email, role: userRole, expire_date: user.expire_date }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 2. LESSON ROUTES
// ==========================================
app.get('/api/lessons', async (req, res) => {
    try {
        const [lessons] = await db.query(`
            SELECT l.*, s.name as subject_name 
            FROM lessons l 
            JOIN subjects s ON l.subject_id = s.id 
            ORDER BY l.id DESC
        `);
        res.json(lessons);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/lessons', async (req, res) => {
    try {
        const { title, subjectId, videoUrl, videoType, createdBy } = req.body;
        await db.query(
            'INSERT INTO lessons (title, subject_id, video_url, video_type, created_by) VALUES (?, ?, ?, ?, ?)',
            [title, subjectId, videoUrl, videoType || 'embed', createdBy || 1]
        );
        res.status(201).json({ message: 'បន្ថែមមេរៀនជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/lessons/:id', async (req, res) => {
    try {
        const lessonId = req.params.id;
        const { title, subjectId, videoUrl } = req.body;
        
        await db.query(
            'UPDATE lessons SET title = ?, subject_id = ?, video_url = ? WHERE id = ?',
            [title, subjectId, videoUrl, lessonId]
        );
        res.json({ message: 'កែប្រែមេរៀនវីដេអូជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/lessons/:id', async (req, res) => {
    try {
        const lessonId = req.params.id;
        await db.query('DELETE FROM lessons WHERE id = ?', [lessonId]);
        res.json({ message: 'លុបមេរៀនវីដេអូជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 3. SUBJECT ROUTES
// ==========================================

app.get('/api/qcm/subjects', async (req, res) => {
    try {
        const [subjects] = await db.query(`
            SELECT s.id, s.name, s.parent_id, s.school_id, s.type, p.name as parent_name, COUNT(q.id) as question_count 
            FROM subjects s 
            LEFT JOIN subjects p ON s.parent_id = p.id
            LEFT JOIN quizzes q ON s.id = q.subject_id 
            GROUP BY s.id, s.name, s.parent_id, s.school_id, s.type, p.name
            ORDER BY s.parent_id ASC, s.id ASC
        `);
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/subjects', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM subjects');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/subjects', async (req, res) => {
    try {
        const { name, parentId, schoolId, type } = req.body;
        if (!name) return res.status(400).json({ message: 'សូមវាយបញ្ចូលឈ្មោះមុខវិជ្ជា!' });

        await db.query(
            'INSERT INTO subjects (name, parent_id, school_id, type) VALUES (?, ?, ?, ?)',
            [name, parentId ? parseInt(parentId) : null, schoolId ? parseInt(schoolId) : null, type || 'qcm']
        );
        res.status(201).json({ message: 'បន្ថែមមុខវិជ្ជាជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/subjects/:id', async (req, res) => {
    try {
        const subjectId = req.params.id;
        const { name, parentId } = req.body;
        
        await db.query(
            'UPDATE subjects SET name = ?, parent_id = ? WHERE id = ?', 
            [name, parentId ? parseInt(parentId) : null, subjectId]
        );
        res.json({ message: 'កែប្រែមុខវិជ្ជាជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/subjects/:id', async (req, res) => {
    try {
        const subjectId = req.params.id;
        await db.query('DELETE FROM subjects WHERE id = ?', [subjectId]);
        res.json({ message: 'លុបមុខវិជ្ជាជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 4. QCM QUESTIONS ROUTES
// ==========================================

app.get('/api/qcm/questions/:subjectId', async (req, res) => {
    try {
        const subjectId = req.params.subjectId;
        const [questions] = await db.query('SELECT * FROM quizzes WHERE subject_id = ?', [subjectId]);
        
        for (let q of questions) {
            const [options] = await db.query('SELECT * FROM quiz_options WHERE quiz_id = ?', [q.id]);
            q.options = options;
        }
        res.json(questions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/qcm/questions', async (req, res) => {
    try {
        const { subjectId, questionText, explanation, options } = req.body;
        
        const [qResult] = await db.query(
            'INSERT INTO quizzes (subject_id, question_text, explanation, created_by) VALUES (?, ?, ?, 1)',
            [subjectId, questionText, explanation || '']
        );
        const quizId = qResult.insertId;

        for (let opt of options) {
            await db.query(
                'INSERT INTO quiz_options (quiz_id, option_text, is_correct) VALUES (?, ?, ?)',
                [quizId, opt.option_text, opt.is_correct ? 1 : 0]
            );
        }

        res.status(201).json({ message: 'បន្ថែមសំណួរ QCM ជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/qcm/questions/bulk', async (req, res) => {
    try {
        const { questions } = req.body;
        if (!questions || !questions.length) {
            return res.status(400).json({ message: 'គ្មានទិន្នន័យសំណួរសម្រាប់បញ្ចូលទេ!' });
        }

        for (let q of questions) {
            const [qResult] = await db.query(
                'INSERT INTO quizzes (subject_id, question_text, explanation, created_by) VALUES (?, ?, ?, 1)',
                [q.subjectId, q.questionText, q.explanation || '']
            );
            const quizId = qResult.insertId;

            for (let opt of q.options) {
                await db.query(
                    'INSERT INTO quiz_options (quiz_id, option_text, is_correct) VALUES (?, ?, ?)',
                    [quizId, opt.option_text, opt.is_correct ? 1 : 0]
                );
            }
        }

        res.status(201).json({ message: `បញ្ចូលសំណួរ QCM ចំនួន ${questions.length} ជោគជ័យ!` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/qcm/questions/:id', async (req, res) => {
    try {
        const questionId = req.params.id;
        
        await db.query('DELETE FROM quiz_options WHERE quiz_id = ?', [questionId]);
        await db.query('DELETE FROM quizzes WHERE id = ?', [questionId]);

        res.json({ message: 'លុបសំណួរ QCM ជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==========================================
// 5. SCHOOLS ROUTES
// ==========================================

app.get('/api/schools', async (req, res) => {
    try {
        const [schools] = await db.query('SELECT * FROM schools ORDER BY id ASC');
        res.json(schools);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/schools', async (req, res) => {
    try {
        const { name, logo_type, logo_value, description } = req.body;
        if (!name) return res.status(400).json({ message: 'សូមបញ្ចូលឈ្មោះសាលារៀន!' });

        await db.query(
            'INSERT INTO schools (name, logo_type, logo_url, description) VALUES (?, ?, ?, ?)',
            [name, logo_type || 'emoji', logo_value || '🏫', description || '']
        );
        res.status(201).json({ message: 'បន្ថែមសាលារៀនជោគជ័យ!' });
    } catch (err) {
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

        const [existing] = await db.query('SELECT * FROM schools WHERE id = ?', [schoolId]);
        if (existing.length === 0) {
            return res.status(404).json({ message: 'រកមិនឃើញសាលានេះទេ!' });
        }

        const currentSchool = existing[0];
        const finalLogoType = logo_type || currentSchool.logo_type || 'emoji';
        const finalLogoUrl = (logo_url !== undefined && logo_url !== '') ? logo_url : currentSchool.logo_url;
        const finalDesc = (description !== undefined) ? description : currentSchool.description;

        await db.query(
            'UPDATE schools SET name = ?, logo_type = ?, logo_url = ?, description = ? WHERE id = ?',
            [name, finalLogoType, finalLogoUrl, finalDesc, schoolId]
        );
        
        res.json({ message: 'កែប្រែព័ត៌មានសាលារៀនជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/schools/:id', async (req, res) => {
    try {
        const schoolId = req.params.id;
        const [result] = await db.query('DELETE FROM schools WHERE id = ?', [schoolId]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'រកមិនឃើញសាលារៀននេះទេ!' });
        }
        
        res.json({ message: 'លុបសាលារៀនបានជោគជ័យ!' });
    } catch (err) {
        res.status(500).json({ message: 'មានបញ្ហាក្នុងការលុប: ' + err.message });
    }
});

// ==========================================
// 6. ADMIN CREATE STUDENT ROUTE (Assigns role = 'student' directly)
// ==========================================
app.post('/api/admin/students', async (req, res) => {
    try {
        const { name, email, password, expire_date } = req.body;
        
        if (!name || !email || !password || !expire_date) {
            return res.status(400).json({ message: 'សូមបំពេញព័ត៌មានឱ្យបានគ្រប់គ្រាន់!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // បញ្ចូលទិន្នន័យដោយกำหนด role ជា 'student' ផ្ទាល់ក្នុងតារាង users
        const [result] = await db.query(
            'INSERT INTO users (full_name, email, password_hash, expire_date, role) VALUES (?, ?, ?, ?, ?)',
            [name, email, hashedPassword, expire_date, 'student']
        );

        const userId = result.insertId;
        await db.query('INSERT INTO student_profiles (user_id) VALUES (?)', [userId]);

        res.json({ message: 'បង្កើតគណនីសិស្ស និងកំណត់ថ្ងៃផុតកំណត់បានជោគជ័យ!', studentId: userId });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'អុីមែលនេះមានរួចហើយក្នុងប្រព័ន្ធ!' });
        }
        res.status(500).json({ message: 'មានបញ្ហាលើ Server: ' + err.message });
    }
});

// ==========================================
// Server Listening Port
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Medi-LMS Server running on http://localhost:${PORT}`));