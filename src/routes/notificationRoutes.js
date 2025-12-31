// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const { all, run } = require('../config/database');

/**
 * GET /api/notifications
 * Fetches the latest 15 notifications for the logged-in user.
 * Supports both Passport (req.user) and Manual Sessions (req.session.user).
 */
router.get('/', async (req, res) => {
    const currentUser = req.user || req.session.user;

    if (!currentUser) {
        return res.json([]); 
    }

    try {
        const notifications = await all(
            'SELECT * FROM Notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 15',
            [currentUser.id]
        );
        res.json(notifications);
    } catch (err) {
        console.error("FETCH_NOTIF_ERROR:", err.message);
        res.status(500).json({ error: "Failed to fetch transmissions from the database." });
    }
});

/**
 * POST /api/notifications/mark-read
 * Marks all notifications as read (is_read = 1) for the current user.
 * Triggered when the user opens the notification dropdown.
 */
router.post('/mark-read', async (req, res) => {
    const currentUser = req.user || req.session.user;
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    try {
        await run('UPDATE Notifications SET is_read = 1 WHERE user_id = ?', [currentUser.id]);
        res.status(200).json({ success: true, message: "Signals acknowledged." });
    } catch (err) {
        console.error("MARK_READ_ERROR:", err.message);
        res.status(500).json({ error: "Failed to update notification status." });
    }
});

/**
 * DELETE /api/notifications/clear
 * Permanently removes all notifications for the current user.
 * Triggered by the "Clear All" button in the UI.
 */
router.delete('/clear', async (req, res) => {
    const currentUser = req.user || req.session.user;
    if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

    try {
        await run('DELETE FROM Notifications WHERE user_id = ?', [currentUser.id]);
        res.status(200).json({ success: true, message: "Communication logs cleared." });
    } catch (err) {
        console.error("CLEAR_NOTIF_ERROR:", err.message);
        res.status(500).json({ error: "Failed to clear transmissions." });
    }
});

module.exports = router;