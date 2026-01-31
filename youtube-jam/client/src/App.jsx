import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import YouTube from 'react-youtube';
import { Search, ListMusic, MessageSquare, Send, Play, Pause, Users, LogIn, Plus as PlusIcon, SkipBack, SkipForward, Trash2, LogOut, Menu, X, UserCircle, Heart, Maximize } from 'lucide-react';
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
    const [currentVideoId, setCurrentVideoId] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTitle, setCurrentTitle] = useState("Loading...");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const playerRef = useRef(null);
    const videoContainerRef = useRef(null);
    const serverStateRef = useRef(null);
    const isRemoteUpdate = useRef(false);
    const lastTimeRef = useRef(0);
    const chatContainerRef = useRef(null);

    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Restore session on refresh
    useEffect(() => {
        const savedRoom = sessionStorage.getItem('jam_roomId');
        const savedUser = sessionStorage.getItem('jam_username');
        if (savedRoom && savedUser) {
            setRoomId(savedRoom);
            setUsername(savedUser);
            socket.emit('join-room', { roomId: savedRoom, username: savedUser });
            setInRoom(true);
        }
    }, []);
    
    // Polling for manual seek detection (since YouTube API doesn't expose onSeek)
    useEffect(() => {
        const interval = setInterval(async () => {
            if (!playerRef.current || !inRoom) return;
            try {
                const player = playerRef.current.internalPlayer;
                const currentTime = await player.getCurrentTime();
                const totalDuration = await player.getDuration();
                
                setProgress(currentTime);
                setDuration(totalDuration);

                // Diff check (0.5s interval -> expect ~0.5s change)
                const diff = currentTime - lastTimeRef.current;
                
                // Detect Seek taking into account normal playback
                // If diff is > 1.5s (forward) or negative (rewind beyond small jitter)
                const isSeek = Math.abs(diff) > 1.5;

                if (isSeek) {
                    if (!isRemoteUpdate.current && Math.abs(currentTime - 0) > 1) { // Ignore seeking to 0 (often reset)
                         console.log('Seek detected:', diff);
                         socket.emit('video-action', { roomId, type: 'seek', value: currentTime });
                         
                         // Force sync play state if currently playing
                         const state = await player.getPlayerState();
                         if (state === 1) { // 1 = PLAYING
                             socket.emit('video-action', { roomId, type: 'play', value: currentTime });
                         }
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
            sessionStorage.setItem('jam_roomId', roomId);
            sessionStorage.setItem('jam_username', username);
            socket.emit('join-room', { roomId, username });
            setInRoom(true);
        }
    };

    useEffect(() => {
        if (!inRoom) return;

        console.log('Setting up socket listeners...');

        // Verify we are joined on reconnect
        socket.on('connect', () => {
            console.log('Reconnected to server');
            if (roomId && username) {
                socket.emit('join-room', { roomId, username });
            }
        });

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
const playing = (type === 'play' || type === 'seek') ? true : (type === 'pause' ? false : serverStateRef.current?.isPlaying);
            setIsPlaying(playing);

            if (serverStateRef.current) {
                serverStateRef.current.videoTime = value;
                serverStateRef.current.isPlaying = playing;
                serverStateRef.current.lastUpdate = Date.now();
            }
            
            // Sync local progress bar
            setProgress(value);

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
            setIsPlaying(state.isPlaying);
            if (state.videoTime) setProgress(state.videoTime);
            serverStateRef.current = state;

            // FORCE SYNC: If the player is active, ensure we align with the server
            // mainly for mobile (reconnects) or late joiners where onReady fired before sync
            const player = playerRef.current?.internalPlayer;
            if (player && state) {
                if (state.isPlaying) {
                     // Calculate where we SHOULD be
                     // Use a small offset adjustment if client/server clocks drift? 
                     // For now simple delta.
                     const timePassed = (Date.now() - state.lastUpdate) / 1000;
                     const targetTime = (state.videoTime || 0) + timePassed;
                     
                     player.getCurrentTime().then(curr => {
                         // If we are drifting by more than 2 seconds (common in mobile background throttles)
                         if (Math.abs(curr - targetTime) > 2.0) {
                             console.log(`Force Sync: Jumping from ${curr} to ${targetTime}`);
                             player.seekTo(targetTime, true);
                             player.playVideo();
                         } else {
                             // Even if times are close, ensure we are playing if server says playing
                             if (player.getPlayerState && typeof player.getPlayerState === 'function') {
                                 player.getPlayerState().then(status => {
                                     // 2 = Paused, 1 = Playing
                                     if (status !== 1) player.playVideo();
                                 });
                             }
                         }
                     });
                } else {
                    // Server is paused
                    if (state.videoTime) {
                        player.seekTo(state.videoTime, true);
                        player.pauseVideo();
                    }
                }
            }
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

    const handlePrevious = () => {
        socket.emit('play-previous', { roomId });
    };

    const handleNext = () => {
         // Optimistically we try, server logic handles empty queue/forward history
         socket.emit('play-next', { roomId });
    };
    const handleTogglePlay = () => {
        const player = playerRef.current?.internalPlayer;
        if (!player) return;
        
        if (isPlaying) {
             player.pauseVideo();
        } else {
             player.playVideo();
        }
    };

    const handleSeekChange = (e) => {
        const time = parseFloat(e.target.value);
        setProgress(time);
        playerRef.current?.internalPlayer.seekTo(time, true);
         // Rely on the polling loop to detect the seek relative to previous time
         // OR force emit here for snappier response?
         // The polling loop logic I wrote earlier handles checking diff.
         // But since we are manually scrubbing, the "diff" in polling might be confused.
         // Let's explicitly emit here to be responsive.
         socket.emit('video-action', { roomId, type: 'seek', value: time });
         
         if (isPlaying) {
             socket.emit('video-action', { roomId, type: 'play', value: time });
         }
    };

    const formatTime = (seconds) => {
        if (!seconds) return "00:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const toggleFullscreen = () => {
        if (!videoContainerRef.current) return;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            videoContainerRef.current.requestFullscreen();
        }
    };

    const handleLeave = () => {
        if(confirm("Are you sure you want to leave the room?")) {
            sessionStorage.removeItem('jam_roomId');
            sessionStorage.removeItem('jam_username');
            // Hard reload to clean state
            window.location.reload();
        }
    };
    
    const removeFromQueue = (e, index) => {
        e.stopPropagation();
        socket.emit('remove-from-queue', { roomId, index });
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
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-purple-500 transition text-white" 
                            placeholder="Your Name" 
                            value={username}
                            onChange={e => setUsername(e.target.value)} 
                        />
                        <input 
                            required 
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-2 ring-purple-500 transition text-white" 
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
            {/* Sidebar Menu Overlay */}
            <div 
                className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsMenuOpen(false)}
            />

            {/* Sidebar Slide-in Panel */}
            <div className={`fixed left-0 top-0 h-full w-80 bg-[#121216] border-r border-white/10 z-50 transform transition-transform duration-300 ease-in-out shadow-2xl p-6 flex flex-col ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-xl flex items-center justify-center">
                            <Play fill="white" size={20} />
                        </div>
                        <h1 className="text-xl font-black tracking-tighter">JAM.<span className="text-purple-500">LIVE</span></h1>
                    </div>
                    <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex items-center gap-4 mb-8 p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-xl font-bold">
                        {username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="font-bold text-white">{username}</p>
                        <p className="text-xs text-gray-500">In Room: {roomId}</p>
                    </div>
                </div>

                <nav className="space-y-2 flex-1">
                    <button className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-white/5 transition text-gray-300 hover:text-white group">
                        <UserCircle className="group-hover:text-purple-500 transition" />
                        <span className="font-medium">My Profile</span>
                    </button>
                    <button className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-white/5 transition text-gray-300 hover:text-white group">
                        <Heart className="group-hover:text-pink-500 transition" />
                        <span className="font-medium">Liked Songs</span>
                    </button>
                    <button className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-white/5 transition text-gray-300 hover:text-white group">
                        <ListMusic className="group-hover:text-blue-500 transition" />
                        <span className="font-medium">My Playlists</span>
                    </button>
                </nav>

                <div className="mt-auto pt-6 border-t border-white/10">
                     <button 
                         onClick={handleLeave}
                         className="w-full flex items-center gap-4 p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition font-bold"
                    >
                        <LogOut size={20} /> Leave Room
                    </button>
                </div>
            </div>

            {/* Header */}
            <header className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <button 
                        onClick={() => setIsMenuOpen(true)}
                        className="p-2 mr-2 hover:bg-white/10 rounded-lg transition"
                    >
                        <Menu size={24} />
                    </button>
                    <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <Play fill="white" size={20} />
                    </div>
                    <h1 className="text-2xl font-black tracking-tighter hidden sm:block">JAM.<span className="text-purple-500">LIVE</span></h1>
                    <span className="text-xs text-gray-500 whitespace-nowrap">Room: {roomId}</span>
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

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-2xl border border-white/10">
                        <Users size={16} className="text-purple-500" />
                        <span className="text-sm font-bold">{userCount} Listening</span>
                    </div>
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
                                </div>
                            ))}
                        </div>
                    </div>
            )}

            <div className="col-span-12 lg:col-span-8">
                    <div ref={videoContainerRef} className="rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl bg-black aspect-video mb-8 ring-1 ring-white/5 relative group">
                        {!currentVideoId ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-white/5">
                                <ListMusic size={48} className="mb-4 opacity-50" />
                                <p className="text-lg">Search for a song or add to queue to start jamming!</p>
                            </div>
                        ) : (
                        <>
                            {/* Custom Overlays for controls=0 */}
                            <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-start opacity-0 group-hover:opacity-100 transition duration-300">
                                <h3 className="text-white font-bold text-lg line-clamp-1 flex-1 pr-4 drop-shadow-md">{currentTitle}</h3>
                                <div className="flex gap-2">
                                  <button onClick={toggleFullscreen} className="p-2 hover:bg-white/20 rounded-full transition text-white">
                                    <Maximize size={24} />
                                  </button>
                                </div>
                            </div>
                            
                            <YouTube 
                                key={currentVideoId}
                                videoId={currentVideoId} 
                                ref={playerRef}
                                onReady={(e) => {
                                    // Capture Title
                                    const data = e.target.getVideoData();
                                    if (data && data.title) setCurrentTitle(data.title);

                                    const state = serverStateRef.current;
                                    if (state) {
                                         // CRITICAL: Block emission during initial sync to prevent echo/reset loops
                                         isRemoteUpdate.current = true;
                                         
                                         if (state.isPlaying) {
                                             // Calculate real-time position based on server timestamp
                                             const timePassed = (Date.now() - state.lastUpdate) / 1000;
                                             const seekTime = (state.videoTime || 0) + timePassed;
                                             
                                             console.log(`Syncing joiner to ${seekTime}s (Offset: ${timePassed}s)`);
                                             e.target.seekTo(seekTime, true);
                                             e.target.playVideo();
                                         } else {
                                             e.target.seekTo(state.videoTime || 0, true);
                                             e.target.pauseVideo();
                                         }
    
                                         // Re-enable emitting after player settles (buffer can take time on mobile)
                                         setTimeout(() => { isRemoteUpdate.current = false; }, 2500);
                                    }
                                    // Initial duration set
                                    setDuration(e.target.getDuration());
                                }}
                                onPlay={(e) => {
                                    const data = e.target.getVideoData();
                                    if (data && data.title) setCurrentTitle(data.title);

                                    setIsPlaying(true);
                                    setDuration(e.target.getDuration());
                                    if (!isRemoteUpdate.current) {
                                        socket.emit('video-action', { roomId, type: 'play', value: e.target.getCurrentTime() });
                                    }
                                    // Enable Background Play logic
                                    if ('mediaSession' in navigator) {
                                        navigator.mediaSession.metadata = new MediaMetadata({
                                            title: data.title,
                                            artist: data.author,
                                            artwork: [{ src: `https://img.youtube.com/vi/${currentVideoId}/mqdefault.jpg` }]
                                        });
                                        navigator.mediaSession.setActionHandler('play', () => e.target.playVideo());
                                        navigator.mediaSession.setActionHandler('pause', () => e.target.pauseVideo());
                                        navigator.mediaSession.setActionHandler('previoustrack', handlePrevious);
                                        navigator.mediaSession.setActionHandler('nexttrack', handleNext);
                                    }
                                }}
                                onPause={(e) => {
                                    // This prevents one user's backgrounding from pausing the music for everyone.
                                    if (document.visibilityState === 'hidden') {
                                        console.log("Background auto-pause ignored");
                                        setIsPlaying(false);
                                        return;
                                    }
    
                                    setIsPlaying(false);
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
                                opts={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    playerVars: { 
                                        autoplay: 1, 
                                        playsinline: 1,
                                        controls: 0,        // Hide default controls (progress bar, etc)
                                        rel: 0,             // Minimize recommendations
                                        iv_load_policy: 3,  // Hide annotations
                                        disablekb: 1        // Disable default keyboard shortcuts
                                    } 
                                }} 
                                className="w-full h-full"
                            />
                        </>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3 mb-6 px-4">
                        <span className="text-xs font-mono text-gray-400 min-w-[40px] text-right">{formatTime(progress)}</span>
                        <input 
                            type="range" 
                            min="0" 
                            max={duration || 100} 
                            value={progress} 
                            onChange={handleSeekChange}
                            style={{
                                backgroundSize: `${(progress / (duration || 100)) * 100}% 100%`,
                                backgroundImage: `linear-gradient(#a855f7, #a855f7)`
                            }}
                            className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer bg-no-repeat [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-purple-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all outline-none"
                        />
                        <span className="text-xs font-mono text-gray-400 min-w-[40px]">{formatTime(duration)}</span>
                    </div>

                    {/* Playback Controls */}
                    <div className="flex items-center justify-center gap-6 mb-8">
                        <button 
                            onClick={handlePrevious} 
                            className="p-3 bg-white/5 rounded-xl hover:bg-white/10 text-white transition hover:scale-105 active:scale-95"
                            title="Previous Song"
                        >
                            <SkipBack size={24} fill="white" />
                        </button>
                        
                        <button 
                            onClick={handleTogglePlay} 
                            className="p-4 bg-white rounded-full hover:bg-gray-200 text-black transition hover:scale-105 active:scale-95 shadow-lg shadow-white/20"
                            title={isPlaying ? "Pause" : "Play"}
                        >
                            {isPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="black" className="ml-1" />}
                        </button>

                        <button 
                            onClick={handleNext} 
                            className="p-3 bg-purple-600 rounded-xl hover:bg-purple-500 text-white transition hover:scale-105 active:scale-95 shadow-lg shadow-purple-500/20"
                            title="Next Song"
                        >
                            <SkipForward size={24} fill="white" />
                        </button>
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
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-4 flex flex-col h-[400px]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold flex items-center gap-2"><MessageSquare size={18} className="text-purple-500" /> Chat Room</h3>
                        </div>
                        <div ref={chatContainerRef} className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2 scrollbar-hide">
                            {messages.map(m => (
                                <div key={m.id} className="bg-white/5 p-2 px-3 rounded-xl border border-white/5 flex items-baseline gap-2">
                                    <span className="text-xs font-bold text-purple-400 shrink-0">{m.user}:</span>
                                    <span className="text-sm text-gray-200 break-words">{m.message}</span>
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
                                    className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition group cursor-pointer relative"
                                >
                                    <img src={`https://img.youtube.com/vi/${item.id}/default.jpg`} className="w-12 h-12 rounded-lg object-cover" />
                                    <p className="text-xs font-medium truncate flex-1">{item.title}</p>
                                    <Play size={12} className="opacity-0 group-hover:opacity-100 text-purple-500" />
                                    
                                    <button 
                                        onClick={(e) => removeFromQueue(e, i)}
                                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-600 hover:text-red-500 transition ml-2 z-10"
                                        title="Remove"
                                    >
                                        <Trash2 size={14} />
                                    </button>
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

