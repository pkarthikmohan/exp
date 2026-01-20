import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import YouTube from 'react-youtube';
import { Search, ListMusic, MessageSquare, Send, Play, Users, LogIn, Plus as PlusIcon } from 'lucide-react';
import axios from 'axios';

const socket = io();

export default function JamRoom() {
    const [inRoom, setInRoom] = useState(false);
    const [roomId, setRoomId] = useState("");
    const [username, setUsername] = useState("");
    
    const [userCount, setUserCount] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [queue, setQueue] = useState([]);
    const [suggestedVideos, setSuggestedVideos] = useState([]);
    const [messages, setMessages] = useState([]);
    const [inputMsg, setInputMsg] = useState("");
    const [currentVideoId, setCurrentVideoId] = useState('dQw4w9WgXcQ');
    const playerRef = useRef(null);
    const serverStateRef = useRef(null);
    const isRemoteUpdate = useRef(false);
    const lastTimeRef = useRef(0);

    // Polling for manual seek detection (since YouTube API doesn't expose onSeek)
    useEffect(() => {
        const interval = setInterval(async () => {
            if (!playerRef.current || !inRoom) return;
            try {
                const player = playerRef.current.internalPlayer;
                const currentTime = await player.getCurrentTime();
                
                // Diff check (0.5s interval -> expect ~0.5s change)
                const diff = currentTime - lastTimeRef.current;
                
                // Detect Seek taking into account normal playback
                // If diff is > 1.5s (forward) or negative (rewind beyond small jitter)
                const isSeek = Math.abs(diff) > 1.5;

                if (isSeek) {
                    if (!isRemoteUpdate.current && Math.abs(currentTime - 0) > 1) { // Ignore seeking to 0 (often reset)
                         console.log('Seek detected:', diff);
                         socket.emit('video-action', { roomId, type: 'seek', value: currentTime });
                    }
                }
                lastTimeRef.current = currentTime;
            } catch (e) {
                // Ignore player errors or not ready
            }
        }, 500); // 500ms polling for tighter sync
        return () => clearInterval(interval);
    }, [inRoom, roomId]);

    // Join Room Logic
    const handleJoin = (e) => {
        e.preventDefault();
        if (roomId && username) {
            socket.emit('join-room', { roomId, username });
            setInRoom(true);
        }
    };

    useEffect(() => {
        if (!inRoom) return;

        console.log('Setting up socket listeners...');

        socket.on('room-update', (data) => {
            console.log('Room update:', data);
            setUserCount(data.userCount);
            if (data.message) {
                setMessages(prev => [...prev, { user: 'System', message: data.message, id: Date.now() }]);
            }
        });
        
        socket.on('receive-message', (msg) => setMessages(prev => [...prev, msg]));
        socket.on('update-queue', (newQueue) => setQueue(newQueue));
        socket.on('change-video', (vidId) => {
             setCurrentVideoId(vidId);
             setSearchResults([]); // close search
             isRemoteUpdate.current = true; // prevent loop
        });
        
        socket.on('video-action', ({ type, value }) => {
            isRemoteUpdate.current = true;
            // Prevent echo by updating lastTimeRef to the new remote time
            lastTimeRef.current = value;

            if (serverStateRef.current) {
                serverStateRef.current.videoTime = value;
                serverStateRef.current.isPlaying = (type === 'play' || type === 'seek') ? true : (type === 'pause' ? false : serverStateRef.current.isPlaying);
                serverStateRef.current.lastUpdate = Date.now();
            }
            const player = playerRef.current?.internalPlayer;
            if (type === 'play') {
                    // Always seek if difference is significant, just to be sure
                    const time = value;
                    player?.getCurrentTime().then(curr => {
                        if (Math.abs(curr - time) > 0.5) {
                            player.seekTo(time);
                        }
                        player.playVideo();
                    });
            }
            if (type === 'pause') {
                player?.seekTo(value);
                player?.pauseVideo();
            }
            if (type === 'seek') {
                 player?.seekTo(value);
                 // If we were playing, verify we keep playing? 
                 // Usually seeking while playing keeps playing.
                 if (serverStateRef.current?.isPlaying) {
                     player.playVideo();
                 }
            }
            setTimeout(() => { isRemoteUpdate.current = false; }, 1000); // Debounce remote actions
        });
        
        socket.on('sync-state', (state) => {
            setQueue(state.queue || []);
            setCurrentVideoId(state.currentVideoId);
            serverStateRef.current = state;
        });

        socket.on('related-videos', (videos) => {
            setSuggestedVideos(videos);
        });

        return () => {
            socket.off('room-update');
            socket.off('receive-message');
            socket.off('update-queue');
            socket.off('video-action');
            socket.off('sync-state');
            socket.off('change-video');
            socket.off('related-videos');
        };
    }, [inRoom]);

    // Fetch recommendations when video changes
    useEffect(() => {
        if (inRoom && currentVideoId) {
            console.log('Requesting related for:', currentVideoId);
            socket.emit('get-related', { videoId: currentVideoId });
        }
    }, [currentVideoId, inRoom]);

    // Real Search Logic
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        try {
            console.log('Searching for:', searchQuery);
            const res = await axios.get(`/search?q=${encodeURIComponent(searchQuery)}`);
            console.log('Search response:', res.data);
            setSearchResults(res.data);
        } catch (error) {
            console.error('Search failed:', error);
            alert('Search failed. YouTube API might be blocked or key is invalid. Try pasting a YouTube URL instead.');
        }
    };

    const sendMessage = () => {
        if (!inputMsg.trim()) return;
        socket.emit('send-message', { roomId, message: inputMsg, user: username });
        setInputMsg("");
    };

    const addToQueue = (vidId, title, e) => {
        e?.stopPropagation();
        socket.emit('add-to-queue', { roomId, video: { id: vidId, title } });
        // Don't close search results, let them keep searching/adding
        alert(`Added "${title}" to queue`);
    };

    const playNow = (vidId) => {
        socket.emit('change-video', { roomId, videoId: vidId });
        setSearchResults([]);
        setSearchQuery("");
    };

    // Landing Page (Entry Screen)
    if (!inRoom) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-6">
                <div className="bg-white/5 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md backdrop-blur-xl">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20 mx-auto mb-4">
                            <Play fill="white" size={32} />
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter">JAM.<span className="text-purple-500">LIVE</span></h1>
                        <p className="text-gray-400 text-sm mt-2">Watch YouTube together in sync</p>
                    </div>
                    <form onSubmit={handleJoin} className="space-y-4">
                        <input 
                            required 
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-purple-500 transition" 
                            placeholder="Your Name" 
                            value={username}
                            onChange={e => setUsername(e.target.value)} 
                        />
                        <input 
                            required 
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-purple-500 transition" 
                            placeholder="Room ID (e.g. ChillVibes)" 
                            value={roomId}
                            onChange={e => setRoomId(e.target.value)} 
                        />
                        <button 
                            type="submit" 
                            className="w-full bg-purple-600 hover:bg-purple-500 py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2"
                        >
                            <LogIn size={20} /> Join Jam
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Main App UI
    return (
        <div className="min-h-screen bg-[#0f0f13] text-gray-100 p-4 md:p-8 font-sans">
            {/* Header */}
            <header className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <Play fill="white" size={20} />
                    </div>
                    <h1 className="text-2xl font-black tracking-tighter">JAM.<span className="text-purple-500">LIVE</span></h1>
                    <span className="text-xs text-gray-500">Room: {roomId}</span>
                </div>
                
                <div className="flex-1 max-w-2xl w-full relative group">
                    <Search className="absolute left-4 top-3 text-gray-500 group-focus-within:text-purple-500 transition" size={20} />
                    <input 
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-12 focus:outline-none focus:ring-2 ring-purple-600/50 transition shadow-inner" 
                        placeholder="Search YouTube songs..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    />
                    {searchQuery && (
                        <button 
                            onClick={handleSearch}
                            className="absolute right-3 top-2 px-3 py-1.5 bg-purple-600 rounded-lg hover:bg-purple-500 transition text-xs font-bold"
                        >
                            Search
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
                    <Users size={16} className="text-purple-500" />
                    <span className="text-sm font-bold">{userCount} Listening</span>
                </div>
            </header>

            <main className="max-w-7xl mx-auto grid grid-cols-12 gap-8">
                {/* Search Results */}
                {searchResults.length > 0 && (
                    <div className="col-span-12">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <span className="w-2 h-6 bg-purple-500 rounded-full"></span> Search Results
                            </h2>
                            <button 
                                onClick={() => setSearchResults([])}
                                className="text-sm text-gray-400 hover:text-white transition"
                            >
                                Clear
                            </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                            {searchResults.map((video) => (
                                <div 
                                    key={video.id} 
                                    onClick={() => playNow(video.id)}
                                    className="group cursor-pointer relative"
                                >
                                    <div className="aspect-video bg-white/5 rounded-xl mb-2 overflow-hidden relative border border-white/5 group-hover:border-purple-500/50 transition">
                                        <img src={video.thumb} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" alt={video.title} />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                            <Play fill="white" size={32} />
                                        </div>
                                        <button 
                                            onClick={(e) => addToQueue(video.id, video.title, e)}
                                            className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg hover:bg-purple-600 transition z-10"
                                            title="Add to Queue"
                                        >
                                           <PlusIcon size={16} />
                                        </button>
                                    </div>
                                    <h4 className="text-xs font-semibold truncate group-hover:text-purple-400 transition">{video.title}</h4>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Video & Recommendations */}
                <div className="col-span-12 lg:col-span-8">
                    <div className="rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl bg-black aspect-video mb-8 ring-1 ring-white/5">
                        <YouTube 
                            key={currentVideoId}
                            videoId={currentVideoId} 
                            ref={playerRef}
                            onReady={(e) => {
                                const state = serverStateRef.current;
                                if (state) {
                                     if (state.isPlaying) {
                                         const timePassed = (Date.now() - state.lastUpdate) / 1000;
                                         const seekTime = (state.videoTime || 0) + timePassed;
                                         e.target.seekTo(seekTime);
                                         e.target.playVideo();
                                     } else {
                                         e.target.seekTo(state.videoTime || 0);
                                         e.target.pauseVideo();
                                     }
                                }
                            }}
                            onPlay={(e) => {
                                if (!isRemoteUpdate.current) {
                                    socket.emit('video-action', { roomId, type: 'play', value: e.target.getCurrentTime() });
                                }
                            }}
                            onPause={(e) => {
                                if (!isRemoteUpdate.current) {
                                    socket.emit('video-action', { roomId, type: 'pause', value: e.target.getCurrentTime() });
                                }
                            }}
                            onEnd={() => {
                                if (queue.length > 0) {
                                    socket.emit('play-next', { roomId });
                                } else if (suggestedVideos.length > 0) {
                                    // Auto-play first suggestion if queue is empty
                                    playNow(suggestedVideos[0].id);
                                }
                            }}
                            opts={{ width: '100%', height: '100%', playerVars: { autoplay: 1 } }} 
                            className="w-full h-full"
                        />
                    </div>

                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2 italic"><span className="w-2 h-6 bg-purple-500 rounded-full"></span> Suggested Vibes</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {suggestedVideos.length > 0 ? suggestedVideos.map((vid, i) => (
                            <div 
                                key={i} 
                                onClick={() => playNow(vid.id)} 
                                className="group cursor-pointer relative"
                            >
                                <div className="aspect-video bg-white/5 rounded-2xl mb-3 overflow-hidden relative border border-white/5 group-hover:border-purple-500/50 transition">
                                    <img src={vid.thumb || `https://img.youtube.com/vi/${vid.id}/mqdefault.jpg`} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                                        <Play fill="white" size={32} />
                                    </div>
                                    <button 
                                        onClick={(e) => addToQueue(vid.id, vid.title, e)}
                                        className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg hover:bg-purple-600 transition z-10 opacity-0 group-hover:opacity-100"
                                        title="Add to Queue"
                                    >
                                       <PlusIcon size={16} />
                                    </button>
                                </div>
                                <h4 className="text-sm font-semibold truncate group-hover:text-purple-400 transition">{vid.title}</h4>
                            </div>
                        )) : (
                            // Loading Skeleton or Fallback
                            <p className="text-gray-500 col-span-3">Loading suggestions...</p>
                        )}
                    </div>
                </div>

                {/* Sidebar: Chat & Queue */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                    {/* Chat Box */}
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 flex flex-col h-[400px]">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold flex items-center gap-2"><MessageSquare size={18} className="text-purple-500" /> Chat Room</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-hide">
                            {messages.map(m => (
                                <div key={m.id} className="bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/5">
                                    <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">{m.user}</p>
                                    <p className="text-sm text-gray-200">{m.message}</p>
                                </div>
                            ))}
                        </div>
                        <div className="relative">
                            <input 
                                value={inputMsg}
                                onChange={(e) => setInputMsg(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 pr-12 focus:outline-none focus:border-purple-500 transition" 
                                placeholder="Type a message..." 
                            />
                            <button onClick={sendMessage} className="absolute right-2 top-2 p-1.5 bg-purple-600 rounded-lg hover:bg-purple-500 transition">
                                <Send size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Queue Box */}
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 flex-1 h-[300px] overflow-hidden flex flex-col">
                        <h3 className="font-bold flex items-center gap-2 mb-4"><ListMusic size={18} className="text-purple-500" /> Up Next</h3>
                        <div className="flex-1 overflow-y-auto space-y-3">
                            {queue.map((item, i) => (
                                <div 
                                    key={i} 
                                    onClick={() => playNow(item.id)}
                                    className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition group cursor-pointer"
                                >
                                    <img src={`https://img.youtube.com/vi/${item.id}/default.jpg`} className="w-12 h-12 rounded-lg object-cover" />
                                    <p className="text-xs font-medium truncate flex-1">{item.title}</p>
                                    <Play size={12} className="opacity-0 group-hover:opacity-100 text-purple-500" />
                                </div>
                            ))}
                            {queue.length === 0 && <p className="text-center text-xs text-gray-500 mt-10">Queue is empty... <br/>Add some songs!</p>}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

