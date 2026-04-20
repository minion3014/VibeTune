/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useMemo, ChangeEvent } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Music, 
  Search, 
  FolderOpen,
  ListMusic,
  Maximize2,
  Minimize2,
  Heart,
  Sparkles,
  X,
  Loader2,
  Save,
  User,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseLRC, LyricLine } from './lib/lyricParser';
import { generateTimestampedLyrics } from './services/geminiService';

interface Song {
  id: string;
  name: string;
  audioUrl: string;
  lyrics: LyricLine[];
  artist: string;
  cover: string;
}

export default function App() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [allSongs, setAllSongs] = useState<Song[]>([]); // Store all songs for filtering
  const [folders, setFolders] = useState<Map<string, Song[]>>(new Map());
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [activeTab, setActiveTab] = useState<'player' | 'playlist'>('player');
  const [rootFolderName, setRootFolderName] = useState<string | null>(null);
  
  // AI Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [rawLyricsInput, setRawLyricsInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const currentSong = songs[currentSongIndex] || null;

  // Handle search interaction
  const handleSearchFocus = () => {
    setShowSearchSuggestions(true);
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setShowSearchSuggestions(true);
  };

  // Handle click outside search to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle file selection from input
  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Get root folder name from the first file's path
    const firstFilePath = files[0].webkitRelativePath || files[0].name;
    const rootName = firstFilePath.split('/')[0] || 'Selected Folder';
    setRootFolderName(rootName);

    const songMap = new Map<string, { audio?: File; lrc?: File; folder: string }>();
    const folderMap = new Map<string, Song[]>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = file.webkitRelativePath || file.name;
      const pathParts = path.split('/');
      // Get the immediate parent folder name
      const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';
      
      const lastDotIndex = path.lastIndexOf('.');
      if (lastDotIndex === -1) continue;
      
      const nameWithoutExt = path.substring(0, lastDotIndex).toLowerCase();
      const ext = path.substring(lastDotIndex + 1).toLowerCase();

      if (['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext)) {
        const current = songMap.get(nameWithoutExt) || { folder: folderName };
        songMap.set(nameWithoutExt, { ...current, audio: file });
      } else if (ext === 'txt') {
        const current = songMap.get(nameWithoutExt) || { folder: folderName };
        songMap.set(nameWithoutExt, { ...current, lrc: file });
      }
    }

    const allLoadedSongs: Song[] = [];
    for (const files of songMap.values()) {
      if (files.audio) {
        let lyrics: LyricLine[] = [];
        if (files.lrc) {
          try {
            const lrcText = await files.lrc.text();
            lyrics = parseLRC(lrcText);
          } catch (e) {
            console.error(`Error parsing lyrics for ${files.audio.name}:`, e);
          }
        }

        const fileName = files.audio.name.substring(0, files.audio.name.lastIndexOf('.'));
        const song: Song = {
          id: Math.random().toString(36).substr(2, 9),
          name: fileName,
          artist: files.folder, // Use folder name as artist for better organization
          audioUrl: URL.createObjectURL(files.audio),
          lyrics,
          cover: `https://picsum.photos/seed/${fileName}/400/400`,
        };

        allLoadedSongs.push(song);
        
        const folderSongs = folderMap.get(files.folder) || [];
        folderMap.set(files.folder, [...folderSongs, song]);
      }
    }

    setAllSongs(allLoadedSongs);
    setSongs(allLoadedSongs);
    setFolders(folderMap);
    setCurrentFolder(null);
    
    if (allLoadedSongs.length > 0) {
      setCurrentSongIndex(0);
      setIsPlaying(false);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowSearchSuggestions(false);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const selectFolder = (folderName: string) => {
    const folderSongs = folders.get(folderName) || [];
    setSongs(folderSongs);
    setCurrentFolder(folderName);
    setCurrentSongIndex(0);
    setIsPlaying(true);
    setSearchQuery('');
    setShowSearchSuggestions(false);
  };

  const resetFilter = () => {
    setSongs(allSongs);
    setCurrentFolder(null);
  };

  // Filtered suggestions for the search bar
  const folderSuggestions = useMemo(() => {
    if (!searchQuery) return [];
    return Array.from(folders.keys()).filter((name: string) => 
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, folders]);

  // AI Lyric Generation
  const handleAiGenerate = async () => {
    if (!currentSong || !rawLyricsInput.trim()) return;
    
    setIsGenerating(true);
    try {
      const lrcText = await generateTimestampedLyrics(currentSong.name, rawLyricsInput);
      const parsedLyrics = parseLRC(lrcText);
      
      // Update current song lyrics
      const updatedSongs = [...songs];
      updatedSongs[currentSongIndex] = {
        ...currentSong,
        lyrics: parsedLyrics
      };
      setSongs(updatedSongs);
      setIsAiModalOpen(false);
      setRawLyricsInput('');
    } catch (error) {
      alert("Failed to generate lyrics. Please check your connection.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Playback logic
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentSongIndex]);

  const togglePlay = () => setIsPlaying(!isPlaying);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      if (!isPlaying) {
        setIsPlaying(true);
      }
    }
  };

  const nextSong = () => {
    if (songs.length === 0) return;
    setCurrentSongIndex((prev) => (prev + 1) % songs.length);
    setIsPlaying(true);
  };

  const prevSong = () => {
    if (songs.length === 0) return;
    setCurrentSongIndex((prev) => (prev - 1 + songs.length) % songs.length);
    setIsPlaying(true);
  };

  // Find current lyric index based on current playback time
  const currentLyricIndex = useMemo(() => {
    if (!currentSong || currentSong.lyrics.length === 0) return -1;
    return currentSong.lyrics.findIndex((line, i) => {
      const nextLine = currentSong.lyrics[i + 1];
      return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
    });
  }, [currentSong, currentTime]);

  const filteredSongs = songs.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-purple-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 md:h-20 border-b border-white/10 flex items-center justify-between px-4 md:px-8 bg-black/20 backdrop-blur-md sticky top-0 z-[100]">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Music className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <h1 className="text-lg md:text-2xl font-black tracking-tighter bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent hidden sm:block">
            VIBETUNE
          </h1>
        </div>

        <div ref={searchContainerRef} className="flex-1 max-w-[400px] mx-4 relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-purple-400 transition-colors" />
          <input 
            type="text" 
            placeholder={rootFolderName ? `Search in ${rootFolderName}...` : "Search music..."}
            value={searchQuery}
            onFocus={handleSearchFocus}
            onChange={handleSearchChange}
            className="bg-white/5 border border-white/10 rounded-full py-2 md:py-2.5 pl-10 pr-4 w-full focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:bg-white/10 transition-all text-sm shadow-inner"
          />
          
          {/* Search Suggestions Dropdown */}
          <AnimatePresence>
            {showSearchSuggestions && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[110]"
              >
                  <div className="p-2">
                    {allSongs.length === 0 ? (
                      <div className="p-1">
                        <button 
                          onClick={triggerFileSelect}
                          className="w-full flex items-center gap-4 p-4 hover:bg-purple-600/20 text-white rounded-xl transition-all text-left group"
                        >
                          <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center group-hover:bg-purple-600 transition-colors">
                            <FolderOpen className="w-5 h-5 text-purple-400 group-hover:text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-sm">Open Local Folder</p>
                            <p className="text-[10px] text-gray-500">{rootFolderName ? `Current: ${rootFolderName}` : 'Select a folder to start'}</p>
                          </div>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest flex justify-between items-center">
                          <span>Folders Found</span>
                          <button onClick={triggerFileSelect} className="text-purple-400 hover:underline text-[9px]">Change Root</button>
                        </div>
                        
                        {folderSuggestions.length > 0 ? (
                          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                            {folderSuggestions.map(name => (
                              <button 
                                key={name}
                                onClick={() => selectFolder(name)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-purple-600/20 text-white rounded-xl transition-all text-sm text-left group"
                              >
                                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                                  <FolderOpen className="w-5 h-5 text-gray-400 group-hover:text-purple-400" />
                                </div>
                                <div className="flex-1 truncate">
                                  <p className="font-bold truncate group-hover:text-purple-300 transition-colors">{name}</p>
                                  <p className="text-[11px] text-gray-500">{folders.get(name)?.length} tracks</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="p-8 text-center text-gray-500">
                            <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No folders matching "{searchQuery}"</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setIsAiModalOpen(true)}
            className="p-2 md:p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-all group"
            title="AI Lyric Sync"
          >
            <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-purple-400 group-hover:scale-110 transition-transform" />
          </button>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center overflow-hidden shadow-lg">
            <User className="w-5 h-5 md:w-6 md:h-6 text-gray-400" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Mobile Tab Switcher */}
        <div className="flex md:hidden border-b border-white/10 bg-black/40 backdrop-blur-md">
          <button 
            onClick={() => setActiveTab('player')}
            className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'player' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5' : 'text-gray-500'}`}
          >
            Now Playing
          </button>
          <button 
            onClick={() => setActiveTab('playlist')}
            className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'playlist' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-400/5' : 'text-gray-500'}`}
          >
            Playlist ({songs.length})
          </button>
        </div>

        {/* Sidebar / Playlist */}
        <div className={`${activeTab === 'playlist' ? 'flex' : 'hidden'} md:flex w-full md:w-80 border-r border-white/10 flex-col bg-black/20 backdrop-blur-sm overflow-hidden`}>
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-gray-400">
              <ListMusic className="w-4 h-4" />
              <span className="text-sm font-medium uppercase tracking-wider">
                {currentFolder ? 'Folder View' : 'Your Library'}
              </span>
            </div>
            {currentFolder && (
              <button 
                onClick={resetFilter}
                className="text-[10px] bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition-colors"
              >
                Show All
              </button>
            )}
          </div>
          
          {currentFolder && (
            <div className="mx-2 p-3 bg-purple-600/10 border border-purple-500/20 rounded-xl flex items-center gap-3">
              <FolderOpen className="w-4 h-4 text-purple-400" />
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold text-purple-400 truncate">{currentFolder}</p>
                <p className="text-[10px] text-purple-400/60">{songs.length} songs</p>
              </div>
              <button onClick={resetFilter} className="text-purple-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
            {filteredSongs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500 text-center p-4 border border-dashed border-white/10 rounded-2xl">
                <Music className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">No songs found. Select a folder to get started.</p>
              </div>
            ) : (
              filteredSongs.map((song, index) => (
                <button
                  key={song.id}
                  onClick={() => {
                    setCurrentSongIndex(songs.indexOf(song));
                    setIsPlaying(true);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group ${
                    currentSong?.id === song.id 
                      ? 'bg-purple-600/20 text-purple-400 border border-purple-500/20' 
                      : 'hover:bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  <img 
                    src={song.cover} 
                    alt={song.name} 
                    className="w-12 h-12 rounded-lg object-cover shadow-md"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 text-left overflow-hidden">
                    <p className="font-medium truncate text-sm">{song.name}</p>
                    <p className="text-xs opacity-60 truncate">{song.artist}</p>
                  </div>
                  {currentSong?.id === song.id && isPlaying && (
                    <div className="flex gap-0.5 items-end h-3">
                      <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-purple-400" />
                      <motion.div animate={{ height: [8, 4, 8] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-0.5 bg-purple-400" />
                      <motion.div animate={{ height: [4, 10, 4] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-0.5 bg-purple-400" />
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center: Main Player / Lyrics */}
        <div className={`${activeTab === 'player' ? 'flex' : 'hidden'} md:flex flex-1 flex-col bg-white/5 rounded-3xl border border-white/10 overflow-hidden relative`}>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-blue-900/20 pointer-events-none" />
          
          <div className="flex-1 flex flex-col md:flex-row p-8 gap-12 items-center overflow-hidden">
            {/* Album Art */}
            <div className={`flex-1 flex justify-center transition-all duration-700 ${isFullScreen ? 'hidden' : 'flex'}`}>
              <motion.div 
                key={currentSong?.id}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative group"
              >
                <div className="absolute -inset-4 bg-purple-600/20 blur-3xl rounded-full opacity-50 group-hover:opacity-80 transition-opacity" />
                <img 
                  src={currentSong?.cover || 'https://picsum.photos/seed/music/800/800'} 
                  alt="Cover" 
                  className={`w-64 h-64 md:w-80 md:h-80 rounded-2xl object-cover shadow-2xl relative z-10 transition-transform duration-500 ${isPlaying ? 'scale-105' : 'scale-100'}`}
                  referrerPolicy="no-referrer"
                />
                <button className="absolute top-4 right-4 z-20 p-2 bg-black/40 backdrop-blur-md rounded-full text-white/80 hover:text-white hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100">
                  <Heart className="w-5 h-5" />
                </button>
              </motion.div>
            </div>

            {/* Lyrics Panel */}
            <div className={`flex-1 h-full flex flex-col ${isFullScreen ? 'w-full' : ''}`}>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-400 flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  Lyrics
                </h2>
                <div className="flex items-center gap-2">
                  {currentSong && (
                    <button 
                      onClick={() => setIsAiModalOpen(true)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-lg text-xs font-medium transition-all border border-purple-500/20"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Sync
                    </button>
                  )}
                  <button 
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                  >
                    {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div 
                className="flex-1 flex flex-col items-center justify-center space-y-8 overflow-hidden"
              >
                <AnimatePresence mode="wait">
                  {currentSong?.lyrics && currentSong.lyrics.length > 0 ? (
                    <motion.div 
                      key={currentLyricIndex}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="flex flex-col items-center justify-center space-y-8 w-full"
                    >
                      {/* Previous Line */}
                      {currentLyricIndex > 0 && (
                        <p className="text-lg md:text-xl font-medium text-gray-600 opacity-40 text-center line-clamp-2 px-4">
                          {currentSong.lyrics[currentLyricIndex - 1].text}
                        </p>
                      )}
                      
                      {/* Current Line */}
                      <p className="text-2xl md:text-4xl font-bold text-white text-center px-4 leading-tight drop-shadow-lg">
                        {currentSong.lyrics[currentLyricIndex === -1 ? 0 : currentLyricIndex].text}
                      </p>

                      {/* Next Line */}
                      {currentLyricIndex < currentSong.lyrics.length - 1 && (
                        <p className="text-lg md:text-xl font-medium text-gray-600 opacity-40 text-center line-clamp-2 px-4">
                          {currentSong.lyrics[currentLyricIndex === -1 ? 1 : currentLyricIndex + 1].text}
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 italic gap-4">
                      <p>{currentSong ? 'No lyrics available for this song.' : 'Select a song to see lyrics.'}</p>
                      {currentSong && (
                        <button 
                          onClick={() => setIsAiModalOpen(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm transition-all border border-white/10"
                        >
                          <Sparkles className="w-4 h-4 text-purple-400" />
                          Add Lyrics with AI
                        </button>
                      )}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Player Bar */}
      <footer className="h-24 md:h-32 bg-black/80 backdrop-blur-xl border-t border-white/10 z-20 p-4 md:p-6">
        <div className="max-w-7xl mx-auto flex flex-col gap-2 md:gap-4">
          {/* Progress Bar */}
          <div className="flex items-center gap-3 md:gap-4 group">
            <span className="text-[10px] md:text-xs font-mono text-gray-500 w-8 md:w-10 text-right">{formatTime(currentTime)}</span>
            <div className="flex-1 relative h-1 md:h-1.5 bg-white/10 rounded-full overflow-hidden">
              <input 
                type="range" 
                min="0" 
                max={duration || 0} 
                value={currentTime} 
                onChange={handleSeek}
                className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
              />
              <motion.div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-blue-500 rounded-full"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <span className="text-[10px] md:text-xs font-mono text-gray-500 w-8 md:w-10">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center justify-between">
            {/* Song Info */}
            <div className="flex items-center gap-3 md:gap-4 w-1/4 md:w-1/3 overflow-hidden">
              <AnimatePresence mode="wait">
                {currentSong && (
                  <motion.div 
                    key={currentSong.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                    className="flex items-center gap-2 md:gap-3 overflow-hidden"
                  >
                    <img 
                      src={currentSong.cover} 
                      alt="Cover" 
                      className="w-10 h-10 md:w-14 md:h-14 rounded-lg object-cover shadow-lg shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="overflow-hidden hidden sm:block">
                      <h3 className="font-bold truncate text-white text-xs md:text-base">{currentSong.name}</h3>
                      <p className="text-[10px] md:text-sm text-gray-400 truncate">{currentSong.artist}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 md:gap-6">
              <button 
                onClick={handleReplay}
                className="text-gray-400 hover:text-purple-400 transition-colors p-1 md:p-2"
                title="Replay"
              >
                <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button 
                onClick={prevSong}
                className="text-gray-400 hover:text-white transition-colors p-1 md:p-2"
              >
                <SkipBack className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              </button>
              <button 
                onClick={togglePlay}
                className="w-10 h-10 md:w-14 md:h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl shadow-white/10"
              >
                {isPlaying ? <Pause className="w-5 h-5 md:w-6 md:h-6 fill-current" /> : <Play className="w-5 h-5 md:w-6 md:h-6 fill-current ml-1" />}
              </button>
              <button 
                onClick={nextSong}
                className="text-gray-400 hover:text-white transition-colors p-1 md:p-2"
              >
                <SkipForward className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 w-1/4 md:w-1/3 justify-end">
              <Volume2 className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
              <div className="w-16 md:w-32 h-1 bg-white/10 rounded-full relative group overflow-hidden hidden xs:block">
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    if (audioRef.current) audioRef.current.volume = v;
                  }}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                />
                <div 
                  className="absolute inset-y-0 left-0 bg-white rounded-full"
                  style={{ width: `${volume * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* AI Lyric Modal */}
      <AnimatePresence>
        {isAiModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAiModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[#1a1a1a] border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden relative z-10 shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-purple-600/10 to-blue-600/10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold">AI Lyric Sync</h3>
                    <p className="text-xs text-gray-400">Add timestamps to raw lyrics using Gemini AI</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAiModalOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-400">Raw Lyrics</label>
                  <textarea 
                    value={rawLyricsInput}
                    onChange={(e) => setRawLyricsInput(e.target.value)}
                    placeholder="Paste your raw lyrics here..."
                    className="w-full h-64 bg-white/5 border border-white/10 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:bg-white/10 transition-all resize-none custom-scrollbar text-sm"
                  />
                </div>
                
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg h-fit">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                  </div>
                  <p className="text-xs text-purple-300 leading-relaxed">
                    Gemini AI will estimate the timestamps based on typical song structures. 
                    For best results, ensure the lyrics are complete and in order.
                  </p>
                </div>
              </div>
              
              <div className="p-6 bg-white/5 flex justify-end gap-3">
                <button 
                  onClick={() => setIsAiModalOpen(false)}
                  className="px-6 py-2 rounded-xl text-sm font-medium hover:bg-white/10 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAiGenerate}
                  disabled={isGenerating || !rawLyricsInput.trim()}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-all shadow-lg shadow-purple-600/20 flex items-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Sync with AI
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={currentSong?.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={nextSong}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .mask-fade {
          -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
          mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
        }
      `}</style>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFiles}
        className="hidden"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
      />
    </div>
  );
}
