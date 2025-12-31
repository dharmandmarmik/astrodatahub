// src/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const { all, run } = require('../config/database'); 

// --- 1. Admin Dashboard ---
router.get('/dashboard', authMiddleware.isAdmin, adminController.getDashboard);

// --- 2. Daily Discovery (Fun Fact) Management ---
router.get('/manage-fact', authMiddleware.isAdmin, adminController.getFactManager);
router.post('/update-fact', authMiddleware.isAdmin, adminController.updateFact);

// --- 3. User Management ---
router.get('/manage-users', authMiddleware.isAdmin, adminController.getUsers); 
router.post('/user/role', authMiddleware.isAdmin, adminController.updateUserRole);
router.post('/user/delete', authMiddleware.isAdmin, adminController.deleteUser);

// --- 4. Course Management ---
router.get('/manage-courses', authMiddleware.isAdmin, adminController.getManageCourses); 
router.get('/create-course', authMiddleware.isAdmin, adminController.getCreateCourse);
router.post('/create-course', authMiddleware.isAdmin, adminController.createCourse);
router.get('/edit-course/:id', authMiddleware.isAdmin, adminController.getEditCourse);
router.post('/edit-course/:id', authMiddleware.isAdmin, adminController.editCourse);
router.post('/delete-course/:id', authMiddleware.isAdmin, adminController.deleteCourse);

// --- 5. Analytics ---
router.get('/analytics', authMiddleware.isAdmin, adminController.getAnalytics); 

// --- 6. Module Management (Standardized for your links) ---
router.get('/course/:courseId', authMiddleware.isAdmin, adminController.getCourseDetailsAdmin); 
router.get('/create-module/:courseId', authMiddleware.isAdmin, adminController.getCreateModule);
router.post('/create-module/:courseId', authMiddleware.isAdmin, adminController.createModule);

// --- 7. Quiz Management ---
// Route to show the "Add Quiz" page for a specific module
router.get('/modules/:moduleId/add-quiz', authMiddleware.isAdmin, adminController.getAddQuiz);
// Route to handle the form submission for the quiz
router.post('/modules/:moduleId/add-quiz', authMiddleware.isAdmin, adminController.postAddQuiz);

// SECURED: Added authMiddleware.isAdmin to prevent unauthorized access to the editor
router.get('/quiz/edit/:quizId', authMiddleware.isAdmin, adminController.getEditQuiz);
router.post('/quiz/edit/:quizId', authMiddleware.isAdmin, adminController.postEditQuiz);

// --- 8. GLOBAL BROADCAST (ULTIMATE TRANSMISSION) ---
router.get('/broadcast', authMiddleware.isAdmin, (req, res) => {
    res.render('admin/broadcast', { 
        title: 'Global Transmission | Admin',
        user: req.session.user 
    });
});

router.post('/broadcast', authMiddleware.isAdmin, async (req, res) => {
    const { type, title, message } = req.body;
    try {
        const users = await all('SELECT id FROM Users');
        const stmt = 'INSERT INTO Notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)';
        
        await Promise.all(users.map(user => 
            run(stmt, [user.id, type, title, message])
        ));

        req.session.success = `Broadcast successful: Signal transmitted to ${users.length} users.`;
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error("BROADCAST_FAILURE:", err);
        req.session.error = "Transmission failed: Could not reach all sectors.";
        res.redirect('/admin/broadcast');
    }
});

module.exports = router;