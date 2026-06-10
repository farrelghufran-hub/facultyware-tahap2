const db = require('../lib/database'); // Pastikan path database-nya bener

const list = (req, res) => {
  res.send('respond with a resource');
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Ambil user berdasarkan email
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (users.length === 0) {
      return res.send("Email tidak terdaftar.");
    }

    const user = users[0];

    // 2. Cek Password (sesuaikan dengan metode hashing lu, ini contoh plain text)
    if (user.password !== password) {
      return res.send("Password salah!");
    }

    // 3. SIMPAN KE SESSION (Ini yang penting banget buat Role Admin!)
    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role // Kolom role yang tadi kita tambah di database
    };

    // 4. Redirect ke Dashboard
    res.redirect('/');

  } catch (err) {
    res.status(500).send("Server Error: " + err.message);
  }
};

module.exports = {
  list,
  login
};