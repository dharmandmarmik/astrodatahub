// src/middleware/checkCountry.js
module.exports = (req, res, next) => {
    if (req.session.user && !req.session.user.country && req.path !== '/onboarding/select-country') {
        return res.redirect('/onboarding/select-country');
    }
    next();
};