// src/controllers/adminController.js - COMPLETE CONSOLIDATED FILE

const { run, all, get } = require('../config/database');
const bcrypt = require('bcryptjs'); 
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const dompurify = createDOMPurify(window);

// --- 1. ADMIN DASHBOARD ---

exports.getDashboard = async (req, res) => {
    try {
        const userCount = await get('SELECT COUNT(*) AS count FROM Users');
        const courseCount = await get('SELECT COUNT(*) AS count FROM Courses');
        const enrollmentCount = await get('SELECT COUNT(*) AS count FROM Enrollments');
        
        const stats = {
            totalUsers: userCount.count || 0,
            totalCourses: courseCount.count || 0,
            totalEnrollments: enrollmentCount.count || 0
        };

        res.render('admin/dashboard', { 
            title: 'Admin Dashboard',
            adminUser: req.session.user, 
            stats: stats,
            success: req.session.success,
            error: req.session.error
        });
        
        req.session.success = null;
        req.session.error = null;
    } catch (err) {
        console.error("DASHBOARD_FETCH_ERROR:", err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load dashboard data.' });
    }
};

// --- 2. DAILY DISCOVERY (FUN FACT) MANAGEMENT ---

exports.getFactManager = async (req, res) => {
    try {
        const dailyFact = await get('SELECT content FROM DailyBriefing WHERE id = 1');
        
        res.render('admin/fact-manager', { 
            title: 'Manage Daily Fact',
            adminUser: req.session.user,
            currentFact: dailyFact ? dailyFact.content : "No fact set yet.",
            success: req.session.success,
            error: req.session.error
        });
        req.session.success = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load fact manager.' });
    }
};

exports.updateFact = async (req, res) => {
    const { factText } = req.body;
    
    if (!factText) {
        req.session.error = "Fact content cannot be empty.";
        return res.redirect('/admin/manage-fact');
    }

    try {
        await run('UPDATE DailyBriefing SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [factText]);
        req.session.success = "Daily Discovery fact updated successfully!";
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        req.session.error = "Failed to update the daily fact.";
        res.redirect('/admin/manage-fact');
    }
};

// --- 3. USER MANAGEMENT ---

exports.getUsers = async (req, res) => {
    try {
        const users = await all('SELECT id, username, email, role FROM Users ORDER BY id DESC');
        
        res.render('admin/manage-users', { 
            title: 'Manage Users', 
            adminUser: req.session.user, 
            users: users,
            success: req.session.success,
            error: req.session.error
        });
        req.session.success = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load user list.' });
    }
};

exports.updateUserRole = async (req, res) => {
    const { userId, newRole } = req.body;
    try {
        if (parseInt(userId) === req.session.user.id) {
            req.session.error = "You cannot change your own role!";
        } else {
            await run('UPDATE Users SET role = ? WHERE id = ?', [newRole, userId]);
            req.session.success = `User role updated to ${newRole}.`;
        }
        res.redirect('/admin/manage-users'); 
    } catch (err) {
        console.error(err);
        req.session.error = 'Failed to update user role.';
        res.redirect('/admin/manage-users');
    }
};

exports.deleteUser = async (req, res) => {
    const { userId } = req.body;
    try {
        if (parseInt(userId) === req.session.user.id) {
             req.session.error = "You cannot delete your own account via the admin panel.";
        } else {
            await run('DELETE FROM Users WHERE id = ?', [userId]);
            req.session.success = 'User deleted successfully.';
        }
        res.redirect('/admin/manage-users');
    } catch (err) {
        console.error(err);
        req.session.error = 'Failed to delete user.';
        res.redirect('/admin/manage-users');
    }
};

// --- 4. COURSE MANAGEMENT ---

exports.getManageCourses = async (req, res) => {
    try {
        const courses = await all(`
            SELECT c.*, u.username as instructor_name 
            FROM Courses c
            LEFT JOIN Users u ON c.instructor_id = u.id
            ORDER BY c.id DESC
        `);

        res.render('admin/manage-courses', { 
            title: 'Manage All Courses',
            adminUser: req.session.user,
            courses: courses,
            success: req.session.success,
            error: req.session.error
        });
        req.session.success = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load courses for management.' });
    }
};

exports.getCreateCourse = (req, res) => {
    res.render('admin/create-course', { 
        title: 'Create New Course',
        adminUser: req.session.user, 
        error: req.session.error || null
    });
    req.session.error = null;
};

exports.createCourse = async (req, res) => {
    const { title, description, subject, level, standard } = req.body;
    const instructorId = req.session.user.id; 

    if (!title || !description || !subject || !level || !standard) {
        req.session.error = "All course fields including Academic Path are required.";
        return res.redirect('/admin/create-course');
    }

    try {
        await run(
            'INSERT INTO Courses (title, description, subject, level, standard, instructor_id) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, subject, level, standard, instructorId]
        );
        req.session.success = `Course "${title}" created successfully.`;
        res.redirect('/admin/manage-courses'); 
    } catch (err) {
        console.error(err);
        req.session.error = "Failed to create course.";
        res.redirect('/admin/create-course');
    }
};

exports.getEditCourse = async (req, res) => {
    const courseId = req.params.id;
    try {
        const course = await get('SELECT * FROM Courses WHERE id = ?', [courseId]);
        if (!course) {
            req.session.error = 'Course not found.';
            return res.redirect('/admin/dashboard');
        }
        
        const moduleCountResult = await get('SELECT COUNT(*) AS count FROM CourseModules WHERE course_id = ?', [courseId]);

        res.render('admin/edit-course', {
            title: `Edit Course: ${course.title}`,
            adminUser: req.session.user, 
            course: course,
            moduleCount: moduleCountResult.count, 
            error: req.session.error || null,
            success: req.session.success || null 
        });
        req.session.error = null;
        req.session.success = null;
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Failed to load course for editing.' });
    }
};

exports.editCourse = async (req, res) => {
    const courseId = req.params.id;
    const { title, description, subject, level, standard } = req.body;

    if (!title || !description || !subject || !level || !standard) {
        req.session.error = "All course fields are required.";
        return res.redirect(`/admin/edit-course/${courseId}`);
    }

    try {
        await run(
            'UPDATE Courses SET title = ?, description = ?, subject = ?, level = ?, standard = ? WHERE id = ?',
            [title, description, subject, level, standard, courseId]
        );
        req.session.success = `Course "${title}" updated successfully.`;
        res.redirect('/admin/manage-courses'); 
    } catch (err) {
        console.error(err);
        req.session.error = 'Failed to update course.';
        res.redirect(`/admin/edit-course/${courseId}`);
    }
};

exports.deleteCourse = async (req, res) => {
    const courseId = req.params.id;
    try {
        await run('DELETE FROM Courses WHERE id = ?', [courseId]);
        req.session.success = 'Course deleted successfully.';
        res.redirect('/admin/manage-courses'); 
    } catch (err) {
        console.error(err);
        req.session.error = 'Failed to delete course.';
        res.redirect('/admin/manage-courses');
    }
};

// --- 5. MODULE MANAGEMENT ---

exports.getCourseDetailsAdmin = async (req, res) => {
    const courseId = req.params.courseId;
    try {
        const course = await get('SELECT * FROM Courses WHERE id = ?', [courseId]);
        if (!course) {
            return res.status(404).render('error', { title: 'Not Found', message: 'Course not found' });
        }
        
        const modules = await all('SELECT * FROM CourseModules WHERE course_id = ? ORDER BY module_order ASC', [courseId]);
        
        // NEW: Check for quizzes for each module to show status in UI
        for (let mod of modules) {
            const quiz = await get('SELECT id FROM Quizzes WHERE module_id = ?', [mod.id]);
            mod.hasQuiz = !!quiz;
            mod.quizId = quiz ? quiz.id : null;
        }
        
        res.render('admin/manage-modules', {
            title: `Manage: ${course.title}`,
            adminUser: req.session.user, 
            course: course,
            modules: modules,
            success: req.session.success,
            error: req.session.error
        });
        req.session.success = null;
        req.session.error = null;
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Database error.' });
    }
};

exports.getCreateModule = async (req, res) => {
    const courseId = req.params.courseId;
    try {
        const course = await get('SELECT title FROM Courses WHERE id = ?', [courseId]);
        if (!course) {
            req.session.error = 'Course not found!';
            return res.redirect('/admin/dashboard');
        }
        res.render('admin/create-module', { 
            title: `Create Module for ${course.title}`,
            adminUser: req.session.user, 
            courseTitle: course.title,
            courseId: courseId,
            error: req.session.error || null 
        });
        req.session.error = null;
    } catch (err) {
        console.error(err);
        res.status(500).render('error', { title: 'Error', message: 'Database error.' });
    }
};

exports.createModule = async (req, res) => {
    const courseId = req.params.courseId;
    const { title, description, module_number, video_url } = req.body;
    
    if (!title || !description || !module_number) {
        req.session.error = 'Title, Description, and Order are required.';
        return res.redirect(`/admin/course/${courseId}`);
    }

    try {
        await run(
            'INSERT INTO CourseModules (course_id, module_title, module_content, module_order, video_url) VALUES (?, ?, ?, ?, ?)',
            [courseId, title, description, module_number, video_url]
        );
        
        req.session.success = `Module "${title}" created successfully!`;
        res.redirect(`/admin/course/${courseId}`);
    } catch (err) {
        console.error(err);
        req.session.error = 'Failed to create module.';
        res.redirect(`/admin/course/${courseId}`);
    }
};

exports.deleteModule = async (req, res) => {
    const { courseId, moduleId } = req.params;
    try {
        await run('DELETE FROM CourseModules WHERE id = ?', [moduleId]);
        req.session.success = 'Module deleted successfully.';
        res.redirect(`/admin/course/${courseId}`);
    } catch (err) {
        console.error(err);
        req.session.error = 'Failed to delete module.';
        res.redirect(`/admin/course/${courseId}`);
    }
};

// --- 6. QUIZ MANAGEMENT ---

exports.getAddQuiz = async (req, res) => {
    const { moduleId } = req.params;
    try {
        const module = await get('SELECT * FROM CourseModules WHERE id = ?', [moduleId]);
        if (!module) {
            return res.status(404).send("Module not found");
        }
        
        // Check if quiz already exists to prevent duplicates
        const existingQuiz = await get('SELECT * FROM Quizzes WHERE module_id = ?', [moduleId]);

        res.render('admin/add_quiz', { 
            title: 'Add Quiz', 
            module,
            existingQuiz,
            adminUser: req.session.user,
            success: req.session.success,
            error: req.session.error
        });
        req.session.success = null;
        req.session.error = null;
    } catch (err) {
        res.status(500).send("Error loading quiz editor.");
    }
};

exports.postAddQuiz = async (req, res) => {
    const { moduleId } = req.params;
    const { quiz_title, questions } = req.body; 

    try {
        // 1. Create the Quiz Header
        const quizResult = await run(
            'INSERT INTO Quizzes (module_id, quiz_title) VALUES (?, ?)',
            [moduleId, quiz_title]
        );
        const quizId = quizResult.id;

        // 2. Insert the Questions (Matching the JSON blueprint)
        if (questions && Array.isArray(questions)) {
            for (const q of questions) {
                // Ensure options is an array before stringifying
                const optionsArray = Array.isArray(q.options) ? q.options : [q.opt1, q.opt2, q.opt3, q.opt4];
                const optionsJson = JSON.stringify(optionsArray);
                const correctIdx = parseInt(q.correct) || 0;
                
                await run(`
                    INSERT INTO Questions 
                    (quiz_id, question_text, options_json, correct_index) 
                    VALUES (?, ?, ?, ?)`,
                    [quizId, q.text, optionsJson, correctIdx]
                );
            }
        }

        req.session.success = "Quiz deployed successfully!";
        res.redirect(`/admin/course/${(await get('SELECT course_id FROM CourseModules WHERE id = ?', [moduleId])).course_id}`);
    } catch (err) {
        console.error("QUIZ_SAVE_ERROR:", err.message);
        req.session.error = "Failed to save quiz: " + err.message;
        res.redirect(`/admin/modules/${moduleId}/add-quiz`);
    }
};
// GET: Render the edit page
exports.getEditQuiz = async (req, res) => {
    const { quizId } = req.params;
    try {
        const quiz = await get('SELECT * FROM Quizzes WHERE id = ?', [quizId]);
        const questions = await all('SELECT * FROM Questions WHERE quiz_id = ?', [quizId]);

        const parsedQuestions = questions.map(q => ({
            ...q,
            options: JSON.parse(q.options_json || '[]')
        }));

        res.render('admin/edit-quiz', {
            title: 'Edit Mission',
            quiz,
            questions: parsedQuestions
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching quiz data.");
    }
};

// POST: Process the updates
exports.postEditQuiz = async (req, res) => {
    const { quizId } = req.params;
    const { quiz_title, questions } = req.body;

    try {
        // 1. Update Quiz Title
        await run('UPDATE Quizzes SET quiz_title = ? WHERE id = ?', [quiz_title, quizId]);

        // 2. Clear old questions (Simplest way to sync)
        await run('DELETE FROM Questions WHERE quiz_id = ?', [quizId]);

        // 3. Re-insert updated questions
        for (const q of questions) {
            const optionsJson = JSON.stringify(q.options);
            await run(
                'INSERT INTO Questions (quiz_id, question_text, options_json, correct_index) VALUES (?, ?, ?, ?)',
                [quizId, q.question_text, optionsJson, q.correct_index]
            );
        }

        res.redirect('/admin/dashboard?success=QuizUpdated');
    } catch (err) {
        console.error(err);
        res.status(500).send("Failed to update mission parameters.");
    }
};

// --- 7. ANALYTICS ---

exports.getAnalytics = (req, res) => {
    res.render('admin/analytics', {
        title: 'Site Analytics',
        adminUser: req.session.user,
    });
};