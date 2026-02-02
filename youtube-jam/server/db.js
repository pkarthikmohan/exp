const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
}

const readDB = () => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { users: {} };
    }
};

const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

module.exports = {
    getUser: (googleId) => {
        const db = readDB();
        return db.users[googleId];
    },
    saveUser: (googleId, profile) => {
        const db = readDB();
        // Merge existing data if any (preserve likes/playlists)
        const existing = db.users[googleId] || { likes: [], playlists: [] };
        db.users[googleId] = {
            ...existing,
            ...profile,
            likes: existing.likes,
            playlists: existing.playlists
        };
        writeDB(db);
        return db.users[googleId];
    },
    toggleLike: (googleId, videoObj) => {
        const db = readDB();
        const user = db.users[googleId];
        if (!user) return null;

        const exists = user.likes.find(v => v.id === videoObj.id);
        if (exists) {
            user.likes = user.likes.filter(v => v.id !== videoObj.id);
        } else {
            user.likes.unshift(videoObj);
        }
        writeDB(db);
        return user.likes;
    },
    getLikes: (googleId) => {
        const db = readDB();
        return db.users[googleId]?.likes || [];
    }
};
