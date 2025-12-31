// src/routes/courseRoutes.js
const express = require('express');
const router = express.Router();
const { get, all, run } = require('../config/database'); 
// Corrected path (Ensuring the 'n' is in Controller)
const courseController = require('../controllers/courseController'); 

// --- 1. Home/Catalog Page ---
router.get('/', async (req, res) => {
    try {
        const { search, subject, level, standard } = req.query;
        let query = 'SELECT * FROM Courses';
        let params = [];
        let conditions = [];

        if (search) {
            conditions.push('(title LIKE ? OR subject LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (subject) {
            conditions.push('subject = ?');
            params.push(subject);
        }
        if (level) {
            conditions.push('level = ?');
            params.push(level);
        }
        if (standard) {
            conditions.push('standard = ?');
            params.push(standard);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY id DESC';
        const courses = await all(query, params);

        res.render('courses/index', { 
            title: 'AstroDataHub - Course Catalog', 
            courses: courses,
            activeSearch: search || '',    
            activeSubject: subject || '',  
            activeLevel: level || '',      
            activeStandard: standard || '', 
            user: req.session.user || null 
        });
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load courses.' });
    }
});

// --- 2. Course Detail Page (Syllabus) ---
router.get('/course/:id', async (req, res) => {
    const courseId = req.params.id;
    try {
        const course = await get('SELECT * FROM Courses WHERE id = ?', [courseId]);

        if (!course) {
            return res.status(404).render('error', { title: 'Not Found', message: 'Course not found.' });
        }

        const modules = await all(
            'SELECT * FROM CourseModules WHERE course_id = ? ORDER BY module_order ASC', 
            [courseId]
        );

        // Fetch quiz IDs for each module to show buttons in the syllabus
        for (let mod of modules) {
            const quiz = await get('SELECT id FROM Quizzes WHERE module_id = ?', [mod.id]);
            mod.quiz = quiz;
        }

        let isEnrolled = false;
        if (req.session.user) {
            const enrollment = await get(
                'SELECT id FROM Enrollments WHERE user_id = ? AND course_id = ?',
                [req.session.user.id, courseId]
            );
            isEnrolled = !!enrollment;
        }

        res.render('courses/course-detail', { 
            title: course.title, 
            course: course, 
            modules: modules,
            user: req.session.user || null, 
            isLoggedIn: !!req.session.user,
            isEnrolled: isEnrolled 
        });

    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load course details.' });
    }
});

// --- 3. Enrollment Logic ---
router.post('/enroll/:id', async (req, res) => {
    if (!req.session.user) {
        req.session.error = "Please sign in to join this research mission.";
        return res.redirect('/auth/login');
    }

    const courseId = req.params.id;
    const userId = req.session.user.id;

    try {
        const existing = await get('SELECT id FROM Enrollments WHERE user_id = ? AND course_id = ?', [userId, courseId]);
        if (existing) {
            req.session.error = "Already part of this mission.";
            return res.redirect(`/courses/course/${courseId}`);
        }
        await run('INSERT INTO Enrollments (user_id, course_id) VALUES (?, ?)', [userId, courseId]);
        req.session.success = "Enrollment successful!";
        res.redirect('/'); 
    } catch (err) {
        res.redirect(`/courses/course/${courseId}`);
    }
});

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
            nextModuleId: (currentIndex < allModules.length - 1) ? allModules[currentIndex + 1].id : null
        });
    } catch (err) {
        res.status(500).render('error', { message: 'Failed to load module.' });
    }
});

// --- 5. Quiz Routes (Fixes the 404 Error) ---
router.get('/quiz/:quizId', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    // This calls the logic in your src/controllers/courseController.js
    courseController.getTakeQuiz(req, res);
});

router.post('/quiz/:quizId/submit', async (req, res) => {
    if (!req.session.user) return res.status(403).send("Unauthorized");
    courseController.submitQuiz(req, res);
});

// --- 6. Progression Logic ---
router.post('/course/:courseId/module/:moduleId/complete', async (req, res) => {
    const { courseId, moduleId } = req.params;
    const userId = req.session.user.id;
    try {
        await run('INSERT OR IGNORE INTO Completions (user_id, module_id) VALUES (?, ?)', [userId, moduleId]);
        const allModules = await all('SELECT id FROM CourseModules WHERE course_id = ? ORDER BY module_order ASC', [courseId]);
        const currentIndex = allModules.findIndex(m => m.id == moduleId);
        const nextModule = allModules[currentIndex + 1];

        if (nextModule) {
            res.redirect(`/courses/course/${courseId}/module/${nextModule.id}`);
        } else {
            res.redirect('/dashboard');
        }
    } catch (err) {
        res.redirect(`/courses/course/${courseId}/module/${moduleId}`);
    }
});

module.exports = router;