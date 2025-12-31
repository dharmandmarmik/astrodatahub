// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); 

/**
 * Middleware: Access Control
 * Ensures the requester is authenticated via Session or Passport.
 */
const isLoggedIn = (req, res, next) => {
    if (req.session.user || req.user) {
        next(); 
    } else {
        res.redirect('/auth/login'); 
    }
};

// --- 1. CORE USER HUB ---
// Student's main overview of their current progress
router.get('/dashboard', isLoggedIn, userController.getDashboard); 
router.get('/faq', userController.getFAQ);

// --- 2. PRIVATE SETTINGS (was /profile) ---
// Used for changing email, username, and security credentials
router.get('/settings', isLoggedIn, userController.getSettings); 
router.post('/settings/update', isLoggedIn, userController.updateProfile); 
router.post('/settings/password', isLoggedIn, userController.updatePassword);

// --- 3. PUBLIC PROFILE (@username) ---
// Accessible by the public to view badges, XP, and rank
router.get('/@:username', userController.getPublicProfile);

// --- 4. ACADEMIC VALIDATION (Quiz System) ---
// Process quiz answers and award status updates/XP
router.post('/course/module/:moduleId/quiz', isLoggedIn, userController.submitQuiz);

module.exports = router;