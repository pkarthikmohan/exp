const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const YouTube = require('youtube-sr').default;
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// --- Authentication & User Data ---

// Login/Sync User
app.post('/api/auth', (req, res) => {
    const { googleId, name, email, picture } = req.body;
    if (!googleId) return res.status(400).json({ error: "Missing googleId" });
    
    // Save or Update user info
    const user = db.saveUser(googleId, { name, email, picture });
    res.json(user);
});

// Get Likes
app.get('/api/user/:id/likes', (req, res) => {
    const { id } = req.params;
    const likes = db.getLikes(id);
    res.json(likes);
});

// Toggle Like
app.post('/api/user/:id/likes', (req, res) => {
    const { id } = req.params;
    const { video } = req.body; // { id, title, thumb }
    if (!video || !video.id) return res.status(400).json({ error: "Invalid video data" });

    const updatedLikes = db.toggleLike(id, video);
    if (!updatedLikes) return res.status(404).json({ error: "User not found" });
    
    res.json(updatedLikes);
});
// ---------------------------------

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const YOUTUBE_API_KEY = "AIzaSyAEVqWlEuPs5j5h8TjVG8X8BK4YOgD5e6E";
const rooms = {}; 

// Search Endpoint
app.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        console.log('Search request for:', q);
        
        let results = [];
        try {
            const isUrl = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/.test(q);
            if (isUrl) {
                const video = await YouTube.getVideo(q);
                if (video) {
                    results = [{
                        id: video.id,
                        title: video.title,
                        thumb: video.thumbnail?.url || ''
                    }];
                }
            } else {
                const videos = await YouTube.search(q, { limit: 12, type: 'video' });
                results = videos.map(item => ({
                    id: item.id,
                    title: item.title,
                    thumb: item.thumbnail?.url || ''
                }));
            }
            console.log('Search results:', results.length);
        } catch (apiError) {
            console.error('YouTube Search Error:', apiError.message);
            // Minimal Fallback just in case
            results = [
               { id: 'jfKfPfyJRdk', title: 'lofi hip hop radio - beats to relax/study to', thumb: 'https://img.youtube.com/vi/jfKfPfyJRdk/mqdefault.jpg' }
            ];
        }
        
        res.json(results);
    } catch (err) {
        console.error('Search handler error:', err.message);
        res.status(500).json({ error: "Search failed", details: err.message });
    }
});

const fetchAndEmitRelated = async (videoId, socket) => {
    if (!videoId) return;
    try {
        console.log('Fetching related for:', videoId);
        
        // 1. Get stats/title/channel
        const videoResults = await YouTube.search(videoId, { limit: 1, type: 'video' });
        const sourceVideo = videoResults[0];
        
        if (!sourceVideo) throw new Error("Video not found");

        const title = sourceVideo.title;
        const channelName = sourceVideo.channel?.name || '';
        
        // 2. Intelligent Discovery Strategy
        // We want to avoid "Same Song (Remix)" or "Same Song (Live)"
        // We want "Songs with similar vibe"
        
        // Clean title: remove "Official Video", "Lyrics", content in brackets often helps
        // e.g. "Coldplay - Viva La Vida (Official Video)" -> just "Viva La Vida"
        const cleanTitle = title
            .replace(/[\(\[\{].*?[\)\]\}]/g, '') // remove brackets
            .replace(/official|video|audio|lyrics|hq|hd|mv/gi, '') // remove keywords
            .replace(/[^\w\s]/gi, '') // remove special chars
            .trim();

        console.log(`Analyzing vibe for: "${cleanTitle}" by ${channelName}`);
        
        const queries = [
            `songs similar to ${cleanTitle} ${channelName}`, // Semantic search
            `${channelName} radio`, // Artist radio
            `best songs like ${cleanTitle}` // Vibe matching
        ];
        
        // Pick one query strategy randomly to vary results or run parallel? 
        // Let's run a strong semantic search first.
        let query = queries[0];
        console.log('Searching related with query:', query);
        
        let videos = await YouTube.search(query, { limit: 35, type: 'video' });
        
        const results = videos
            .filter(v => v.id !== videoId)
            // FILTER: Remove songs that sound too much like the original title (covers, remixes)
            .filter(v => {
                const resTitle = v.title.toLowerCase();
                const originalWords = cleanTitle.toLowerCase().split(' ').filter(w => w.length > 3);
                
                // If the result contains ALL the significant words of original title, it's likely a version of it.
                // We want to BLOCK it unless it's a completely different artist (which is hard to know for sure in simple search)
                const matchCount = originalWords.filter(word => resTitle.includes(word)).length;
                const isSameSong = matchCount >= Math.max(1, originalWords.length - 1); 
                
                return !isSameSong;
            })
            .slice(0, 25)
            .map(item => ({
                id: item.id,
                title: item.title,
                thumb: item.thumbnail?.url || `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`
            }));
            
        // Fallback: If strict filtering killed everything, just show artist's other top songs
        if (results.length < 5 && channelName) {
            console.log('Fallback to artist top songs...');
            const artistMix = await YouTube.search(`${channelName} top songs`, { limit: 20, type: 'video' });
             const artistResults = artistMix
                .filter(v => v.id !== videoId && !results.find(r => r.id === v.id))
                .map(item => ({
                    id: item.id,
                    title: item.title,
                    thumb: item.thumbnail?.url || `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`
                }));
             results.push(...artistResults);
        }
        
        console.log('Found related videos:', results.length);
        socket.emit('related-videos', results);
    } catch (e) {
        console.error('Error fetching related:', e.message);
        socket.emit('related-videos', []);
    }
};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('get-related', async (arg) => {
        try {
            // Handle both string and object inputs
            const videoId = typeof arg === 'object' ? arg.videoId : arg;
            if (!videoId) return;

            const video = await YouTube.getVideo(videoId);
            let results = [];

             // Helper to filter out non-music content
            const isMusicOnly = (v) => {
                const t = v.title.toLowerCase();
                // Block Explicit Non-Music Types
                const blockList = [
                    'tutorial', 'how to', 'lesson', 'course', 'review', 'reaction', 'gameplay', 
                    'walkthrough', 'unboxing', 'coding', 'programming', 'setup', 'install', 
                    'explained', 'lecture', 'news', 'update', 'trailer', 'vlog'
                ];
                if (blockList.some(k => t.includes(k))) return false;
                return true;
            };
            
            if (video && video.related && video.related.length > 0) {
                 results = video.related
                    .filter(isMusicOnly)
                    .map(v => ({
                        id: v.id,
                        title: v.title,
                        thumb: v.thumbnail?.url || `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`,
                        duration: v.durationFormatted,
                        channel: v.channel?.name
                    }));
            } 
            
            // Fallback if related is empty or not enough
            if (results.length < 5) {
                const videoResults = await YouTube.search(videoId, { limit: 1, type: 'video' });
                const sourceVideo = videoResults[0];
                if(sourceVideo) {
                    // Force "song" keyword in query to bias towards music
                    const query = `songs similar to ${sourceVideo.title.replace(/\(.*\)|official video|lyrics/gi, '')}`;
                    const videos = await YouTube.search(query, { limit: 30, type: 'video' });
                    const searched = videos
                        .filter(isMusicOnly)
                        .map(v => ({
                            id: v.id,
                            title: v.title,
                            thumb: v.thumbnail?.url, 
                            duration: v.durationFormatted,
                            channel: v.channel?.name
                        }));
                    results = [...results, ...searched].slice(0, 25);
                }
            }
            
            socket.emit('related-videos-result', results);
        } catch(e) { console.error(e); }
    });

    socket.on('reorder-queue', ({ roomId, newQueue }) => {
        if(rooms[roomId]) {
            rooms[roomId].queue = newQueue;
            io.to(roomId).emit('update-queue', newQueue);
        }
    });



    socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                queue: [], 
                history: [],
                messages: [],
                forwardHistory: [],
                currentVideoId: null,
                isPlaying: false,
                videoTime: 0,
                lastUpdate: Date.now()
            };
        }

        // Get actual count of users in this room
        const userCount = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        console.log(`${username} joined room ${roomId}. Count: ${userCount}`);
        
        io.to(roomId).emit('room-update', { 
            userCount, 
            message: `${username} joined the jam!` 
        });

        // Construct a sync payload with adjusted time so client doesn't need server clock
        const room = rooms[roomId];
        let syncPacket = { ...room };
        
        if (room.isPlaying) {
             const now = Date.now();
             const elapsed = (now - room.lastUpdate) / 1000;
             syncPacket.videoTime = (room.videoTime || 0) + elapsed;
             // We don't change lastUpdate here because the client should overwrite it 
             // with its local reception time to establish a valid anchor.
        }

        socket.emit('sync-state', syncPacket);
        
        // Initial suggestions
        fetchAndEmitRelated(rooms[roomId].currentVideoId, socket);
    });

    socket.on('video-action', ({ roomId, type, value }) => {
        const room = rooms[roomId];
        if (!room) return;

        console.log(`Action in ${roomId}: ${type} at ${value} by ${socket.username}`);

        // "Most Forward" Protection Logic
        if (type === 'play' && room.isPlaying) {
             const offset = (Date.now() - room.lastUpdate) / 1000;
             const serverTime = room.videoTime + offset;
             
             if (serverTime - value > 2.0) {
                 console.log(`IGNORED lagging play from ${socket.username}. Server: ${serverTime.toFixed(1)}s, Client: ${value.toFixed(1)}s`);
                 socket.emit('sync-state', room);
                 return; 
             }
        }

        // Leader Sync: If a client reports they are ahead of the server model, we accept it.
        // This lets the "Fastest Loader" drive the session forward.
        if (type === 'time-update') {
             if (room.isPlaying) {
                 const offset = (Date.now() - room.lastUpdate) / 1000;
                 const serverEstimatedTime = room.videoTime + offset;
                 
                 // If client is ahead by > 1.0s, update server to match (drag forward)
                 // BUT: If they are WAY ahead (> 4.0s), they likely missed a Seek-Back event.
                 // In that case, we REJECT their update and force them to sync.
                 if (value > serverEstimatedTime + 1.0) {
                     
                     if (value > serverEstimatedTime + 6.0) {
                          console.log(`Rejecting rogue future time-update from ${socket.username} (Value: ${value.toFixed(1)}, Server: ${serverEstimatedTime.toFixed(1)})`);
                          socket.emit('sync-state', room);
                          return;
                     }

                     // Update server state for small forward drifts (1-6s) usually caused by buffering catchups
                     rooms[roomId].videoTime = value;
                     rooms[roomId].lastUpdate = Date.now();
                     
                     // Broadcast silent update to everyone else so they realize they are behind
                     socket.to(roomId).emit('video-action', { type: 'time-update', value });
                     return; 
                 } else {
                     // Client is behind or on time.
                     return;
                 }
             } else {
                 // Room is paused, but client is sending time updates (rogue play state)
                 // Force them to stop.
                 console.log(`Client ${socket.username} sent time-update while room paused. Enforcing sync.`);
                 socket.emit('sync-state', room);
                 return;
             }
        }

        rooms[roomId].lastUpdate = Date.now();
        if (type === 'play') {
            rooms[roomId].isPlaying = true;
            rooms[roomId].videoTime = value;
        } else if (type === 'pause') {
            rooms[roomId].isPlaying = false;
            rooms[roomId].videoTime = value;
        } else if (type === 'seek') {
            rooms[roomId].videoTime = value;
        }
        
        socket.to(roomId).emit('video-action', { type, value });
    });

    socket.on('change-video', ({ roomId, videoId }) => {
        console.log(`Change video in ${roomId} to ${videoId}`);
        if (!rooms[roomId]) return;
        
        if (!rooms[roomId].history) rooms[roomId].history = [];
        rooms[roomId].history.push(rooms[roomId].currentVideoId);
        
        // Clear forward history because we started a new path
        rooms[roomId].forwardHistory = [];

        rooms[roomId].currentVideoId = videoId;
        rooms[roomId].videoTime = 0;
        rooms[roomId].isPlaying = true;
        rooms[roomId].lastUpdate = Date.now();
        
        // Broadcast full state update to ensure sync reset
        io.to(roomId).emit('sync-state', rooms[roomId]);
        // Also emit specific change event for UI reactions
        io.to(roomId).emit('change-video', videoId);
        
        // Trigger recommendations update for everyone in room
        // We'll let the client ask for it, or we could broadcast it here if we want to be proactive
    });

    socket.on('get-related', async ({ videoId }) => {
        fetchAndEmitRelated(videoId, socket);
    });

    socket.on('play-next', ({ roomId }) => {
        console.log(`Play next requested in ${roomId}`);
        const room = rooms[roomId];
        if (!room) return;

        // Check Forward History first (User hit "Back" previously)
        if (room.forwardHistory && room.forwardHistory.length > 0) {
            const nextId = room.forwardHistory.pop();

            if (!room.history) room.history = [];
            room.history.push(room.currentVideoId);
            
            room.currentVideoId = nextId;
            room.videoTime = 0;
            room.isPlaying = true;
            room.lastUpdate = Date.now();
            
            io.to(roomId).emit('sync-state', room);
            io.to(roomId).emit('change-video', nextId);
        
        } else if (room.queue.length > 0) {
            // Play queue
            const nextVideo = room.queue.shift();

            if (!room.history) room.history = [];
            room.history.push(room.currentVideoId);

            room.currentVideoId = nextVideo.id;
            room.videoTime = 0;
            room.isPlaying = true;
            room.lastUpdate = Date.now();
            
            io.to(roomId).emit('sync-state', room);
            io.to(roomId).emit('change-video', nextVideo.id);
        } else {
            socket.emit('queue-empty');
        }
    });

    socket.on('play-previous', ({ roomId }) => {
        console.log(`Play previous requested in ${roomId}`);
        const room = rooms[roomId];
        if (!room) return;

        if (room.history && room.history.length > 0) {
            const prevId = room.history.pop();
            
            // Save current state to forward history so "Next" goes back to it
            if (!room.forwardHistory) room.forwardHistory = [];
            room.forwardHistory.push(room.currentVideoId);
            
            room.currentVideoId = prevId;
            room.videoTime = 0;
            room.isPlaying = true;
            room.lastUpdate = Date.now();
            
            io.to(roomId).emit('sync-state', room);
            io.to(roomId).emit('change-video', prevId);
        }
    });

    socket.on('remove-from-queue', ({ roomId, index }) => {
        if (rooms[roomId] && rooms[roomId].queue) {
            rooms[roomId].queue.splice(index, 1);
            io.to(roomId).emit('update-queue', rooms[roomId].queue);
        }
    });

    socket.on('add-to-queue', ({ roomId, video }) => {
        if (!rooms[roomId]) {
             rooms[roomId] = { 
                queue: [], 
                history: [],
                messages: [],
                forwardHistory: [],
                currentVideoId: null,
                isPlaying: false,
                videoTime: 0,
                lastUpdate: Date.now()
            };
        }
        if (!rooms[roomId].queue) rooms[roomId].queue = [];
        rooms[roomId].queue.push(video);
        io.to(roomId).emit('update-queue', rooms[roomId].queue);
    });

    socket.on('send-message', ({ roomId, message, user }) => {
        const msgObj = { user, message, id: Date.now() };
        
        // Store message in room history (limit to last 50)
        if (rooms[roomId]) {
            if (!rooms[roomId].messages) rooms[roomId].messages = [];
            rooms[roomId].messages.push(msgObj);
            if (rooms[roomId].messages.length > 50) {
                rooms[roomId].messages.shift();
            }
        }
        
        io.to(roomId).emit('receive-message', msgObj);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (socket.roomId) {
            const count = io.sockets.adapter.rooms.get(socket.roomId)?.size || 0;
            console.log(`Room ${socket.roomId} now has ${count} users`);
            io.to(socket.roomId).emit('room-update', { userCount: count });
        }
    });
});

// Serve static files from the React client
app.use(express.static(path.join(__dirname, '../client/dist')));

// Handle React routing, return all requests to React app
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
