// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const passport = require('passport'); 
const authController = require('../controllers/authController');

// --- Login ---
router.get('/login', authController.getLogin);
router.post('/login', authController.consolidatedLogin);

// --- Registration ---
router.get('/register', (req, res) => res.render('auth/register', { 
    title: 'Register | AstroDataHub', 
    error: null 
}));
router.post('/register', authController.register);

// --- NEW: Country Onboarding (Step 2 Implementation) ---
// This handles the page where we tell the user WHY they need to pick a country
router.get('/select-country', authController.getSelectCountry);
// This handles the POST request when they click "Personalize My Dashboard"
router.post('/update-country', authController.updateCountry);

// --- NEW: Settings Toggle ---
// This handles the global courses override in the user settings
router.post('/toggle-global', authController.toggleGlobalView);

// --- Email OTP Verification ---
router.get('/verify', (req, res) => {
    if (!req.session.verifyEmail) {
        return res.redirect('/auth/register');
    }
    res.render('auth/verify', { 
        title: 'Verify Identity | AstroDataHub',
        email: req.session.verifyEmail,
        error: null,
        success: null
    });
});

router.post('/verify', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);

// --- Google Auth ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/auth/login' }),
    (req, res) => {
        // Log user into session
        req.session.user = {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role,
            country: req.user.country,
            view_global_always: req.user.view_global_always
        };
        
        // STEP 2 REQ: Check if Google user has country details
        if (!req.user.country) {
            return res.redirect('/auth/select-country');
        }
        res.redirect('/');
    }
);

// --- Logout ---
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

module.exports = router;