const express = require('express');
const router = express.Router();
const db = require('../lib/database');

// --- SATPAM MIDDLEWARE ---
router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
});

// 1. Tampilkan Daftar Peminjaman
router.get('/', async (req, res, next) => {
    try {
        let sql = '';
        let params = [];

        if (req.session.user.role === 'penanggung_jawab') {
            sql = `SELECT room_loans.*, rooms.name AS room_name, 
                   users.name AS borrower_name 
                   FROM room_loans 
                   JOIN rooms ON room_loans.room_id = rooms.id 
                   LEFT JOIN users ON users.id = room_loans.user_id
                   ORDER BY room_loans.created_at DESC`;
        } else {
            sql = `SELECT room_loans.*, rooms.name AS room_name 
                   FROM room_loans 
                   JOIN rooms ON room_loans.room_id = rooms.id 
                   WHERE room_loans.user_id = ? 
                   ORDER BY room_loans.created_at DESC`;
            params = [req.session.user.id];
        }

        const [bookings] = await db.query(sql, params);
        res.render('booking-list', { title: 'Daftar Peminjaman Ruangan', bookings: bookings });
    } catch (err) {
        next(err);
    }
});

// 2. Tampilkan Form Tambah
router.get('/add', async (req, res, next) => {
    try {
        const [rooms] = await db.query('SELECT * FROM rooms');
        res.render('add-booking', { title: 'Buat Pengajuan Baru', rooms: rooms });
    } catch (err) {
        next(err);
    }
});

// 3. Proses Simpan Data Form (AJAX READY)
router.post('/add', async (req, res, next) => {
    try {
        const { room_id, tanggal, jam_mulai, jam_selesai, purpose } = req.body;
        const start_time = `${tanggal} ${jam_mulai}:00`;
        const end_time = `${tanggal} ${jam_selesai}:00`;
        const user_id = req.session.user.id;

        // Validasi Bentrok Jadwal
        const [bentrok] = await db.query(`
            SELECT * FROM room_loans 
            WHERE room_id = ? AND status = 'approved'
            AND (
                (? BETWEEN start_time AND end_time) OR 
                (? BETWEEN start_time AND end_time) OR
                (start_time BETWEEN ? AND ?)
            )
        `, [room_id, start_time, end_time, start_time, end_time]);

        if (bentrok.length > 0) {
            return res.status(400).json({ error: "Gagal: Ruangan sudah dipesan pada jam tersebut." });
        }

        const sql = `INSERT INTO room_loans (room_id, user_id, start_time, end_time, purpose, status, approved_by_id, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, 'requested', 1, NOW(), NOW())`;

        await db.execute(sql, [room_id, user_id, start_time, end_time, purpose]);

        // Kirim response JSON untuk AJAX
        return res.status(200).json({ message: "Peminjaman berhasil diajukan!" });
    } catch (err) {
        console.error("Error nambah data:", err);
        return res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
});

// 4. Proses ACC / Tolak
router.post('/:id/action', async (req, res, next) => {
    try {
        if (req.session.user.role !== 'penanggung_jawab') return res.status(403).send("Akses Ditolak.");
        await db.execute(`UPDATE room_loans SET status = ?, updated_at = NOW() WHERE id = ?`,
            [req.body.action_status, req.params.id]);
        res.redirect('/bookings');
    } catch (err) {
        next(err);
    }
});

const PDFDocument = require('pdfkit');

router.get('/:id/download', async (req, res, next) => {
    try {
        const [booking] = await db.query(`
            SELECT rl.*, r.name AS room_name, u.name AS borrower_name 
            FROM room_loans rl 
            JOIN rooms r ON rl.room_id = r.id 
            JOIN users u ON rl.user_id = u.id
            WHERE rl.id = ?`, [req.params.id]);

        if (booking.length === 0) return res.status(404).send("Data tidak ditemukan");

        const data = booking[0];
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Bukti_Peminjaman_${data.id}.pdf`);
        doc.pipe(res);

        // 1. Header/Kop Surat
        doc.fontSize(18).font('Helvetica-Bold').text('UNIVERSITAS ANDALAS', { align: 'center' });
        doc.fontSize(12).font('Helvetica').text('Sistem Peminjaman Ruangan - Facultyware', { align: 'center' });
        doc.moveDown();
        doc.moveTo(50, 110).lineTo(550, 110).stroke(); // Garis pembatas

        // 2. Judul Dokumen
        doc.moveDown(2);
        doc.fontSize(16).font('Helvetica-Bold').text('BUKTI PENGAJUAN PEMINJAMAN', { align: 'center' });
        doc.moveDown();

        // 3. Detail Data dengan format tabel sederhana
        const startY = 180;
        const drawRow = (label, value, y) => {
            doc.fontSize(12).font('Helvetica-Bold').text(label, 50, y);
            doc.font('Helvetica').text(`: ${value}`, 200, y);
        };

        drawRow('ID Peminjaman', data.id, startY);
        drawRow('Nama Peminjam', data.borrower_name, startY + 25);
        drawRow('Ruangan', data.room_name, startY + 50);
        drawRow('Tanggal', new Date(data.start_time).toLocaleDateString('id-ID'), startY + 75);
        drawRow('Jam Mulai', new Date(data.start_time).toLocaleTimeString('id-ID'), startY + 100);
        drawRow('Jam Selesai', new Date(data.end_time).toLocaleTimeString('id-ID'), startY + 125);
        drawRow('Status', data.status.toUpperCase(), startY + 150);

        // 4. Bagian Keperluan
        doc.moveDown(8);
        doc.fontSize(12).font('Helvetica-Bold').text('Keperluan Peminjaman:');
        doc.font('Helvetica').text(data.purpose, { width: 450, align: 'justify' });

        // 5. Footer / Tanda Tangan
        doc.moveDown(5);
        doc.text('Padang, ' + new Date().toLocaleDateString('id-ID'), { align: 'right' });
        doc.moveDown(3);
        doc.text('Penanggung Jawab', { align: 'right' });

        doc.end();
    } catch (err) {
        next(err);
    }
});

// 5. Tandai Selesai
router.post('/:id/selesai', async (req, res, next) => {
    try {
        const [booking] = await db.query('SELECT * FROM room_loans WHERE id = ? AND user_id = ?',
            [req.params.id, req.session.user.id]);

        if (booking.length === 0 || booking[0].status !== 'approved') {
            return res.status(400).send("Tidak bisa diselesaikan.");
        }

        await db.execute('UPDATE room_loans SET status = ?, updated_at = NOW() WHERE id = ?',
            ['completed', req.params.id]);
        res.redirect('/bookings');
    } catch (err) {
        next(err);
    }
});

module.exports = router;