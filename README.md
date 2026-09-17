# Campus ERP — Node.js + Express + SQLite

A complete, runnable full-stack college ERP system:

- **Backend:** Node.js, Express, SQLite (via `better-sqlite3` — no separate DB server needed)
- **Auth:** JWT-based, role-based access control (`admin`, `faculty`, `student`)
- **Core features:** user/subject management, faculty mark entry, dynamic **CGPA/SGPA calculation**, **PDF marksheet generation** (per-semester and consolidated)
- **Frontend:** plain HTML/CSS/JS (no build step) served statically by Express

## 1. Requirements

- Node.js 18+ and npm
- No external database — SQLite file is created automatically on first run

## 2. Setup

```bash
cd campus-erp
npm install
cp .env.example .env        # edit JWT_SECRET for production use
npm run seed                 # creates the SQLite DB + demo admin/faculty/student accounts
npm start                    # starts the server on http://localhost:4000
```

Then open **http://localhost:4000** in your browser.

## 3. Demo accounts (created by `npm run seed`)

| Role    | Email                        | Password      | Notes                                  |
|---------|------------------------------|----------------|-----------------------------------------|
| Admin   | admin@campus.edu             | Admin@123      | Full management access                 |
| Faculty | anita.sharma@campus.edu      | Faculty@123    | Teaches CS101, CS102                    |
| Faculty | ravi.kumar@campus.edu        | Faculty@123    | Teaches MA101, PH101, MA102             |
| Student | aarav.mehta@campus.edu       | Student@123    | Roll: CS2024001, enrolled in 5 subjects |
| Student | priya.verma@campus.edu       | Student@123    | Roll: CS2024002, enrolled in 5 subjects |

## 4. How it works

### Roles
- **Admin** — create/delete users (admin/faculty/student), create subjects, assign faculty to subjects, enroll students in subjects per semester.
- **Faculty** — see only the subjects they're assigned to, view enrolled students, enter/update internal & external marks. Grade and grade-point are computed automatically on save.
- **Student** — view marks per semester, see live CGPA/SGPA, and download PDF marksheets (single semester or consolidated across all semesters).

### Grading scale (10-point, editable in `utils/cgpa.js`)
Marks = Internal (max 30) + External (max 70) = Total (max 100)

| Total    | Grade | Points |
|----------|-------|--------|
| 90–100   | O     | 10     |
| 80–89    | A+    | 9      |
| 70–79    | A     | 8      |
| 60–69    | B+    | 7      |
| 50–59    | B     | 6      |
| 40–49    | C     | 5      |
| < 40     | F     | 0      |

- **SGPA** = Σ(credits × grade point) / Σ(credits) for a semester
- **CGPA** = Σ(semester credits × SGPA) / Σ(all credits) across every semester the student has records for

### PDF marksheets
Generated on the fly with `pdfkit` (no external binaries/tools needed):
- `GET /api/marksheet/:studentId/:semester` — single semester
- `GET /api/marksheet/:studentId/full/consolidated` — all semesters + overall CGPA

Students can only download their own marksheet; admin/faculty can fetch any student's.

## 5. Project structure

```
campus-erp/
├── server.js               # Express app entrypoint
├── seed.js                 # creates demo data
├── config/db.js            # SQLite connection + schema
├── middleware/auth.js      # JWT sign/verify, role guard
├── utils/cgpa.js            # grading scale, SGPA/CGPA math
├── routes/
│   ├── auth.js             # POST /api/auth/login, GET /api/auth/me
│   ├── admin.js            # user/subject/assignment/enrollment CRUD
│   ├── marks.js            # faculty mark entry, student marks & CGPA
│   └── marksheet.js        # PDF generation
└── public/                 # frontend (login/admin/faculty/student pages)
```

## 6. API summary

All routes except `/api/auth/login` require `Authorization: Bearer <token>`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /api/auth/login | any | Login, returns JWT |
| GET | /api/auth/me | any | Current user info |
| GET/POST/DELETE | /api/admin/users | admin | Manage users |
| GET/POST/DELETE | /api/admin/subjects | admin | Manage subjects |
| POST/GET/DELETE | /api/admin/assign-faculty | admin | Assign faculty ↔ subject |
| POST/GET/DELETE | /api/admin/enroll | admin | Enroll student ↔ subject/semester |
| GET | /api/faculty/subjects | faculty | My assigned subjects |
| GET | /api/faculty/subjects/:id/students | faculty | Students + current marks |
| POST | /api/faculty/marks | faculty | Save internal/external marks |
| GET | /api/student/marks | student | My marks by semester |
| GET | /api/student/cgpa | student | My CGPA + per-semester SGPA |
| GET | /api/marks/:studentId | admin, faculty | Look up any student's marks/CGPA |
| GET | /api/marksheet/:studentId/:semester | any (own record) | Single-semester PDF |
| GET | /api/marksheet/:studentId/full/consolidated | any (own record) | Consolidated PDF |

## 7. Notes on this build

- Passwords are hashed with `bcryptjs`; JWTs signed with `jsonwebtoken`.
- `better-sqlite3` is synchronous, which keeps route handlers simple — fine for this scale of app.
- This build was **syntax-checked file by file** (`node --check`) but could not be `npm install`ed or run end-to-end inside the sandbox it was built in (no network access there). It uses only well-established, standard packages/APIs, but please run `npm install && npm run seed && npm start` yourself and sanity-check the login flow before relying on it.
- To reset the database, stop the server and delete the `db/` folder, then run `npm run seed` again.
