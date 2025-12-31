// server.js - THE MASTER CONTROL FILAMENT
require('dotenv').config(); // CRITICAL: This must be Line 1 to load Client ID/Secret

const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const passport = require('passport'); 

// 1. Import Routes
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const courseRoutes = require('./src/routes/courseRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');

// 2. Import Controllers
const userController = require('./src/controllers/userController');

const app = express();
const PORT = process.env.PORT || 4000;

// --- SETTINGS ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- MIDDLEWARE ---
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// --- SESSION MANAGEMENT ---
app.use(session({
    secret: process.env.SESSION_SECRET || 'galactic_secret_key_88', 
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        maxAge: 1000 * 60 * 60 * 24 // 24 Hours
    }
}));

// --- PASSPORT INITIALIZATION ---
app.use(passport.initialize());
app.use(passport.session());
require('./src/config/passport'); 

// --- GLOBAL VARIABLES FOR EJS ---
app.use((req, res, next) => {
    const currentUser = req.user || req.session.user || null;
    
    if (req.user && !req.session.user) {
        req.session.user = req.user;
    }

    res.locals.user = currentUser;
    res.locals.title = 'AstroDataHub'; 
    
    res.locals.success = req.session.success || null;
    res.locals.error = req.session.error || null;
    
    delete req.session.success;
    delete req.session.error;
    
    next();
});

// --- SMART ROUTING ---

app.get('/', userController.getDashboard);
app.get('/dashboard', (req, res) => res.redirect('/'));
app.get('/faq', userController.getFAQ);

app.get('/support', (req, res) => {
    res.render('support', { 
        title: 'Support Center | AstroDataHub',
        user: req.user || req.session.user || null 
    });
});

/**
 * DYNAMIC PROFILE ROUTE
 * Handles: localhost:4000/@username
 * This must exist outside the /user prefix logic to match the @ pattern
 */
app.get('/@:username', userController.getPublicProfile);

// Modular Routes
app.use('/auth', authRoutes);     
app.use('/user', userRoutes);     
app.use('/admin', adminRoutes);   
app.use('/courses', courseRoutes); 
app.use('/api/notifications', notificationRoutes);

// --- ERROR HANDLING ---

// 404 Handler - Keep this at the bottom of all routes
app.use((req, res) => {
    res.status(404).render('error', { 
        message: 'The coordinates you entered do not exist in this sector.',
        title: '404 - Lost in Space',
        user: req.user || req.session.user || null
    });
});

// Global 500 Handler
app.use((err, req, res, next) => {
    console.error("--- ENGINE FAILURE DETECTED ---");
    console.error(err.stack);
    
    if (err.message.includes('Failed to lookup view')) {
        return res.status(500).send(`
            <body style="background:#000; color:#ff4d4d; font-family:monospace; padding:50px;">
                <h1>CRITICAL_VIEW_MISSING</h1>
                <p>The system tried to render a page that doesn't exist.</p>
                <p><b>Missing File:</b> <code>/views/${err.message.split('"')[1]}</code></p>
                <a href="/" style="color:#fff;">Back to Home</a>
            </body>
        `);
    }

    res.status(500).send(`
        <body style="background:#000; color:#ff4d4d; font-family:monospace; padding:50px;">
            <h1>CRITICAL_SYSTEM_FAILURE</h1>
            <p>Reason: ${err.message}</p>
            <pre style="background:#111; padding:20px; border:1px solid #333; overflow:auto; color: #777;">${err.stack}</pre>
        </body>
    `);
});

// --- LAUNCH ---
app.listen(PORT, (err) => {
    if (err) {
        console.error('❌ Error starting server:', err);
    } else {
        console.log(`
        ====================================================
        🚀 ASTRODATAHUB ULTIMATE IS LIVE
        🌐 URL: http://localhost:${PORT}
        📡 MONITORING: Active
        🛠️ NOTIFICATIONS: Enabled
        ====================================================
        `);
    }
});