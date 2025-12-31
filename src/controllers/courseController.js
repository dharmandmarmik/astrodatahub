// src/controllers/courseController.js
const { run, get, all } = require('../config/database');

/**
 * HELPER: Send Internal Notification (Transmission)
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

// --- 1. GET ALL COURSES (With Search, Subject, Level, and Standard) ---
exports.getAllCourses = async (req, res) => {
    try {
        const { search, subject, level, standard } = req.query;
        let query = 'SELECT * FROM Courses';
        let params = [];
        let conditions = [];

        // Search Logic
        if (search) {
            conditions.push('(title LIKE ? OR subject LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        // Subject Filter
        if (subject) {
            conditions.push('subject = ?');
            params.push(subject);
        }

        // Level Filter
        if (level) {
            conditions.push('level = ?');
            params.push(level);
        }

        // Standard Filter (Grade, College, etc.)
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
            user: req.user || req.session.user || null 
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
        const course = await get('SELECT * FROM Courses WHERE id = ?', [courseId]);
        if (!course) return res.status(404).render('error', { title: 'Not Found', message: 'Course not found.' });

        // Fetch modules ordered by module_order
        const modules = await all('SELECT * FROM CourseModules WHERE course_id = ? ORDER BY module_order ASC', [courseId]);

        // Check for Quizzes attached to these modules for syllabus display
        for (let mod of modules) {
            mod.quiz = await get('SELECT id, quiz_title FROM Quizzes WHERE module_id = ?', [mod.id]);
        }

        let isEnrolled = false;
        let completedModuleIds = [];
        const currentUser = req.user || req.session.user;

        if (currentUser) {
            const enrollment = await get('SELECT id FROM Enrollments WHERE user_id = ? AND course_id = ?', [currentUser.id, course.id]);
            isEnrolled = !!enrollment;

            const completions = await all(`
                SELECT module_id FROM Completions 
                WHERE user_id = ? AND module_id IN (SELECT id FROM CourseModules WHERE course_id = ?)
            `, [currentUser.id, courseId]);
            completedModuleIds = completions.map(c => c.module_id);
        }

        res.render('courses/course-detail', { 
            title: course.title,
            course, 
            modules,
            isEnrolled,
            completedModuleIds,
            user: currentUser || null,
            isLoggedIn: !!currentUser
        });
    } catch (err) {
        console.error("COURSE_DETAIL_ERROR:", err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load course details.' });
    }
};

// --- 3. QUIZ PARTICIPATION ---

exports.getTakeQuiz = async (req, res) => {
    const { quizId } = req.params;
    const currentUser = req.user || req.session.user;

    if (!currentUser) return res.redirect('/auth/login');

    try {
        const quiz = await get('SELECT * FROM Quizzes WHERE id = ?', [quizId]);
        if (!quiz) return res.status(404).render('error', { message: 'Quiz not found.' });

        // Using table 'Questions' as per your database.js
        const questions = await all('SELECT * FROM Questions WHERE quiz_id = ?', [quizId]);

        // Parse JSON options
        const parsedQuestions = questions.map(q => ({
            ...q,
            options: q.options_json ? JSON.parse(q.options_json) : []
        }));

        res.render('courses/take-quiz', {
            title: quiz.quiz_title,
            quiz,
            questions: parsedQuestions,
            user: currentUser
        });
    } catch (err) {
        console.error("QUIZ_LOAD_ERROR:", err);
        res.status(500).render('error', { message: 'Failed to initialize quiz session.' });
    }
};

exports.submitQuiz = async (req, res) => {
    const { quizId } = req.params;
    
    // Based on your debug: req.body.answers is an array ['0', '1']
    // We ensure it's treated as an array even if only one answer is sent
    let userAnswers = req.body.answers || [];
    if (!Array.isArray(userAnswers)) {
        userAnswers = [userAnswers];
    }

    const currentUser = req.user || req.session.user;

    try {
        const quiz = await get('SELECT * FROM Quizzes WHERE id = ?', [quizId]);
        const questions = await all('SELECT * FROM Questions WHERE quiz_id = ?', [quizId]);

        if (!quiz) return res.status(404).render('error', { message: 'Quiz not found.' });

        let score = 0;
        const review = [];

        // We use the index (i) to match the question with the answer in the array
        questions.forEach((q, i) => {
            let options = [];
            try {
                options = JSON.parse(q.options_json);
            } catch (e) {
                options = ["Error loading options"];
            }
            
            // Get the answer from the array at the same position as the question
            const submittedValue = userAnswers[i]; 
            
            const userChoiceIndex = (submittedValue !== undefined && submittedValue !== null) ? Number(submittedValue) : null;
            const actualCorrectIndex = Number(q.correct_index);

            const isCorrect = (userChoiceIndex !== null) && (userChoiceIndex === actualCorrectIndex);

            if (isCorrect) score++;

            review.push({
                question: q.question_text,
                options: options,
                userChoice: (userChoiceIndex !== null && options[userChoiceIndex]) ? options[userChoiceIndex] : "No answer",
                correctAnswer: options[actualCorrectIndex] || "Not Defined",
                isCorrect: isCorrect
            });
        });

        const total = questions.length;
        const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

        res.render('courses/quiz-result', {
            title: 'Mission Results',
            score,
            total,
            percentage,
            quiz,
            review,
            user: currentUser
        });
    } catch (err) {
        console.error("QUIZ_SUBMIT_ERROR:", err);
        res.status(500).render('error', { message: 'Failed to process mission data.' });
    }
};

// --- 4. ENROLLMENT & COMPLETION ---

exports.enrollCourse = async (req, res) => {
    const courseId = req.params.id;
    const currentUser = req.user || req.session.user;
    if (!currentUser) return res.redirect('/auth/login');

    try {
        const existing = await get('SELECT id FROM Enrollments WHERE user_id = ? AND course_id = ?', [currentUser.id, courseId]);
        if (existing) return res.redirect(`/courses/course/${courseId}`);

        await run('INSERT INTO Enrollments (user_id, course_id) VALUES (?, ?)', [currentUser.id, courseId]);
        const course = await get('SELECT title FROM Courses WHERE id = ?', [courseId]);

        await sendNotification(currentUser.id, 'progress', 'Mission Accepted', `Your journey into "${course.title}" has begun.`);
        res.redirect('/dashboard'); 
    } catch (err) {
        console.error("ENROLL_ERROR:", err);
        res.redirect(`/courses/course/${courseId}`);
    }
};

exports.completeModule = async (req, res) => {
    const currentUser = req.user || req.session.user;
    if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });

    const { moduleId, courseId } = req.body;

    try {
        await run('INSERT OR IGNORE INTO Completions (user_id, module_id) VALUES (?, ?)', [currentUser.id, moduleId]);
        const info = await get(`
            SELECT m.module_title, c.title as course_title 
            FROM CourseModules m 
            JOIN Courses c ON m.course_id = c.id 
            WHERE m.id = ?`, [moduleId]);

        if (info) {
            await sendNotification(currentUser.id, 'progress', 'Module Completed!', `Mastered: ${info.module_title}.`);
        }
        res.redirect('back');
    } catch (err) {
        console.error("COMPLETION_ERROR:", err);
        res.redirect('back');
    }
};