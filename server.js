require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { initSchema } = require('./config/db');
initSchema();

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const marksRoutes = require('./routes/marks');
const marksheetRoutes = require('./routes/marksheet');

const app = express();
app.use(cors());
app.use(express.json());

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', marksRoutes);
app.use('/api/marksheet', marksheetRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Fallback: send login page for unknown non-API routes (simple SPA-ish behavior)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Campus ERP server running at http://localhost:${PORT}`);
});
