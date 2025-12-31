// src/config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { get, run } = require('./database');

// Serialization: Determines which data of the user object should be stored in the session.
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialization: Uses the stored ID to find the user in the database.
passport.deserializeUser(async (id, done) => {
    try {
        const user = await get('SELECT * FROM Users WHERE id = ?', [id]);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Google Strategy Configuration
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:4000/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        
        // 1. Check if user already exists in SQLite
        let user = await get('SELECT * FROM Users WHERE email = ?', [email]);

        if (!user) {
            // 2. If user doesn't exist, create a new record
            // We generate a clean username from their Google Display Name
            const baseUsername = profile.displayName.split(' ')[0].toLowerCase();
            const username = baseUsername + Math.floor(Math.random() * 1000);
            
            /**
             * FIX FOR SQLITE_CONSTRAINT:
             * Since your DB requires password_hash to be NOT NULL, we provide a 
             * complex placeholder. The user will login via Google, so they 
             * don't need to know this password.
             */
            const placeholderHash = 'OAUTH_GOOGLE_' + Math.random().toString(36).substring(7);

            await run(
                'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
                [username, email, placeholderHash, 'user']
            );

            // 3. Retrieve the newly created user to return to Passport
            user = await get('SELECT * FROM Users WHERE email = ?', [email]);
        }

        return done(null, user);
    } catch (err) {
        console.error("FATAL_PASSPORT_OAUTH_ERROR:", err);
        return done(err, null);
    }
  }
));

module.exports = passport;