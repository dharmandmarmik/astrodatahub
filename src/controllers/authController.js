// src/controllers/authController.js
const bcrypt = require('bcryptjs'); 
const { get, run } = require('../config/database'); 

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
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await run(
            'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, 'user']
        );
        
        // TRIGGER: Welcome Transmission
        await sendNotification(result.id, 'welcome', 'Welcome to the Hub', `Welcome explorer ${username}! Your credentials have been authorized.`);

        req.session.success = 'Registration successful! Access granted.';
        res.redirect('/auth/login');
    } catch (error) {
        let errorMessage = 'Registration failed.';
        if (error.message && error.message.includes('UNIQUE constraint failed')) { 
             errorMessage = 'Identity already exists (Username/Email taken).';
        }
        res.render('auth/register', { error: errorMessage, success: null });
    }
};

// 3. Login Logic (Consolidated with Advanced Security Notifications)
exports.consolidatedLogin = async (req, res) => {
    const { username, password } = req.body;

    // Capture Security Details
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown IP';
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    
    // Simple device parsing (can be expanded)
    let device = "Desktop/Unknown";
    if (userAgent.includes('Mobi')) device = "Mobile Device";
    if (userAgent.includes('Tablet')) device = "Tablet";

    // Hardcoded Admin Bypass for safety
    if (username === 'admin' && password === 'admin123') {
        req.session.user = { id: 1, username: 'admin', role: 'admin' };
        await sendNotification(1, 'security', 'Root Access Detected', `Admin login authorized from IP: ${ip} on ${device}.`);
        return res.redirect('/admin/dashboard');
    }

    try {
        const user = await get('SELECT * FROM Users WHERE username = ?', [username]);
        if (user) {
            const match = await bcrypt.compare(password, user.password_hash);
            if (match) {
                req.session.user = { id: user.id, username: user.username, role: user.role };

                // TRIGGER: Detailed Security Notification
                const securityMsg = `New login detected.\nDevice: ${device}\nIP: ${ip}\nAgent: ${userAgent.substring(0, 50)}...`;
                await sendNotification(user.id, 'security', 'Security Alert: Login', securityMsg);

                return user.role === 'admin' ? res.redirect('/admin/dashboard') : res.redirect('/');
            }
        }
    } catch (error) {
        console.error('Auth Error:', error);
    }

    res.render('auth/login', { error: 'Invalid Identity or Access Key.', success: null });
};

// 4. Logout Logic
exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Session Destruction Error:", err);
            return res.redirect('/');
        }
        res.clearCookie('connect.sid'); 
        res.redirect('/');
    });
};