const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'twitchBotDB.sqlite');

let db;

function initializeDB(callback) {
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
            console.error('Error when connecting to the SQLite database', err.message);
            callback(err);
            return;
        }

        console.log('Connected to the SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS user_watchtime (
                username TEXT,
                channel TEXT,
                lastActive INTEGER,
                accumulatedTime INTEGER,
                PRIMARY KEY (username, channel)
            )`, (err) => {
            if (err) {
                console.error('Failed to create table', err.message);
                callback(err);
            } else {
                console.log('Users table ready');
                callback(null);
            }
        });
    });
}

function closeDb() {
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing the database:', err.message);
            } else {
                console.log('Database closed');
            }
        });
    }
}

module.exports = {
    initializeDB,
    closeDb,
    getDb: () => db  // Accessor for the db instance
};
