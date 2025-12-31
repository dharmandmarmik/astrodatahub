// src/config/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// CRITICAL FIX: Use process.cwd() to ensure the DB is always in the project root
const dbPath = path.join(process.cwd(), 'astrodatahub.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('DATABASE_CONNECTION_ERROR:', err.message);
    } else {
        console.log('--- SYSTEM_READY: Connected to ' + dbPath + ' ---');
        db.serialize(() => {
            createTables();
            applySafeMigrations();
        });
    }
});

/**
 * Helper: Run SQL (INSERT, UPDATE, DELETE)
 */
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                console.error("DB_RUN_ERROR:", err.message);
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
}

/**
 * Helper: Get One Row
 */
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                console.error("DB_GET_ERROR:", err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

/**
 * Helper: Get All Rows
 */
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error("DB_ALL_ERROR:", err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

/**
 * Safe Migration Logic: Adds missing columns to existing databases
 */
function applySafeMigrations() {
    // 1. Check User Table columns
    db.all("PRAGMA table_info(Users)", (err, columns) => {
        if (err) return;
        const columnNames = columns.map(c => c.name);
        db.serialize(() => {
            if (!columnNames.includes('streak_count')) {
                db.run("ALTER TABLE Users ADD COLUMN streak_count INTEGER DEFAULT 0");
            }
            if (!columnNames.includes('last_activity_date')) {
                db.run("ALTER TABLE Users ADD COLUMN last_activity_date DATETIME DEFAULT '2025-01-01 00:00:00'");
            }
            if (!columnNames.includes('role')) {
                db.run("ALTER TABLE Users ADD COLUMN role TEXT DEFAULT 'user'");
            }
            if (!columnNames.includes('level')) {
                db.run("ALTER TABLE Users ADD COLUMN level INTEGER DEFAULT 1");
            }
            if (!columnNames.includes('xp')) {
                db.run("ALTER TABLE Users ADD COLUMN xp INTEGER DEFAULT 0");
            }
        });
    });

    // 2. Check Courses Table columns
    db.all("PRAGMA table_info(Courses)", (err, columns) => {
        if (err) return;
        const columnNames = columns.map(c => c.name);
        if (!columnNames.includes('standard')) {
            db.run("ALTER TABLE Courses ADD COLUMN standard TEXT");
        }
    });

    // 3. Migration for Questions Table (Handling dynamic options)
    db.all("PRAGMA table_info(Questions)", (err, columns) => {
        if (err) return;
        const columnNames = columns.map(c => c.name);
        db.serialize(() => {
            if (!columnNames.includes('options_json')) {
                db.run("ALTER TABLE Questions ADD COLUMN options_json TEXT");
                console.log("🛠️  Migration: Added options_json to Questions");
            }
            if (!columnNames.includes('correct_index')) {
                db.run("ALTER TABLE Questions ADD COLUMN correct_index INTEGER DEFAULT 0");
                console.log("🛠️  Migration: Added correct_index to Questions");
            }
        });
    });
}

/**
 * Initialize Tables (Main Blueprint)
 */
function createTables() {
    db.serialize(() => {
        // 1. Users Table
        db.run(`CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            level INTEGER DEFAULT 1,
            xp INTEGER DEFAULT 0,
            streak_count INTEGER DEFAULT 0,
            last_activity_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. Courses Table
        db.run(`CREATE TABLE IF NOT EXISTS Courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            subject TEXT,
            level TEXT,
            standard TEXT, 
            instructor_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 3. Modules Table
        db.run(`CREATE TABLE IF NOT EXISTS CourseModules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            module_title TEXT NOT NULL,
            module_content TEXT, 
            video_url TEXT,
            resources_json TEXT,
            module_order INTEGER NOT NULL, 
            FOREIGN KEY (course_id) REFERENCES Courses(id) ON DELETE CASCADE
        )`);

        // 4. Enrollments Table
        db.run(`CREATE TABLE IF NOT EXISTS Enrollments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            course_id INTEGER NOT NULL,
            status TEXT DEFAULT 'in-progress',
            enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, course_id), 
            FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES Courses(id) ON DELETE CASCADE
        )`);

        // 5. Completions Table
        db.run(`CREATE TABLE IF NOT EXISTS Completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            module_id INTEGER NOT NULL,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, module_id),
            FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
            FOREIGN KEY (module_id) REFERENCES CourseModules(id) ON DELETE CASCADE
        )`);

        // 6. Daily Briefing Table
        db.run(`CREATE TABLE IF NOT EXISTS DailyBriefing (
            id INTEGER PRIMARY KEY CHECK (id = 1), 
            content TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 7. Notifications Table
        db.run(`CREATE TABLE IF NOT EXISTS Notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT, 
            title TEXT NOT NULL,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
        )`);

        // 8. Quizzes Table
        db.run(`CREATE TABLE IF NOT EXISTS Quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            module_id INTEGER NOT NULL,
            quiz_title TEXT,
            FOREIGN KEY (module_id) REFERENCES CourseModules(id) ON DELETE CASCADE
        )`);

        // 9. Questions Table (UPDATED: Dynamic Options Support)
        db.run(`CREATE TABLE IF NOT EXISTS Questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    options_json TEXT NOT NULL, 
    correct_index INTEGER NOT NULL,
    FOREIGN KEY (quiz_id) REFERENCES Quizzes(id) ON DELETE CASCADE
)`);

        // --- SEED DATA ---
        const adminUsername = 'admin';
        get(`SELECT id FROM Users WHERE username = ?`, [adminUsername])
            .then(user => {
                if (!user) {
                    const passwordHash = bcrypt.hashSync('admin123', 10);
                    run(`INSERT INTO Users (username, email, password_hash, role, level, xp) VALUES (?, ?, ?, ?, ?, ?)`,
                        [adminUsername, 'admin@astrodatahub.com', passwordHash, 'admin', 99, 10000]
                    );
                    console.log("--- ADMIN_INITIALIZED ---");
                }
            });

        get(`SELECT id FROM DailyBriefing WHERE id = 1`)
            .then(fact => {
                if (!fact) {
                    run(`INSERT INTO DailyBriefing (id, content) VALUES (1, ?)`,
                        ["A day on Venus is longer than a year on Venus!"]
                    );
                }
            });
    });
}

module.exports = { run, get, all, db };