const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const YouTube = require('youtube-sr').default;

const app = express();
app.use(cors());
app.use(express.json());
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
            const videos = await YouTube.search(q, { limit: 12, type: 'video' });
            results = videos.map(item => ({
                id: item.id,
                title: item.title,
                thumb: item.thumbnail?.url || ''
            }));
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
    try {
        console.log('Fetching related for:', videoId);
        
        // 1. Get stats/title
        const videoResults = await YouTube.search(videoId, { limit: 1, type: 'video' });
        const title = videoResults[0]?.title;
        
        if (!title) throw new Error("Video not found");

        // 2. Improved Fallback: Search for a mix/playlist of similar style
        // "Mix" keyword usually forces YouTube to return a generated playlist or compilation
        const query = `mix related to ${title}`;
        console.log('Searching related with query:', query);
        
        let videos = await YouTube.search(query, { limit: 12, type: 'video' });
        
        // If that returns nothing, try generic
        if (videos.length < 2) {
             videos = await YouTube.search(`${title} similar songs`, { limit: 12, type: 'video' });
        }

        const results = videos
            .filter(v => v.id !== videoId)
            .map(item => ({
                id: item.id,
                title: item.title,
                thumb: item.thumbnail?.url || `https://img.youtube.com/vi/${item.id}/mqdefault.jpg`
            }));
        
        console.log('Found related videos:', results.length);
        socket.emit('related-videos', results);
    } catch (e) {
        console.error('Error fetching related:', e.message);
        // Fallback
        socket.emit('related-videos', []);
    }
};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ roomId, username }) => {
        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                queue: [], 
                currentVideoId: 'dQw4w9WgXcQ',
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

        socket.emit('sync-state', rooms[roomId]);
        
        // Initial suggestions
        fetchAndEmitRelated(rooms[roomId].currentVideoId, socket);
    });

    socket.on('video-action', ({ roomId, type, value }) => {
        console.log(`Action in ${roomId}: ${type} at ${value}`);
        if (rooms[roomId]) {
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
        }
        socket.to(roomId).emit('video-action', { type, value });
    });

    socket.on('change-video', ({ roomId, videoId }) => {
        console.log(`Change video in ${roomId} to ${videoId}`);
        if (!rooms[roomId]) return;
        
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

        if (room.queue.length > 0) {
            // Play queue
            const nextVideo = room.queue.shift();
            room.currentVideoId = nextVideo.id;
            room.videoTime = 0;
            room.isPlaying = true;
            room.lastUpdate = Date.now();
            
            io.to(roomId).emit('sync-state', room);
            io.to(roomId).emit('change-video', nextVideo.id);
        } else {
            // Nothing in queue, just stop or keep playing logic 
            // Better to let client know or pick random? 
            // For now, client will handle suggestion fallback if queue is empty
            socket.emit('queue-empty');
        }
    });

    socket.on('add-to-queue', ({ roomId, video }) => {
        if (!rooms[roomId]) rooms[roomId] = { queue: [], currentVideoId: 'dQw4w9WgXcQ' };
        if (!rooms[roomId].queue) rooms[roomId].queue = [];
        rooms[roomId].queue.push(video);
        io.to(roomId).emit('update-queue', rooms[roomId].queue);
    });

    socket.on('send-message', ({ roomId, message, user }) => {
        io.to(roomId).emit('receive-message', { user, message, id: Date.now() });
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

server.listen(5000, () => console.log("Server running on port 5000"));
