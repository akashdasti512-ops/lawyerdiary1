require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database setup ----------
const db = new Database(path.join(__dirname, 'data', 'diary.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS hearings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    hearing_date TEXT NOT NULL,
    hearing_time TEXT NOT NULL,
    case_title TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_cell TEXT NOT NULL,
    court_name TEXT,
    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'upcoming',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

function uuid() {
  return crypto.randomUUID();
}

function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  const token = req.headers['x-app-token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(session.user_id);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

// ---------- Auth: register ----------
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name.trim(), email.toLowerCase(), passwordHash, new Date().toISOString());

  const token = makeToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, id, new Date().toISOString());

  res.json({ token, user: { id, name: name.trim(), email: email.toLowerCase() } });
});

// ---------- Auth: login ----------
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!isValidEmail(email) || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = makeToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, user.id, new Date().toISOString());

  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ---------- Auth: logout ----------
app.post('/api/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.headers['x-app-token']);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---------- Hearings CRUD (scoped to the logged-in user only) ----------
app.get('/api/hearings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM hearings WHERE user_id = ? ORDER BY hearing_date, hearing_time').all(req.user.id);
  res.json(rows);
});

app.post('/api/hearings', requireAuth, (req, res) => {
  const { hearing_date, hearing_time, case_title, client_name, client_cell, court_name, priority, status } = req.body;
  if (!hearing_date || !hearing_time || !case_title || !client_name || !client_cell) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO hearings (id, user_id, hearing_date, hearing_time, case_title, client_name, client_cell, court_name, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, hearing_date, hearing_time, case_title, client_name, client_cell, court_name || '', priority || 'normal', status || 'upcoming');
  res.json({ id });
});

app.put('/api/hearings/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM hearings WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { hearing_date, hearing_time, case_title, client_name, client_cell, court_name, priority, status } = req.body;
  db.prepare(`
    UPDATE hearings SET hearing_date=?, hearing_time=?, case_title=?, client_name=?, client_cell=?, court_name=?, priority=?, status=?
    WHERE id=? AND user_id=?
  `).run(
    hearing_date ?? existing.hearing_date,
    hearing_time ?? existing.hearing_time,
    case_title ?? existing.case_title,
    client_name ?? existing.client_name,
    client_cell ?? existing.client_cell,
    court_name ?? existing.court_name,
    priority ?? existing.priority,
    status ?? existing.status,
    id, req.user.id
  );
  res.json({ ok: true });
});

app.delete('/api/hearings/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM hearings WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Lawyer Diary app (multi-user) running on port ${PORT}`);
});
