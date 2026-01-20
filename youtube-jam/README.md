# 🎵 JAM.LIVE - YouTube Jam Room

A real-time synchronized music streaming application where users can watch YouTube videos together, chat, and queue songs in a shared room.

## 🎯 Features

- **Real-time Video Sync**: Play, pause, and seek videos are synchronized across all users in the room
- **Queue Management**: Add songs to a shared queue that appears instantly for all users
- **Live Chat**: Built-in messaging system for real-time communication
- **Beautiful UI**: Modern glassmorphism design with dark theme and purple accents
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 📁 Project Structure

```
youtube-jam/
├── server/                 # Node.js/Express backend with Socket.IO
│   ├── index.js           # Main server file
│   ├── package.json       # Server dependencies
│   └── node_modules/
└── client/                # React frontend with Vite
    ├── src/
    │   ├── App.jsx        # Main UI component
    │   ├── App.css        # App styles
    │   ├── index.css      # Global styles with Tailwind
    │   ├── main.jsx       # React entry point
    │   └── assets/
    ├── index.html         # HTML template
    ├── tailwind.config.js # Tailwind configuration
    ├── postcss.config.js  # PostCSS configuration
    ├── vite.config.js     # Vite configuration
    └── package.json       # Client dependencies
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm (comes with Node.js)

### Installation & Setup

#### 1. **Start the Server** (Terminal 1)

```bash
cd youtube-jam/server
node index.js
```

Expected output:
```
Server running on port 5000
```

#### 2. **Start the Client** (Terminal 2)

```bash
cd youtube-jam/client
npm run dev
```

Expected output:
```
VITE v7.3.1  ready in 672 ms
➜  Local:   http://localhost:5173/
```

#### 3. **Open in Browser**

Open your browser and navigate to: `http://localhost:5173/`

You should see the JAM.LIVE interface with:
- A YouTube video player
- Chat room on the right
- Queue of upcoming songs
- Suggested vibes to add to queue

## 🎮 How to Use

### Watching Videos
- The default video (rickroll) will load automatically
- Play/pause the video - it will sync across all connected users
- Your actions are broadcast to everyone in the room in real-time

### Adding Songs to Queue
- Click on any thumbnail in "Suggested Vibes" section
- Videos will be added to the "Up Next" queue
- All users will see the new queue instantly

### Chatting
- Type a message in the chat input at the bottom right
- Press Enter or click Send button
- Messages appear for all users in the room with random usernames

## 🔧 Technology Stack

### Backend
- **Express.js** - Web server framework
- **Socket.IO** - Real-time bidirectional communication
- **CORS** - Cross-origin resource sharing
- **Node.js** - JavaScript runtime

### Frontend
- **React** - UI library
- **Vite** - Build tool and dev server
- **Socket.IO Client** - Client-side Socket.IO
- **React YouTube** - YouTube player component
- **Lucide React** - Icon library
- **Tailwind CSS** - Utility-first CSS framework
- **PostCSS** - CSS processor

## 📡 Real-time Synchronization

The application uses Socket.IO events to keep all users synchronized:

### Server Events:
- `join-room` - User joins a jam room
- `video-action` - Play/pause/seek video
- `add-to-queue` - Add song to queue
- `send-message` - Send chat message

### Client Listeners:
- `sync-state` - Receive room state on join
- `video-action` - Receive video controls
- `update-queue` - Receive queue updates
- `receive-message` - Receive chat messages

## 🎨 UI Customization

### Colors
- Primary: Purple (`#a855f7`)
- Secondary: Pink (`#ec4899`)
- Background: Dark gradient (`#0f0f13` to `#1a1a2e`)

### Styling
All styling is done with Tailwind CSS utility classes. To customize:
1. Edit `tailwind.config.js` to modify theme
2. Add custom classes in `index.css`
3. Changes update automatically on save

## 🐛 Troubleshooting

### Client can't connect to server
- Ensure server is running on port 5000
- Check if firewall is blocking localhost connections
- Verify CORS is enabled in server

### Videos not loading
- Check YouTube API restrictions
- Ensure internet connection is stable
- Verify video IDs are valid

### Chat/Queue not updating
- Check browser console for errors (F12)
- Ensure both terminals are still running
- Try refreshing the page

## 📝 Default Videos in Queue

1. **lofi hip hop radio** - `jfKfPfyJRdk`
2. **lofi hip hop radio** - `5qap5aO4i9A`
3. **Sleepy Fish - My Room** - `DWcJFNfaw9c`

Feel free to add your own YouTube video IDs to the suggested vibes in `App.jsx`.

## 🔄 Building for Production

### Client Build
```bash
cd client
npm run build
```

Output will be in `dist/` folder.

### Server Optimization
For production, consider using:
- PM2 for process management
- Nginx as reverse proxy
- Environment variables for configuration

## 📧 Support

For issues or questions, check the browser console (F12) for error messages and verify both server and client are running.

---

**Enjoy jamming with friends!** 🎵✨
