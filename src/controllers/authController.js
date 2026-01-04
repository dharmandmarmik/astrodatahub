// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const axios = require('axios'); 
const { get, run } = require('../config/database');
const { sendOTP } = require('../config/mailer');

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

// 1. Render Login Page
exports.getLogin = (req, res) => {
    res.render('auth/login', { 
        title: 'Login | AstroDataHub',
        error: req.session.error || null,
        success: req.session.success || null
    });
    req.session.error = null;
    req.session.success = null;
};

// 2. Handle Registration
exports.register = async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const existing = await get('SELECT id FROM Users WHERE email = ? OR username = ?', [email, username]);
        if (existing) {
            return res.render('auth/register', { error: 'Username or Email already registered.', success: null });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = crypto.randomInt(100000, 999999).toString();
        const expires = new Date(Date.now() + 15 * 60000).toISOString();

        await run(
            'INSERT INTO Users (username, email, password_hash, role, country, otp_code, otp_expires, is_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [username, email, hashedPassword, 'user', null, otp, expires, 0]
        );

        await sendOTP(email, otp);
        req.session.verifyEmail = email;
        res.redirect('/auth/verify');

    } catch (error) {
        console.error("REGISTRATION_ERROR:", error);
        res.render('auth/register', { error: 'Server error during registration.', success: null });
    }
};

// 3. Consolidated Login
exports.consolidatedLogin = async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await get('SELECT * FROM Users WHERE username = ? OR email = ?', [username, username]);
        
        if (user) {
            const match = await bcrypt.compare(password, user.password_hash);
            if (match) {
                if (user.role === 'admin') {
                    req.session.user = { id: user.id, username: user.username, role: user.role };
                    return res.redirect('/admin/dashboard');
                }

                if (user.is_verified === 0) {
                    req.session.verifyEmail = user.email;
                    return res.render('auth/login', { error: 'Account not verified.', success: null });
                }

                req.session.user = { 
                    id: user.id, 
                    username: user.username, 
                    role: user.role,
                    country: user.country,
                    view_global_always: user.view_global_always
                };

                if (!user.country) {
                    return res.redirect('/auth/select-country');
                }

                return res.redirect('/');
            }
        }
    } catch (error) { console.error('Auth Error:', error); }
    res.render('auth/login', { error: 'Invalid Identity or Access Key.', success: null });
};

// 4. NEW: Render Country Selection Page
exports.getSelectCountry = (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    res.render('auth/select-country', { 
        title: 'Complete Your Profile',
        user: req.session.user 
    });
};

// 5. NEW: Handle Country Selection
exports.updateCountry = async (req, res) => {
    const { country } = req.body;
    if(!req.session.user) return res.redirect('/auth/login');
    const userId = req.session.user.id;

    try {
        await run('UPDATE Users SET country = ? WHERE id = ?', [country, userId]);
        req.session.user.country = country;
        req.session.success = `Profile updated! Showing courses for ${country}.`;
        res.redirect('/courses');
    } catch (err) {
        res.redirect('/auth/select-country');
    }
};

// 6. NEW: Toggle Global Courses
exports.toggleGlobalView = async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');

    const userId = req.session.user.id;
    const newVal = req.session.user.view_global_always === 1 ? 0 : 1;

    try {
        await run('UPDATE Users SET view_global_always = ? WHERE id = ?', [newVal, userId]);
        req.session.user.view_global_always = newVal;
        res.redirect('back');
    } catch (err) {
        res.status(500).send("Error updating preference.");
    }
};

// 7. Verify OTP
exports.verifyOTP = async (req, res) => {
    const { otp } = req.body;
    const email = req.session.verifyEmail;

    try {
        const user = await get('SELECT * FROM Users WHERE email = ?', [email]);
        if (user && user.otp_code === otp && new Date() < new Date(user.otp_expires)) {
            await run('UPDATE Users SET is_verified = 1, otp_code = NULL, otp_expires = NULL WHERE id = ?', [user.id]);
            
            req.session.user = { id: user.id, username: user.username, role: user.role, country: user.country };
            delete req.session.verifyEmail;
            
            if (!user.country) return res.redirect('/auth/select-country');
            res.redirect('/');
        } else {
            res.render('auth/verify', { error: 'Invalid code.', email, success: null });
        }
    } catch (err) { res.redirect('/auth/login'); }
};

// 8. ADDED: Resend OTP (Missing in your previous snippet)
exports.resendOTP = async (req, res) => {
    const email = req.session.verifyEmail;
    if (!email) return res.redirect('/auth/register');

    try {
        const otp = crypto.randomInt(100000, 999999).toString();
        const expires = new Date(Date.now() + 15 * 60000).toISOString();
        await run('UPDATE Users SET otp_code = ?, otp_expires = ? WHERE email = ?', [otp, expires, email]);
        await sendOTP(email, otp);
        res.render('auth/verify', { success: 'New code sent!', email, error: null });
    } catch (err) {
        res.render('auth/verify', { error: 'Failed to resend code.', email, success: null });
    }
};

// 9. Logout
exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid'); 
        res.redirect('/');
    });
};