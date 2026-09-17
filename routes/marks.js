const express = require('express');
const { db } = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { computeMarkRow, computeCGPA } = require('../utils/cgpa');

const router = express.Router();

// ---------------- FACULTY ----------------

// Subjects assigned to the logged-in faculty
router.get('/faculty/subjects', verifyToken, requireRole('faculty'), (req, res) => {
  const rows = db.prepare(`
    SELECT s.* FROM subjects s
    JOIN faculty_subjects fs ON fs.subject_id = s.id
    WHERE fs.faculty_id = ?
    ORDER BY s.semester, s.code
  `).all(req.user.id);
  res.json({ subjects: rows });
});

// Students enrolled in a given subject (that this faculty teaches), with current marks
router.get('/faculty/subjects/:subjectId/students', verifyToken, requireRole('faculty'), (req, res) => {
  const { subjectId } = req.params;
  const owns = db.prepare('SELECT * FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?').get(req.user.id, subjectId);
  if (!owns) return res.status(403).json({ error: 'You are not assigned to this subject' });

  const rows = db.prepare(`
    SELECT u.id as student_id, u.name, u.roll_no, e.semester,
           m.internal_marks, m.external_marks, m.total, m.grade, m.grade_point
    FROM enrollments e
    JOIN users u ON u.id = e.student_id
    LEFT JOIN marks m ON m.student_id = e.student_id AND m.subject_id = e.subject_id
    WHERE e.subject_id = ?
    ORDER BY u.roll_no
  `).all(subjectId);
  res.json({ students: rows });
});

// Enter / update marks for a student in a subject
router.post('/faculty/marks', verifyToken, requireRole('faculty'), (req, res) => {
  const { student_id, subject_id, semester, internal_marks, external_marks } = req.body;
  if (!student_id || !subject_id || !semester) {
    return res.status(400).json({ error: 'student_id, subject_id, semester are required' });
  }
  const owns = db.prepare('SELECT * FROM faculty_subjects WHERE faculty_id = ? AND subject_id = ?').get(req.user.id, subject_id);
  if (!owns) return res.status(403).json({ error: 'You are not assigned to this subject' });

  const enrolled = db.prepare('SELECT * FROM enrollments WHERE student_id = ? AND subject_id = ?').get(student_id, subject_id);
  if (!enrolled) return res.status(400).json({ error: 'Student is not enrolled in this subject' });

  const internal = Number(internal_marks) || 0;
  const external = Number(external_marks) || 0;
  const { total, grade, grade_point } = computeMarkRow(internal, external);

  db.prepare(`
    INSERT INTO marks (student_id, subject_id, semester, internal_marks, external_marks, total, grade, grade_point, entered_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(student_id, subject_id) DO UPDATE SET
      internal_marks = excluded.internal_marks,
      external_marks = excluded.external_marks,
      total = excluded.total,
      grade = excluded.grade,
      grade_point = excluded.grade_point,
      entered_by = excluded.entered_by,
      updated_at = datetime('now')
  `).run(student_id, subject_id, semester, internal, external, total, grade, grade_point, req.user.id);

  res.json({ ok: true, total, grade, grade_point });
});

// ---------------- STUDENT ----------------

function getStudentMarksBySemester(studentId) {
  const rows = db.prepare(`
    SELECT s.semester, s.id as subject_id, s.code, s.name as subject_name, s.credits,
           m.internal_marks, m.external_marks, m.total, m.grade, m.grade_point
    FROM enrollments e
    JOIN subjects s ON s.id = e.subject_id
    LEFT JOIN marks m ON m.student_id = e.student_id AND m.subject_id = e.subject_id
    WHERE e.student_id = ?
    ORDER BY s.semester, s.code
  `).all(studentId);

  const bySemester = {};
  for (const r of rows) {
    if (!bySemester[r.semester]) bySemester[r.semester] = [];
    bySemester[r.semester].push(r);
  }
  return bySemester;
}

router.get('/student/marks', verifyToken, requireRole('student'), (req, res) => {
  const bySemester = getStudentMarksBySemester(req.user.id);
  res.json({ marksBySemester: bySemester });
});

router.get('/student/cgpa', verifyToken, requireRole('student'), (req, res) => {
  const bySemester = getStudentMarksBySemester(req.user.id);
  const semesterGroups = Object.entries(bySemester).map(([semester, rows]) => ({
    semester: Number(semester),
    rows: rows.map(r => ({ credits: r.credits, grade_point: r.grade_point || 0 })),
  }));
  const { cgpa, perSemester } = computeCGPA(semesterGroups);
  res.json({ cgpa, perSemester });
});

// Admin/Faculty can also look up any student's marks & cgpa by id
router.get('/marks/:studentId', verifyToken, requireRole('admin', 'faculty'), (req, res) => {
  const bySemester = getStudentMarksBySemester(req.params.studentId);
  const semesterGroups = Object.entries(bySemester).map(([semester, rows]) => ({
    semester: Number(semester),
    rows: rows.map(r => ({ credits: r.credits, grade_point: r.grade_point || 0 })),
  }));
  const { cgpa, perSemester } = computeCGPA(semesterGroups);
  res.json({ marksBySemester: bySemester, cgpa, perSemester });
});

module.exports = router;
