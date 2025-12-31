// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const passport = require('passport'); // Added for Google
const authController = require('../controllers/authController');

// --- Login & Registration ---
router.get('/login', authController.getLogin);
router.post('/login', authController.consolidatedLogin);

// Registration View
router.get('/register', (req, res) => res.render('auth/register', { 
    title: 'Register | AstroDataHub', 
    error: null 
}));

// Registration Action
router.post('/register', authController.register);

// --- Google Auth (MODIFIED) ---
// This triggers the Google consent screen
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// This handles the data Google sends back
router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/auth/login' }),
    (req, res) => {
        // Manually sync passport user to your session-based user system
        req.session.user = req.user;
        res.redirect('/dashboard');
    }
);

// --- Logout (THE 404 FIX) ---
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

module.exports = router;