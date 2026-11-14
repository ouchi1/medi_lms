require('dotenv').config();
const db = require('./config/db');

async function testConnection() {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        console.log('Database connection successful! Test query result:', rows[0].solution);
        process.exit(0);
    } catch (err) {
        console.error('Database connection failed:', err.message);
        process.exit(1);
    }
}

testConnection();