// Grade & CGPA calculation utilities
// Marks scheme: internal_marks (max 30) + external_marks (max 70) = total (max 100)
// 10-point grading scale (common in Indian university systems)

const GRADE_SCALE = [
  { min: 90, grade: 'O', point: 10 },
  { min: 80, grade: 'A+', point: 9 },
  { min: 70, grade: 'A', point: 8 },
  { min: 60, grade: 'B+', point: 7 },
  { min: 50, grade: 'B', point: 6 },
  { min: 40, grade: 'C', point: 5 },
  { min: 0, grade: 'F', point: 0 },
];

function gradeFromTotal(total) {
  for (const row of GRADE_SCALE) {
    if (total >= row.min) return { grade: row.grade, point: row.point };
  }
  return { grade: 'F', point: 0 };
}

function computeMarkRow(internal, external) {
  const total = Math.max(0, Math.min(30, internal)) + Math.max(0, Math.min(70, external));
  const { grade, point } = gradeFromTotal(total);
  return { total, grade, grade_point: point };
}

// rows: [{ credits, grade_point }]
function computeSGPA(rows) {
  const totalCredits = rows.reduce((s, r) => s + r.credits, 0);
  if (totalCredits === 0) return 0;
  const weighted = rows.reduce((s, r) => s + r.credits * r.grade_point, 0);
  return Math.round((weighted / totalCredits) * 100) / 100;
}

// semesterGroups: [{ semester, rows: [{credits, grade_point}] }]
function computeCGPA(semesterGroups) {
  let totalCredits = 0;
  let weighted = 0;
  const perSemester = [];
  for (const g of semesterGroups) {
    const sgpa = computeSGPA(g.rows);
    const semCredits = g.rows.reduce((s, r) => s + r.credits, 0);
    perSemester.push({ semester: g.semester, sgpa, credits: semCredits });
    totalCredits += semCredits;
    weighted += semCredits * sgpa;
  }
  const cgpa = totalCredits > 0 ? Math.round((weighted / totalCredits) * 100) / 100 : 0;
  return { cgpa, perSemester };
}

module.exports = { gradeFromTotal, computeMarkRow, computeSGPA, computeCGPA, GRADE_SCALE };
