// src/controllers/userController.js
const { run, all, get } = require('../config/database'); 
const bcrypt = require('bcryptjs');

/**
 * HELPER: Send Internal Notification (Transmission)
 * This saves an alert to the database for the user to see in their navbar bell.
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

// --- 1. RENDER DASHBOARD (GUESTS SEE EXPLORER / USERS SEE DASHBOARD) ---
exports.getDashboard = async (req, res) => {
    try {
        const briefingResult = await get('SELECT content FROM DailyBriefing WHERE id = 1');
        const todaysFact = briefingResult ? briefingResult.content : "The universe is full of mysteries!";

        if (!req.session || !req.session.user) {
            return res.render('explorer', { title: 'Explore', user: null, todaysFact });
        }

        const userId = req.session.user.id;

        // 1. Fetch User Data with defaults
        const userData = await get('SELECT streak_count, last_activity_date FROM Users WHERE id = ?', [userId]);
        
        // --- STREAK CALCULATION (Robust Version) ---
        let currentStreak = 0;
        if (userData) {
            currentStreak = userData.streak_count || 0;
            
            // Use current time if last_activity_date is missing in DB
            const lastActivityStr = userData.last_activity_date || new Date().toISOString();
            const lastActivity = new Date(lastActivityStr);
            
            const today = new Date();
            today.setHours(0,0,0,0);
            
            const lastDay = new Date(lastActivity);
            lastDay.setHours(0,0,0,0);

            // Calculate difference in days
            const diffTime = today.getTime() - lastDay.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 1) {
                currentStreak = 0; // Reset if they missed a day
                await run('UPDATE Users SET streak_count = 0 WHERE id = ?', [userId]);
            }
        }

        // 2. Fetch Progress Stats
        const statsResult = await get(`
            SELECT 
                (SELECT COUNT(*) FROM Enrollments WHERE user_id = ?) as inProgress,
                (SELECT COUNT(*) FROM Completions WHERE user_id = ?) as completed
        `, [userId, userId]);

        // 3. Fetch Enrolled Courses
        const enrolledCourses = await all(`
            SELECT c.id, c.title, c.subject, c.level,
            (SELECT COUNT(*) FROM CourseModules WHERE course_id = c.id) as total_modules,
            (SELECT COUNT(*) FROM Completions comp 
             JOIN CourseModules mod ON comp.module_id = mod.id 
             WHERE mod.course_id = c.id AND comp.user_id = ?) as completed_modules
            FROM Enrollments e
            JOIN Courses c ON e.course_id = c.id
            WHERE e.user_id = ?
            ORDER BY e.enrolled_at DESC
        `, [userId, userId]);

        const coursesWithProgress = enrolledCourses.map(course => ({
            ...course,
            progress: course.total_modules > 0 ? Math.round((course.completed_modules / course.total_modules) * 100) : 0
        }));

        // Render Dashboard
        res.render('dashboard', {
            user: req.session.user,
            stats: {
                inProgress: statsResult ? (statsResult.inProgress || 0) : 0,
                completed: statsResult ? (statsResult.completed || 0) : 0,
                streak: currentStreak
            },
            enrolledCourses: coursesWithProgress,
            todaysFact
        });

    } catch (err) {
        // Detailed logging to help you find the exact line causing the crash
        console.error("❌ CRITICAL_DASHBOARD_CRASH:", err);
        res.status(500).render('error', { 
            title: 'System Error', 
            message: `Engine failure: ${err.message}` 
        });
    }
};

// --- 2. RENDER PRIVATE SETTINGS ---
exports.getSettings = async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    
    try {
        const userId = req.session.user.id;

        const enrolledCourses = await all(`
            SELECT 
                c.id, 
                c.title, 
                c.subject, 
                c.level,
                (SELECT COUNT(*) FROM CourseModules WHERE course_id = c.id) as total_modules,
                (SELECT COUNT(*) FROM Completions comp 
                 JOIN CourseModules mod ON comp.module_id = mod.id 
                 WHERE mod.course_id = c.id AND comp.user_id = ?) as completed_modules
            FROM Enrollments e
            JOIN Courses c ON e.course_id = c.id
            WHERE e.user_id = ?
        `, [userId, userId]);

        const myCourses = enrolledCourses.map(course => {
            const percent = course.total_modules > 0 
                ? Math.round((course.completed_modules / course.total_modules) * 100) 
                : 0;
            return { 
                ...course, 
                progress: percent, 
                isCompleted: percent === 100 
            };
        });

        res.render('user/settings', {
            title: 'Account Settings',
            user: req.session.user,
            myCourses: myCourses,
            error: req.query.error || null,
            success: req.query.success || null
        });

    } catch (error) {
        console.error('Error fetching settings data:', error);
        res.render('user/settings', {
            title: 'Account Settings',
            user: req.session.user,
            myCourses: [],
            error: 'Failed to load your progress data.',
            success: null
        });
    }
};

// --- 3. HANDLE PROFILE DETAIL UPDATE ---
exports.updateProfile = async (req, res) => {
    const userId = req.session.user.id;
    const { username, email } = req.body;

    if (!username || !email) {
        return res.redirect('/user/settings?error=Username and Email cannot be empty.');
    }

    try {
        const existingUser = await get(
            'SELECT id FROM Users WHERE (username = ? OR email = ?) AND id != ?', 
            [username, email, userId]
        );

        if (existingUser) {
            return res.redirect('/user/settings?error=Username or Email is already in use.');
        }

        await run(
            'UPDATE Users SET username = ?, email = ? WHERE id = ?',
            [username, email, userId]
        );

        // TRIGGER NOTIFICATION
        await sendNotification(userId, 'security', 'Profile Updated', `Your account details were updated. New Username: ${username}`);

        req.session.user.username = username;
        req.session.user.email = email;
        
        res.redirect('/user/settings?success=Your profile details have been updated successfully!');

    } catch (error) {
        console.error('Error updating profile:', error);
        res.redirect('/user/settings?error=Database error occurred.');
    }
};

// --- 4. HANDLE PASSWORD UPDATE ---
exports.updatePassword = async (req, res) => {
    const userId = req.session.user.id;
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password) {
        return res.redirect('/user/settings?error=All password fields are required.');
    }

    if (new_password.length < 6) {
        return res.redirect('/user/settings?error=New password must be at least 6 characters.');
    }

    if (new_password !== confirm_password) {
        return res.redirect('/user/settings?error=Passwords do not match.');
    }

    try {
        const user = await get('SELECT password_hash FROM Users WHERE id = ?', [userId]);
        const isMatch = await bcrypt.compare(current_password, user.password_hash);

        if (!isMatch) {
            return res.redirect('/user/settings?error=Current password is incorrect.');
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await run('UPDATE Users SET password_hash = ? WHERE id = ?', [hashedPassword, userId]);

        // TRIGGER NOTIFICATION
        await sendNotification(userId, 'security', 'Security Protocol Change', 'Your account password has been changed successfully.');

        res.redirect('/user/settings?success=Your password has been changed successfully!');

    } catch (error) {
        console.error('Error updating password:', error);
        res.redirect('/user/settings?error=Database error occurred.');
    }
};

// --- 5. RENDER FAQ ---
exports.getFAQ = (req, res) => {
    res.render('faq', { 
        title: 'Frequently Asked Questions', 
        user: req.session.user || null 
    });
};

// --- 6. PUBLIC PROFILE LOGIC ---
exports.getPublicProfile = async (req, res) => {
    const { username } = req.params;
    
    try {
        const profileUser = await get(
            'SELECT * FROM Users WHERE username = ?', 
            [username]
        );

        if (!profileUser) {
            return res.status(404).render('error', { 
                title: 'Not Found', 
                message: 'Explorer not found in this sector.',
                user: req.session.user || null 
            });
        }

        profileUser.role = profileUser.role || 'Mission Specialist';
        profileUser.level = profileUser.level || 1;
        profileUser.xp = profileUser.xp || 0;
        profileUser.created_at = profileUser.created_at || new Date();

        const badges = await all(`
            SELECT c.title, c.subject 
            FROM Enrollments e
            JOIN Courses c ON e.course_id = c.id
            WHERE e.user_id = ? AND e.status = 'completed'`, 
            [profileUser.id]
        );

        res.render('user/profile', {
            title: `${profileUser.username}'s Comm-Link`,
            profileUser,
            badges: badges || [],
            user: req.session.user || null 
        });

    } catch (err) {
        console.error("❌ PROFILE_RENDER_CRASH:", err.message);
        res.status(500).render('error', { 
            title: 'System Error', 
            message: `Engine failure: ${err.message}`,
            user: req.session.user || null 
        });
    }
};

/**
 * NEW: RENDER MODULE WITH QUIZ
 * This displays the module content and any attached quiz.
 */
exports.getModule = async (req, res) => {
    const { moduleId } = req.params;
    try {
        const module = await get('SELECT * FROM CourseModules WHERE id = ?', [moduleId]);
        if (!module) return res.status(404).render('error', { title: 'Not Found', message: 'Module not found.' });

        // Fetch Quiz linked to this module
        const quiz = await get('SELECT * FROM Quizzes WHERE module_id = ?', [moduleId]);
        let questions = [];
        
        if (quiz) {
            questions = await all('SELECT * FROM Questions WHERE quiz_id = ?', [quiz.id]);
        }

        res.render('user/module_view', {
            title: module.module_title,
            module,
            quiz,
            questions,
            user: req.session.user
        });
    } catch (err) {
        console.error("MODULE_FETCH_ERROR:", err);
        res.status(500).send("Error loading module content.");
    }
};

async function updateStreak(userId) {
    const user = await get('SELECT streak_count, last_activity_date FROM Users WHERE id = ?', [userId]);
    const now = new Date();
    const lastDate = user.last_activity_date ? new Date(user.last_activity_date) : null;
    
    if (!lastDate) {
        await run('UPDATE Users SET streak_count = 1, last_activity_date = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
        return;
    }

    const diffTime = Math.abs(now - lastDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
        await run('UPDATE Users SET streak_count = streak_count + 1, last_activity_date = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
    } else if (diffDays > 1) {
        await run('UPDATE Users SET streak_count = 1, last_activity_date = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
    } else {
        await run('UPDATE Users SET last_activity_date = CURRENT_TIMESTAMP WHERE id = ?', [userId]);
    }
}

// --- 7. QUIZ SUBMISSION LOGIC ---
// --- Inside your submitQuiz function in userController.js ---

exports.submitQuiz = async (req, res) => {
    const { moduleId } = req.params;
    const userId = req.session.user.id;

    try {
        // 1. Mark module as completed
        await run('INSERT OR IGNORE INTO Completions (user_id, module_id) VALUES (?, ?)', [userId, moduleId]);
        
        // 2. Update Streak
        await updateStreak(userId);

        // 3. Award XP & Recalculate Level in Database
        await run(`
            UPDATE Users SET 
                xp = xp + 100, 
                level = ((xp + 100) / 1000) + 1 
            WHERE id = ?`, 
        [userId]);

        // --- CRITICAL ADDITION: SYNC THE SESSION ---
        // This ensures the EJS templates see the new XP immediately
        if (req.session.user) {
            req.session.user.xp += 100;
            // Matches your level logic: Every 1000 XP is a level
            req.session.user.level = Math.floor(req.session.user.xp / 1000) + 1;
        }
        // ------------------------------------------

        // 4. Badge Logic (Existing code...)
        const moduleData = await get('SELECT course_id FROM CourseModules WHERE id = ?', [moduleId]);
        const courseId = moduleData.course_id;

        const progress = await get(`
            SELECT 
                (SELECT COUNT(*) FROM CourseModules WHERE course_id = ?) as total_mods,
                (SELECT COUNT(*) FROM Completions c 
                 JOIN CourseModules m ON c.module_id = m.id 
                 WHERE m.course_id = ? AND c.user_id = ?) as completed_mods
        `, [courseId, courseId, userId]);

        if (progress.total_mods > 0 && progress.total_mods === progress.completed_mods) {
            await run(
                'UPDATE Enrollments SET status = "completed" WHERE user_id = ? AND course_id = ?',
                [userId, courseId]
            );
            await sendNotification(userId, 'achievement', 'Mastery Badge Unlocked!', 'Visit your profile to see your new badge.');
        }

        res.json({ 
            success: true, 
            message: "Mission success!",
            newXp: req.session.user.xp, // Send back the updated value
            newLevel: req.session.user.level
        });

    } catch (err) {
        console.error("QUIZ_SUBMIT_ERROR:", err);
        res.status(500).json({ success: false, message: "Transmission failed." });
    }
};