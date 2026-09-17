require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./config/db');
const { computeMarkRow } = require('./utils/cgpa');

initSchema();

function upsertUser({ name, email, password, role, roll_no, department }) {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) return existing;
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, roll_no, department)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, email, hash, role, roll_no || null, department || null);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

function upsertSubject({ code, name, credits, semester }) {
  const existing = db.prepare('SELECT * FROM subjects WHERE code = ?').get(code);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO subjects (code, name, credits, semester) VALUES (?, ?, ?, ?)')
    .run(code, name, credits, semester);
  return db.prepare('SELECT * FROM subjects WHERE id = ?').get(info.lastInsertRowid);
}

console.log('Seeding database...');

const admin = upsertUser({
  name: 'System Admin',
  email: 'admin@campus.edu',
  password: 'Admin@123',
  role: 'admin',
});

const faculty1 = upsertUser({
  name: 'Dr. Anita Sharma',
  email: 'anita.sharma@campus.edu',
  password: 'Faculty@123',
  role: 'faculty',
  department: 'Computer Science',
});

const faculty2 = upsertUser({
  name: 'Prof. Ravi Kumar',
  email: 'ravi.kumar@campus.edu',
  password: 'Faculty@123',
  role: 'faculty',
  department: 'Mathematics',
});

const student1 = upsertUser({
  name: 'Aarav Mehta',
  email: 'aarav.mehta@campus.edu',
  password: 'Student@123',
  role: 'student',
  roll_no: 'CS2024001',
  department: 'Computer Science',
});

const student2 = upsertUser({
  name: 'Priya Verma',
  email: 'priya.verma@campus.edu',
  password: 'Student@123',
  role: 'student',
  roll_no: 'CS2024002',
  department: 'Computer Science',
});

// Semester 1 subjects
const sub1 = upsertSubject({ code: 'CS101', name: 'Programming Fundamentals', credits: 4, semester: 1 });
const sub2 = upsertSubject({ code: 'MA101', name: 'Engineering Mathematics I', credits: 3, semester: 1 });
const sub3 = upsertSubject({ code: 'PH101', name: 'Applied Physics', credits: 3, semester: 1 });

// Semester 2 subjects
const sub4 = upsertSubject({ code: 'CS102', name: 'Data Structures', credits: 4, semester: 2 });
const sub5 = upsertSubject({ code: 'MA102', name: 'Engineering Mathematics II', credits: 3, semester: 2 });

// Assign faculty to subjects
function assignFaculty(facultyId, subjectId) {
  try {
    db.prepare('INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (?, ?)').run(facultyId, subjectId);
  } catch (e) { /* already assigned */ }
}
assignFaculty(faculty1.id, sub1.id);
assignFaculty(faculty1.id, sub4.id);
assignFaculty(faculty2.id, sub2.id);
assignFaculty(faculty2.id, sub3.id);
assignFaculty(faculty2.id, sub5.id);

// Enroll students
function enroll(studentId, subjectId, semester) {
  try {
    db.prepare('INSERT INTO enrollments (student_id, subject_id, semester) VALUES (?, ?, ?)').run(studentId, subjectId, semester);
  } catch (e) { /* already enrolled */ }
}
[student1, student2].forEach((stu) => {
  enroll(stu.id, sub1.id, 1);
  enroll(stu.id, sub2.id, 1);
  enroll(stu.id, sub3.id, 1);
  enroll(stu.id, sub4.id, 2);
  enroll(stu.id, sub5.id, 2);
});

// Sample marks
function setMarks(studentId, subjectId, semester, internal, external, enteredBy) {
  const { total, grade, grade_point } = computeMarkRow(internal, external);
  db.prepare(`
    INSERT INTO marks (student_id, subject_id, semester, internal_marks, external_marks, total, grade, grade_point, entered_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_id, subject_id) DO UPDATE SET
      internal_marks=excluded.internal_marks, external_marks=excluded.external_marks,
      total=excluded.total, grade=excluded.grade, grade_point=excluded.grade_point,
      entered_by=excluded.entered_by, updated_at=datetime('now')
  `).run(studentId, subjectId, semester, internal, external, total, grade, grade_point, enteredBy);
}

setMarks(student1.id, sub1.id, 1, 27, 65, faculty1.id);
setMarks(student1.id, sub2.id, 1, 22, 55, faculty2.id);
setMarks(student1.id, sub3.id, 1, 25, 60, faculty2.id);
setMarks(student1.id, sub4.id, 2, 28, 68, faculty1.id);
setMarks(student1.id, sub5.id, 2, 20, 50, faculty2.id);

setMarks(student2.id, sub1.id, 1, 29, 70, faculty1.id);
setMarks(student2.id, sub2.id, 1, 26, 62, faculty2.id);
setMarks(student2.id, sub3.id, 1, 24, 58, faculty2.id);
setMarks(student2.id, sub4.id, 2, 26, 60, faculty1.id);
setMarks(student2.id, sub5.id, 2, 23, 55, faculty2.id);

console.log('\nSeed complete. Login credentials:\n');
console.log('  ADMIN    -> admin@campus.edu / Admin@123');
console.log('  FACULTY  -> anita.sharma@campus.edu / Faculty@123  (teaches CS101, CS102)');
console.log('  FACULTY  -> ravi.kumar@campus.edu / Faculty@123    (teaches MA101, PH101, MA102)');
console.log('  STUDENT  -> aarav.mehta@campus.edu / Student@123   (roll: CS2024001)');
console.log('  STUDENT  -> priya.verma@campus.edu / Student@123   (roll: CS2024002)');
console.log('\nDone.');
