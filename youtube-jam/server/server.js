const fsPromises = require('fs').promises;
const path = require('path');
const DATA_FILE = path.join(__dirname, 'data.json');

// --- User Likes API ---

// 1. Save/Remove Like
app.post('/api/user/:googleId/likes', async (req, res) => {
    try {
        const { googleId } = req.params;
        const { video, action } = req.body;
        
        const fileContent = await fsPromises.readFile(DATA_FILE, 'utf-8');
        const db = JSON.parse(fileContent);
        
        if (!db.users[googleId]) {
            return res.status(404).json({ error: "User not synced" });
        }

        let userLikes = db.users[googleId].likes || [];
        
        if (action === 'remove') {
            userLikes = userLikes.filter(v => v.id !== video.id);
        } else {
            // Add only if not already present
            if (!userLikes.some(v => v.id === video.id)) {
                userLikes.push({
                    id: video.id,
                    title: video.title,
                    thumb: video.thumb
                });
            }
        }
        
        db.users[googleId].likes = userLikes;
        
        await fsPromises.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
        res.json(userLikes);
    } catch (e) {
        console.error("Error saving likes:", e);
        res.status(500).json({ error: "Server Error" });
    }
});

// 2. Get Likes
app.get('/api/user/:googleId/likes', async (req, res) => {
    try {
        const { googleId } = req.params;
        const fileContent = await fsPromises.readFile(DATA_FILE, 'utf-8');
        const db = JSON.parse(fileContent);
        
        const likes = db.users[googleId]?.likes || [];
        res.json(likes);
    } catch (e) {
        console.error("Error fetching likes:", e);
        res.status(500).json({ error: "Server Error" });
    }
});