const { all, run } = require('../config/database');

exports.getNotifications = async (req, res) => {
    if (!req.session.user) return res.json([]);
    try {
        const notifications = await all(
            'SELECT * FROM Notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
            [req.session.user.id]
        );
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
};

// Global Helper to add notification (You can use this anywhere in your app)
exports.createNotif = async (userId, type, title, message) => {
    await run(
        'INSERT INTO Notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)',
        [userId, type, title, message]
    );
};