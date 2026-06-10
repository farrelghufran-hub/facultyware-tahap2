const express = require('express');
const router = express.Router();
const db = require('../lib/database');

// 1. Rute Halaman Utama (Cek Role)
router.get('/', async function (req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        if (req.session.user.role === 'penanggung_jawab') {
            const [totalSemua] = await db.query('SELECT COUNT(*) as total FROM room_loans');
            const [menunggu] = await db.query('SELECT COUNT(*) as total FROM room_loans WHERE status = "requested"');
            const [disetujui] = await db.query('SELECT COUNT(*) as total FROM room_loans WHERE status = "approved"');
            const [selesai] = await db.query('SELECT COUNT(*) as total FROM room_loans WHERE status = "completed"');
            const [ditolak] = await db.query('SELECT COUNT(*) as total FROM room_loans WHERE status = "rejected"');

            res.render('dashboard-admin', {
                title: 'Dashboard Penanggung Jawab',
                stats: {
                    total: totalSemua[0].total,
                    menunggu: menunggu[0].total,
                    disetujui: disetujui[0].total,
                    selesai: selesai[0].total,
                    ditolak: ditolak[0].total
                }
            });
        } else {
            const userId = req.session.user.id;
            const [totalPeminjaman] = await db.query('SELECT COUNT(*) as total FROM room_loans WHERE user_id = ?', [userId]);
            const [menunggu] = await db.query('SELECT COUNT(*) as total FROM room_loans WHERE user_id = ? AND status = "requested"', [userId]);
            const [disetujui] = await db.query('SELECT COUNT(*) as total FROM room_loans WHERE user_id = ? AND status = "approved"', [userId]);
            const [selesai] = await db.query('SELECT COUNT(*) as total FROM room_loans WHERE user_id = ? AND status = "completed"', [userId]);

            res.render('dashboard-user', {
                title: 'Dashboard Pengguna',
                stats: {
                    total: totalPeminjaman[0].total,
                    menunggu: menunggu[0].total,
                    disetujui: disetujui[0].total,
                    selesai: selesai[0].total
                }
            });
        }
    } catch (err) {
        next(err);
    }
});

// 2. Rute Nampilin Login
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { layout: false, error: null });
});

// 3. Rute Ketersediaan Real-time (VERSI LENGKAP)
router.get('/ketersediaan', async (req, res, next) => {
    try {
        const sql = `
            SELECT r.id, r.name, 
            (SELECT COUNT(*) FROM room_loans rl 
             WHERE rl.room_id = r.id 
             AND rl.status = 'approved' 
             AND NOW() BETWEEN rl.start_time AND rl.end_time) as is_booked,
            (SELECT u.name FROM room_loans rl 
             JOIN users u ON rl.user_id = u.id
             WHERE rl.room_id = r.id 
             AND rl.status = 'approved' 
             AND NOW() BETWEEN rl.start_time AND rl.end_time LIMIT 1) as current_borrower,
            (SELECT end_time FROM room_loans rl 
             WHERE rl.room_id = r.id 
             AND rl.status = 'approved' 
             AND NOW() BETWEEN rl.start_time AND rl.end_time LIMIT 1) as end_time
            FROM rooms r
        `;
        const [rooms] = await db.query(sql);
        res.render('ketersediaan', { title: 'Jadwal Real-time', rooms: rooms });
    } catch (err) {
        next(err);
    }
});

// 4. Rute Proses Cek Login
router.post('/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [username]);

        if (users.length === 0) return res.render('login', { layout: false, error: 'Email atau Password salah!' });

        const user = users[0];
        if (password !== user.password) return res.render('login', { layout: false, error: 'Email atau Password salah!' });

        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role || 'pengguna'
        };

        res.redirect('/');
    } catch (err) {
        console.error("Error login:", err);
        next(err);
    }
});

// 5. Rute Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

module.exports = router;