// src/controllers/courseController.js
const { run, get, all } = require('../config/database');
const axios = require('axios');

/**
 * HELPER: Send Internal Notification
 */
async function sendNotification(userId, type, title, message) {
    try {
        await run(
            'INSERT INTO Notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
            [userId, type, title, message]
        );
    } catch (err) {
        console.error("NOTIFICATION_TRIGGER_FAILURE:", err);
    }
}

/**
 * HELPER: Unified Geolocation Logic
 */
async function getDetectedCountry(req) {
    let userCountry = 'GLOBAL';
    try {
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip === '::1' || ip === '127.0.0.1') ip = '103.115.200.1'; 

        const geoResponse = await axios.get(`http://ip-api.com/json/${ip}?fields=status,countryCode`);
        if (geoResponse.data.status === 'success') {
            userCountry = geoResponse.data.countryCode;
        }
    } catch (geoErr) {
        console.error("GEO_DETECTION_SILENT_FAIL: Defaulting to GLOBAL");
    }
    return userCountry;
}

// --- 1. GET ALL COURSES (Strict Filtering Fix) ---
exports.getAllCourses = async (req, res) => {
    try {
        const user = req.session.user;
        let targetRegion;

        if (user && user.view_global_always === 1) {
            targetRegion = 'GLOBAL'; 
        } else if (user && user.country) {
            targetRegion = user.country;
        } else {
            targetRegion = await getDetectedCountry(req);
        }

        let { search, subject, standard } = req.query;
        let query = 'SELECT * FROM Courses';
        let params = [];
        let conditions = [];

        if (targetRegion !== 'GLOBAL') {
            conditions.push("(country_code = ? OR country_code = 'GLOBAL')");
            params.push(targetRegion);
        }

        if (search) {
            conditions.push('(title LIKE ? OR subject LIKE ? OR description LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (subject) { conditions.push('subject = ?'); params.push(subject); }
        if (standard) { conditions.push('standard = ?'); params.push(standard); }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        if (targetRegion !== 'GLOBAL') {
            query += ` ORDER BY CASE WHEN country_code = ? THEN 1 ELSE 2 END, id DESC`;
            params.push(targetRegion);
        } else {
            query += ` ORDER BY id DESC`;
        }
        
        const courses = await all(query, params);

        // FIX: Added 'userCountry' to the render object to satisfy index.ejs:54
        res.render('courses/index', { 
            title: 'AstroDataHub - Catalog', 
            courses,
            userCountry: targetRegion, 
            activeCountry: targetRegion,
            user: user,
            activeSearch: search || '',    
            activeSubject: subject || '',  
            activeStandard: standard || ''
        });
    } catch (err) {
        console.error("CATALOG_FETCH_ERROR:", err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load courses.' });
    }
};

// --- 2. GET SINGLE COURSE DETAIL ---
exports.getCourseById = async (req, res) => {
    try {
        const courseId = req.params.id;
        const user = req.session.user;

        const course = await get('SELECT * FROM Courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).render('error', { message: 'Course not found.' });

        const modules = await all('SELECT * FROM CourseModules WHERE course_id = ? ORDER BY module_order ASC', [courseId]);

        for (let mod of modules) {
            mod.quiz = await get('SELECT id FROM Quizzes WHERE module_id = ?', [mod.id]);
        }

        let isEnrolled = false;
        let completedModuleIds = [];

        if (user) {
            const enrollment = await get('SELECT id FROM Enrollments WHERE user_id = ? AND course_id = ?', [user.id, courseId]);
            isEnrolled = !!enrollment;

            const completions = await all(`
                SELECT module_id FROM Completions 
                WHERE user_id = ? AND module_id IN (SELECT id FROM CourseModules WHERE course_id = ?)
            `, [user.id, courseId]);
            completedModuleIds = completions.map(c => c.module_id);
        }

        res.render('courses/course-detail', { 
            title: course.title,
            course, 
            modules,
            isEnrolled,
            completedModuleIds,
            user: user
        });
    } catch (err) {
        console.error("COURSE_DETAIL_ERROR:", err);
        res.status(500).render('error', { message: 'Failed to load course details.' });
    }
};

// --- 3. QUIZ LOGIC ---
exports.getTakeQuiz = async (req, res) => {
    const { quizId } = req.params;
    const user = req.session.user;
    if (!user) return res.redirect('/auth/login');

    try {
        const quiz = await get('SELECT * FROM Quizzes WHERE id = ?', [quizId]);
        const questions = await all('SELECT * FROM Questions WHERE quiz_id = ?', [quizId]);
        const parsedQuestions = questions.map(q => ({
            ...q,
            options: q.options_json ? JSON.parse(q.options_json) : []
        }));

        res.render('courses/take-quiz', {
            title: quiz.quiz_title,
            quiz,
            questions: parsedQuestions,
            user: user
        });
    } catch (err) {
        res.status(500).render('error', { message: 'Failed to load quiz.' });
    }
};

exports.submitQuiz = async (req, res) => {
    const { quizId } = req.params;
    const user = req.session.user;
    let userAnswers = req.body.answers || [];
    if (!Array.isArray(userAnswers)) userAnswers = [userAnswers];

    try {
        const quiz = await get('SELECT * FROM Quizzes WHERE id = ?', [quizId]);
        const questions = await all('SELECT * FROM Questions WHERE quiz_id = ?', [quizId]);

        let score = 0;
        const review = questions.map((q, i) => {
            const options = JSON.parse(q.options_json || '[]');
            const userChoiceIndex = userAnswers[i] !== undefined ? parseInt(userAnswers[i]) : null;
            const isCorrect = userChoiceIndex === q.correct_index;
            if (isCorrect) score++;

            return {
                question: q.question_text,
                options,
                userChoice: userChoiceIndex !== null ? options[userChoiceIndex] : "No answer",
                correctAnswer: options[q.correct_index],
                isCorrect
            };
        });

        res.render('courses/quiz-result', {
            title: 'Results',
            score,
            total: questions.length,
            percentage: Math.round((score / questions.length) * 100),
            quiz,
            review,
            user: user
        });
    } catch (err) {
        res.status(500).render('error', { message: 'Submission failed.' });
    }
};

// --- 4. ENROLLMENT & COMPLETION ---
exports.enrollCourse = async (req, res) => {
    const courseId = req.params.id;
    const user = req.session.user;
    if (!user) return res.redirect('/auth/login');

    try {
        await run('INSERT OR IGNORE INTO Enrollments (user_id, course_id) VALUES (?, ?)', [user.id, courseId]);
        const course = await get('SELECT title FROM Courses WHERE id = ?', [courseId]);
        await sendNotification(user.id, 'progress', 'Enrolled', `You joined ${course.title}.`);
        res.redirect('/dashboard'); 
    } catch (err) {
        res.redirect(`/courses/course/${courseId}`);
    }
};

exports.completeModule = async (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).send('Unauthorized');

    const { courseId, moduleId } = req.params;

    try {
        await run('INSERT OR IGNORE INTO Completions (user_id, module_id) VALUES (?, ?)', [user.id, moduleId]);
        
        const allModules = await all('SELECT id FROM CourseModules WHERE course_id = ? ORDER BY module_order ASC', [courseId]);
        const currentIndex = allModules.findIndex(m => m.id == moduleId);
        const nextModule = allModules[currentIndex + 1];

        if (nextModule) {
            res.redirect(`/courses/course/${courseId}/module/${nextModule.id}`);
        } else {
            await sendNotification(user.id, 'success', 'Course Complete', 'You finished all modules!');
            res.redirect('/dashboard');
        }
    } catch (err) {
        res.redirect('back');
    }
};