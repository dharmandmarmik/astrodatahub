// repair.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(process.cwd(), 'astrodatahub.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    console.log("🛠️ Repairing Database...");
    
    // Add columns if they are missing
    db.run("ALTER TABLE Users ADD COLUMN streak_count INTEGER DEFAULT 0", (err) => {});
    db.run("ALTER TABLE Users ADD COLUMN last_activity_date TEXT", (err) => {});
    
    // Ensure existing users have a valid date string instead of being NULL
    db.run("UPDATE Users SET last_activity_date = DATETIME('now') WHERE last_activity_date IS NULL", (err) => {
        if (!err) console.log("✅ Database columns synchronized.");
    });
});