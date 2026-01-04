// src/routes/courseRoutes.js
const express = require('express');
const router = express.Router();
const { get, all, run } = require('../config/database'); 
const courseController = require('../controllers/courseController'); 

// --- 1. Home/Catalog Page ---
// FIXED: Now calls the controller which handles the userCountry logic
router.get('/', courseController.getAllCourses);

// --- 2. Course Detail Page ---
// FIXED: Now calls the controller to handle localized pricing
router.get('/course/:id', courseController.getCourseById);

// --- 3. Enrollment Logic ---
router.post('/enroll/:id', courseController.enrollCourse);

// --- 4. Module View (Lesson Content) ---
router.get('/course/:courseId/module/:moduleId', async (req, res) => {
    const { courseId, moduleId } = req.params;
    if (!req.session.user) return res.redirect('/auth/login');

    try {
        const enrollment = await get('SELECT id FROM Enrollments WHERE user_id = ? AND course_id = ?', [req.session.user.id, courseId]);
        if (!enrollment && req.session.user.role !== 'admin') {
            return res.redirect(`/courses/course/${courseId}`);
        }

        const module = await get('SELECT * FROM CourseModules WHERE id = ? AND course_id = ?', [moduleId, courseId]);
        const course = await get('SELECT title FROM Courses WHERE id = ?', [courseId]);
        const quiz = await get('SELECT id FROM Quizzes WHERE module_id = ?', [moduleId]);

        const allModules = await all('SELECT id FROM CourseModules WHERE course_id = ? ORDER BY module_order ASC', [courseId]);
        const currentIndex = allModules.findIndex(m => m.id == moduleId);
        
        res.render('courses/module-view', {
            title: module.module_title,
            courseTitle: course.title,
            courseId: courseId,
            module: module,
            quiz: quiz,
            prevModuleId: (currentIndex > 0) ? allModules[currentIndex - 1].id : null,
            nextModuleId: (currentIndex < allModules.length - 1) ? allModules[currentIndex + 1].id : null,
            user: req.session.user // Added to prevent header errors
        });
    } catch (err) {
        res.status(500).render('error', { message: 'Failed to load module.' });
    }
});

// --- 5. Quiz Routes ---
router.get('/quiz/:quizId', courseController.getTakeQuiz);
router.post('/quiz/:quizId/submit', courseController.submitQuiz);

// --- 6. Progression Logic ---
router.post('/course/:courseId/module/:moduleId/complete', courseController.completeModule);

module.exports = router;