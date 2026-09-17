const express = require('express');
const PDFDocument = require('pdfkit');
const { db } = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { computeCGPA } = require('../utils/cgpa');

const router = express.Router();

function getStudent(studentId) {
  return db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(studentId);
}

function getSemesterRows(studentId, semester) {
  return db.prepare(`
    SELECT s.code, s.name as subject_name, s.credits,
           m.internal_marks, m.external_marks, m.total, m.grade, m.grade_point
    FROM enrollments e
    JOIN subjects s ON s.id = e.subject_id
    LEFT JOIN marks m ON m.student_id = e.student_id AND m.subject_id = e.subject_id
    WHERE e.student_id = ? AND e.semester = ?
    ORDER BY s.code
  `).all(studentId, semester);
}

function getAllSemesterRowsGrouped(studentId) {
  const rows = db.prepare(`
    SELECT s.semester, s.code, s.name as subject_name, s.credits,
           m.internal_marks, m.external_marks, m.total, m.grade, m.grade_point
    FROM enrollments e
    JOIN subjects s ON s.id = e.subject_id
    LEFT JOIN marks m ON m.student_id = e.student_id AND m.subject_id = e.subject_id
    WHERE e.student_id = ?
    ORDER BY s.semester, s.code
  `).all(studentId);
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.semester]) grouped[r.semester] = [];
    grouped[r.semester].push(r);
  }
  return grouped;
}

function drawHeader(doc, student) {
  doc.fontSize(18).font('Helvetica-Bold').text('CAMPUS ERP', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Official Marksheet / Grade Report', { align: 'center' });
  doc.moveDown(0.8);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.6);

  doc.fontSize(10).font('Helvetica-Bold').text('Student Name: ', { continued: true }).font('Helvetica').text(student.name);
  doc.font('Helvetica-Bold').text('Roll No: ', { continued: true }).font('Helvetica').text(student.roll_no || '-');
  doc.font('Helvetica-Bold').text('Department: ', { continued: true }).font('Helvetica').text(student.department || '-');
  doc.font('Helvetica-Bold').text('Email: ', { continued: true }).font('Helvetica').text(student.email);
  doc.moveDown(0.8);
}

function drawSemesterTable(doc, semester, rows) {
  doc.fontSize(12).font('Helvetica-Bold').text(`Semester ${semester}`);
  doc.moveDown(0.3);

  const colX = { code: doc.page.margins.left, name: 90, credits: 320, internal: 375, external: 430, total: 485, grade: 530 };
  const top = doc.y;
  doc.fontSize(9).font('Helvetica-Bold');
  doc.text('Code', colX.code, top);
  doc.text('Subject', colX.name, top);
  doc.text('Credits', colX.credits, top);
  doc.text('Int', colX.internal, top);
  doc.text('Ext', colX.external, top);
  doc.text('Total', colX.total, top);
  doc.text('Grade', colX.grade, top);
  doc.moveDown(0.4);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.2);

  doc.font('Helvetica').fontSize(9);
  let totalCredits = 0;
  let weightedPoints = 0;
  for (const r of rows) {
    const y = doc.y;
    doc.text(r.code, colX.code, y);
    doc.text(r.subject_name, colX.name, y, { width: 220 });
    doc.text(String(r.credits), colX.credits, y);
    doc.text(String(r.internal_marks ?? 0), colX.internal, y);
    doc.text(String(r.external_marks ?? 0), colX.external, y);
    doc.text(String(r.total ?? 0), colX.total, y);
    doc.text(r.grade || '-', colX.grade, y);
    doc.moveDown(0.5);
    totalCredits += r.credits;
    weightedPoints += r.credits * (r.grade_point || 0);
  }

  const sgpa = totalCredits > 0 ? Math.round((weightedPoints / totalCredits) * 100) / 100 : 0;
  doc.moveDown(0.2);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').text(`SGPA (Semester ${semester}): ${sgpa}`, { align: 'right' });
  doc.moveDown(0.8);
  return sgpa;
}

// GET /api/marksheet/:studentId/:semester  -> single semester PDF
router.get('/:studentId/:semester', verifyToken, (req, res) => {
  const { studentId, semester } = req.params;

  if (req.user.role === 'student' && Number(req.user.id) !== Number(studentId)) {
    return res.status(403).json({ error: 'You can only view your own marksheet' });
  }
  if (!['admin', 'faculty', 'student'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const student = getStudent(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const rows = getSemesterRows(studentId, semester);
  if (rows.length === 0) return res.status(404).json({ error: 'No records found for this semester' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="marksheet_${student.roll_no || student.id}_sem${semester}.pdf"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  drawHeader(doc, student);
  drawSemesterTable(doc, semester, rows);
  doc.fontSize(8).font('Helvetica-Oblique').text(`Generated on ${new Date().toLocaleString()}`, { align: 'right' });
  doc.end();
});

// GET /api/marksheet/:studentId/full/consolidated -> all semesters + CGPA
router.get('/:studentId/full/consolidated', verifyToken, (req, res) => {
  const { studentId } = req.params;

  if (req.user.role === 'student' && Number(req.user.id) !== Number(studentId)) {
    return res.status(403).json({ error: 'You can only view your own marksheet' });
  }

  const student = getStudent(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const grouped = getAllSemesterRowsGrouped(studentId);
  const semesters = Object.keys(grouped).map(Number).sort((a, b) => a - b);
  if (semesters.length === 0) return res.status(404).json({ error: 'No records found for this student' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="marksheet_${student.roll_no || student.id}_consolidated.pdf"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);
  drawHeader(doc, student);

  const semesterGroups = [];
  for (const sem of semesters) {
    if (doc.y > 620) doc.addPage();
    const rows = grouped[sem];
    drawSemesterTable(doc, sem, rows);
    semesterGroups.push({ semester: sem, rows: rows.map(r => ({ credits: r.credits, grade_point: r.grade_point || 0 })) });
  }

  const { cgpa } = computeCGPA(semesterGroups);
  doc.moveDown(0.4);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.4);
  doc.fontSize(13).font('Helvetica-Bold').text(`Overall CGPA: ${cgpa}`, { align: 'right' });
  doc.fontSize(8).font('Helvetica-Oblique').moveDown(0.5).text(`Generated on ${new Date().toLocaleString()}`, { align: 'right' });

  doc.end();
});

module.exports = router;
