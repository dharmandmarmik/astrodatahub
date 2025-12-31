// src/middleware/authMiddleware.js

// Middleware to check if a user is logged in
exports.isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next(); // User is logged in, proceed
    } else {
        req.session.error = "You must be logged in to view this page.";
        res.redirect('/auth/login'); // Redirect to login
    }
};

// Middleware to check if the logged-in user is an Admin
exports.isAdmin = (req, res, next) => {
    // We rely on the global res.locals.user or req.session.user created in server.js
    if (req.session.user && req.session.user.role === 'admin') {
        next(); // User is an admin, proceed
    } else {
        // Log the user out and display an error, or just display an access error
        res.status(403).render('error', { 
            title: 'Access Denied', 
            message: 'Error 403: You do not have administrative privileges to access this area.' 
        });
    }
};

// Middleware to check if the user is *not* logged in (e.g., for login/register pages)
exports.isGuest = (req, res, next) => {
    if (!req.session.user) {
        next(); // User is not logged in, proceed
    } else {
        res.redirect('/'); // User is logged in, redirect away from auth pages
    }
};