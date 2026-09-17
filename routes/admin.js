const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireRole('admin'));

// ---- Users ----
router.get('/users', (req, res) => {
  const role = req.query.role;
  let rows;
  if (role) {
    rows = db.prepare('SELECT id, name, email, role, roll_no, department, created_at FROM users WHERE role = ? ORDER BY id DESC').all(role);
  } else {
    rows = db.prepare('SELECT id, name, email, role, roll_no, department, created_at FROM users ORDER BY id DESC').all();
  }
  res.json({ users: rows });
});

router.post('/users', (req, res) => {
  const { name, email, password, role, roll_no, department } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, role are required' });
  }
  if (!['admin', 'faculty', 'student'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin, faculty, or student' });
  }
  if (role === 'student' && !roll_no) {
    return res.status(400).json({ error: 'roll_no is required for students' });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare(
      `INSERT INTO users (name, email, password_hash, role, roll_no, department)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name, email.toLowerCase().trim(), hash, role, roll_no || null, department || null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email or roll_no already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.delete('/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Subjects ----
router.get('/subjects', (req, res) => {
  const rows = db.prepare('SELECT * FROM subjects ORDER BY semester, code').all();
  res.json({ subjects: rows });
});

router.post('/subjects', (req, res) => {
  const { code, name, credits, semester } = req.body;
  if (!code || !name || !credits || !semester) {
    return res.status(400).json({ error: 'code, name, credits, semester are required' });
  }
  try {
    const info = db.prepare(
      'INSERT INTO subjects (code, name, credits, semester) VALUES (?, ?, ?, ?)'
    ).run(code.trim(), name.trim(), Number(credits), Number(semester));
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Subject code already exists' });
    }
    res.status(500).json({ error: 'Failed to create subject' });
  }
});

router.delete('/subjects/:id', (req, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Faculty <-> Subject assignment ----
router.post('/assign-faculty', (req, res) => {
  const { faculty_id, subject_id } = req.body;
  if (!faculty_id || !subject_id) {
    return res.status(400).json({ error: 'faculty_id and subject_id are required' });
  }
  const faculty = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'faculty'").get(faculty_id);
  if (!faculty) return res.status(400).json({ error: 'Invalid faculty_id' });

  try {
    db.prepare('INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (?, ?)').run(faculty_id, subject_id);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Already assigned' });
    }
    res.status(500).json({ error: 'Failed to assign' });
  }
});

router.get('/faculty-subjects', (req, res) => {
  const rows = db.prepare(`
    SELECT fs.id, u.id as faculty_id, u.name as faculty_name, s.id as subject_id, s.code, s.name as subject_name, s.semester
    FROM faculty_subjects fs
    JOIN users u ON u.id = fs.faculty_id
    JOIN subjects s ON s.id = fs.subject_id
    ORDER BY u.name, s.semester
  `).all();
  res.json({ assignments: rows });
});

router.delete('/assign-faculty/:id', (req, res) => {
  db.prepare('DELETE FROM faculty_subjects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Student enrollment in subjects (per semester) ----
router.post('/enroll', (req, res) => {
  const { student_id, subject_id, semester } = req.body;
  if (!student_id || !subject_id || !semester) {
    return res.status(400).json({ error: 'student_id, subject_id, semester are required' });
  }
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(student_id);
  if (!student) return res.status(400).json({ error: 'Invalid student_id' });

  try {
    db.prepare('INSERT INTO enrollments (student_id, subject_id, semester) VALUES (?, ?, ?)').run(student_id, subject_id, semester);
    // create an empty marks row so faculty can see the student in their list
    db.prepare(`
      INSERT OR IGNORE INTO marks (student_id, subject_id, semester, internal_marks, external_marks, total, grade, grade_point)
      VALUES (?, ?, ?, 0, 0, 0, 'F', 0)
    `).run(student_id, subject_id, semester);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Student already enrolled in this subject' });
    }
    res.status(500).json({ error: 'Failed to enroll' });
  }
});

router.get('/enrollments', (req, res) => {
  const rows = db.prepare(`
    SELECT e.id, u.id as student_id, u.name as student_name, u.roll_no, s.id as subject_id, s.code, s.name as subject_name, e.semester
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    JOIN subjects s ON s.id = e.subject_id
    ORDER BY u.name, e.semester
  `).all();
  res.json({ enrollments: rows });
});

router.delete('/enroll/:id', (req, res) => {
  db.prepare('DELETE FROM enrollments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
