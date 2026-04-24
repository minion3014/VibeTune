import { useState, useRef, useEffect, useMemo, ChangeEvent } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Music, 
  Search, 
  FolderOpen,
  ListMusic,
  X,
  User,
  RotateCcw,
  Shuffle,
  Repeat,
  Mic2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as mm from 'music-metadata-browser';
import { parseLRC, LyricLine } from './lib/lyricParser';

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
  const [allSongs, setAllSongs] = useState<Song[]>([]); 
  const [folders, setFolders] = useState<Map<string, Song[]>>(new Map());
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [currentSongIndex, setCurrentSongIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [rootFolderName, setRootFolderName] = useState<string | null>(null);
  const [playbackMode, setPlaybackMode] = useState<'normal' | 'shuffle' | 'repeat'>('normal');
  const [showLyricsView, setShowLyricsView] = useState(false);
  
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

  // Handle file selection
  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const firstFilePath = files[0].webkitRelativePath || files[0].name;
    const rootName = firstFilePath.split('/')[0] || 'Selected Folder';
    setRootFolderName(rootName);

    const songMap = new Map<string, { audio?: File; lrc?: File; folder: string }>();
    const folderMap = new Map<string, Song[]>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = file.webkitRelativePath || file.name;
      const pathParts = path.split('/');
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

        let artist = files.folder;
        try {
          const metadata = await mm.parseBlob(files.audio);
          artist = metadata.common.composer || metadata.common.artist || files.folder;
        } catch (e) {
          console.warn(`Error parsing metadata for ${files.audio.name}:`, e);
        }

        const fileName = files.audio.name.substring(0, files.audio.name.lastIndexOf('.'));
        const song: Song = {
          id: Math.random().toString(36).substr(2, 9),
          name: fileName,
          artist,
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

  const folderSuggestions = useMemo(() => {
    if (!searchQuery) return [];
    return Array.from(folders.keys()).filter(name => 
      name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, folders]);

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
      if (!isPlaying) setIsPlaying(true);
    }
  };

  const nextSong = () => {
    if (songs.length === 0) return;
    
    if (playbackMode === 'repeat') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      }
      setIsPlaying(true);
      return;
    }

    if (playbackMode === 'shuffle') {
      let nextIndex = Math.floor(Math.random() * songs.length);
      if (songs.length > 1 && nextIndex === currentSongIndex) {
        nextIndex = (nextIndex + 1) % songs.length;
      }
      setCurrentSongIndex(nextIndex);
    } else {
      setCurrentSongIndex((prev) => (prev + 1) % songs.length);
    }
    setIsPlaying(true);
  };

  const prevSong = () => {
    if (songs.length === 0) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    setCurrentSongIndex((prev) => (prev - 1 + songs.length) % songs.length);
    setIsPlaying(true);
  };

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
    <div className="h-[100dvh] bg-[#0a0a0a] text-white font-sans selection:bg-blue-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 md:h-20 border-b border-white/10 flex items-center justify-between px-4 md:px-8 bg-black/20 backdrop-blur-md sticky top-0 z-[100] flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Music className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </div>
          <h1 className="text-lg md:text-2xl font-black tracking-tighter bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent hidden sm:block">
            VIBETUNE
          </h1>
        </div>

        <div ref={searchContainerRef} className="flex-1 max-w-[400px] mx-4 relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
          <input 
            type="text" 
            placeholder={rootFolderName ? `Search in ${rootFolderName}...` : "Search music..."}
            value={searchQuery}
            onFocus={handleSearchFocus}
            onChange={handleSearchChange}
            className="bg-white/5 border border-white/10 rounded-full py-2 md:py-2.5 pl-10 pr-4 w-full focus:outline-none focus:ring-2 focus:ring-[#0070f3]/50 focus:bg-white/10 transition-all text-sm shadow-inner"
          />
          
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
                          className="w-full flex items-center gap-4 p-4 hover:bg-blue-600/20 text-white rounded-xl transition-all text-left group"
                        >
                          <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center group-hover:bg-blue-600 transition-colors">
                            <FolderOpen className="w-5 h-5 text-blue-400 group-hover:text-white" />
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
                          <button onClick={triggerFileSelect} className="text-blue-400 hover:underline text-[9px]">Change Root</button>
                        </div>
                        
                        {folderSuggestions.length > 0 ? (
                          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                            {folderSuggestions.map(name => (
                              <button 
                                key={name}
                                onClick={() => selectFolder(name)}
                                className="w-full flex items-center gap-3 p-3 hover:bg-blue-600/20 text-white rounded-xl transition-all text-sm text-left group"
                              >
                                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                                  <FolderOpen className="w-5 h-5 text-gray-400 group-hover:text-blue-400" />
                                </div>
                                <div className="flex-1 truncate">
                                  <p className="font-bold truncate group-hover:text-blue-300 transition-colors">{name}</p>
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
            onClick={() => setIsLibraryOpen(true)}
            className="p-2 md:p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all group flex items-center gap-2 border border-white/5"
            title="Open Library"
          >
            <ListMusic className="w-5 h-5 text-gray-400 group-hover:text-blue-400" />
            <span className="text-xs font-bold hidden sm:block">Library</span>
          </button>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center overflow-hidden shadow-lg">
            <User className="w-5 h-5 md:w-6 md:h-6 text-gray-400" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <AnimatePresence>
          {isLibraryOpen && (
            <>
              {/* Dark Overlay */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsLibraryOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150]"
              />
              
              {/* Sliding Drawer */}
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 left-0 bottom-0 w-full max-w-sm bg-[#161616] border-r border-white/10 z-[160] flex flex-col shadow-2xl"
              >
                <div className="px-6 py-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                  <div className="flex items-center gap-3 text-gray-200">
                    <ListMusic className="w-5 h-5 text-blue-400" />
                    <span className="font-black tracking-tight text-lg uppercase">Your Library</span>
                  </div>
                  <button 
                    onClick={() => setIsLibraryOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col p-2">
                  <div className="mb-4">
                    {currentFolder && (
                      <div className="mx-2 p-3 bg-[#0070f3]/10 border border-[#0070f3]/20 rounded-xl flex items-center gap-3">
                        <FolderOpen className="w-4 h-4 text-blue-400" />
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs font-bold text-blue-400 truncate">{currentFolder}</p>
                          <p className="text-[10px] text-blue-400/60">{songs.length} songs</p>
                        </div>
                        <button onClick={resetFilter} className="text-blue-400 hover:text-white">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar pb-8">
                    {filteredSongs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-gray-500 text-center p-4 border border-dashed border-white/10 rounded-2xl mx-2">
                        <Music className="w-10 h-10 mb-4 opacity-10" />
                        <p className="text-sm font-medium">No tracks found in library</p>
                        <button 
                          onClick={triggerFileSelect}
                          className="mt-4 text-xs font-bold text-blue-400 hover:underline"
                        >
                          Import media
                        </button>
                      </div>
                    ) : (
                      filteredSongs.map((song) => (
                        <button
                          key={song.id}
                          onClick={() => {
                            setCurrentSongIndex(songs.indexOf(song));
                            setIsPlaying(true);
                            if (window.innerWidth < 768) setIsLibraryOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group border border-transparent ${
                            currentSong?.id === song.id 
                              ? 'bg-[#0070f3]/10 text-white border-blue-500/30' 
                              : 'hover:bg-white/5 text-gray-400 hover:text-white'
                          }`}
                        >
                          <div className="relative flex-shrink-0">
                            <img 
                              src={song.cover} 
                              alt={song.name} 
                              className={`w-12 h-12 rounded-lg object-cover shadow-lg transition-transform ${currentSong?.id === song.id ? 'scale-90' : 'group-hover:scale-105'}`}
                              referrerPolicy="no-referrer"
                            />
                            {currentSong?.id === song.id && isPlaying && (
                              <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                                <div className="flex gap-0.5 items-end h-3">
                                  <motion.div animate={{ height: [4, 12, 4] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 bg-white" />
                                  <motion.div animate={{ height: [8, 4, 8] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-0.5 bg-white" />
                                  <motion.div animate={{ height: [4, 10, 4] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-0.5 bg-white" />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 text-left overflow-hidden">
                            <p className={`font-bold truncate text-sm ${currentSong?.id === song.id ? 'text-blue-400' : 'text-gray-200'}`}>{song.name}</p>
                            <p className="text-[11px] opacity-50 truncate font-medium">{song.artist}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col bg-[#110c1c] overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a1427] to-[#0a0a0a] pointer-events-none" />
          
          <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 z-10 relative w-full h-full">
            <AnimatePresence mode="wait">
              {!showLyricsView ? (
                <motion.div 
                  key="album-art"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.4 }}
                  className="relative group max-w-sm md:max-w-md aspect-square w-full"
                >
                  <img 
                    src={currentSong?.cover || 'https://picsum.photos/seed/music/800/800'} 
                    alt="Cover" 
                    className="w-full h-full rounded-2xl object-cover shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative z-10"
                    referrerPolicy="no-referrer"
                  />
                  {isPlaying && (
                    <div className="absolute bottom-6 left-6 z-20 flex items-end gap-1.5 px-4 py-3 bg-black/40 backdrop-blur-xl rounded-xl border border-white/10">
                      <motion.div animate={{ height: [6, 18, 6] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1.5 bg-white rounded-full" />
                      <motion.div animate={{ height: [12, 6, 12] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-1.5 bg-white rounded-full" />
                      <motion.div animate={{ height: [6, 15, 6] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-1.5 bg-white rounded-full" />
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div 
                  key="lyrics-view"
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className="w-full max-w-4xl h-full flex flex-col justify-center"
                >
                  <div className="flex flex-col items-center justify-center space-y-8 md:space-y-12">
                    <AnimatePresence mode="wait">
                      {currentSong?.lyrics && currentSong.lyrics.length > 0 ? (
                        <motion.div 
                          key={currentLyricIndex}
                          initial={{ opacity: 0, y: 30 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -30 }}
                          className="flex flex-col items-center space-y-8 md:space-y-12 w-full"
                        >
                          {currentLyricIndex > 0 ? (
                            <p className="text-xl md:text-2xl font-bold text-white/10 text-center line-clamp-1 max-w-[90%] blur-[1px]">
                              {currentSong.lyrics[currentLyricIndex - 1].text}
                            </p>
                          ) : (
                            <div className="h-10 md:h-12 invisible" />
                          )}
                          
                          <p className="text-2xl md:text-3xl lg:text-4xl font-black text-[#fbbf24] text-center drop-shadow-[0_0_30px_rgba(251,191,36,0.4)] leading-tight max-w-full px-4">
                            {currentSong.lyrics[currentLyricIndex === -1 ? 0 : currentLyricIndex].text}
                          </p>

                          {currentLyricIndex < currentSong.lyrics.length - 1 ? (
                            <p className="text-xl md:text-2xl font-bold text-white/20 text-center line-clamp-1 max-w-[90%] blur-[0.5px]">
                              {currentSong.lyrics[currentLyricIndex === -1 ? 1 : currentLyricIndex + 1].text}
                            </p>
                          ) : (
                            <div className="h-10 md:h-12 invisible" />
                          )}
                        </motion.div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 italic gap-6 text-center">
                          <p className="text-xl">{currentSong ? 'No lyrics available for this song.' : 'Select a song to see lyrics.'}</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button 
              onClick={() => setShowLyricsView(!showLyricsView)}
              className={`absolute bottom-4 right-4 md:bottom-8 md:right-8 p-3 md:p-4 rounded-full transition-all z-30 shadow-2xl backdrop-blur-md group ${showLyricsView ? 'bg-[#0070f3] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'}`}
              title="Toggle Lyrics"
            >
              <Mic2 className={`w-5 h-5 md:w-6 md:h-6 ${showLyricsView ? 'animate-pulse' : 'group-hover:scale-110 transition-transform'}`} />
            </button>
          </div>
        </div>
      </main>

      <footer className="bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-white/5 z-50 px-4 md:px-6 py-4 md:py-6 h-auto flex-shrink-0 sticky bottom-0">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-4">
          <div className="text-center">
            <AnimatePresence mode="wait">
              {currentSong && (
                <motion.div
                  key={currentSong.id}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                >
                  <h3 className="text-base md:text-lg font-bold text-white tracking-wide">
                    {currentSong.name} <span className="text-gray-500 font-normal"> - {currentSong.artist}</span>
                  </h3>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="w-full flex items-center gap-4">
            <span className="text-[10px] md:text-xs font-medium text-blue-500/70 w-10 text-right">{formatTime(currentTime)}</span>
            <div className="flex-1 relative h-1.5 md:h-1 bg-white/10 rounded-full">
              <input 
                type="range" 
                min="0" 
                max={duration || 0} 
                step="0.1"
                value={currentTime} 
                onChange={handleSeek}
                className="absolute inset-0 w-full opacity-0 cursor-pointer z-20 appearance-none bg-transparent"
              />
              <motion.div 
                className="absolute inset-y-0 left-0 bg-[#0070f3] rounded-full shadow-[0_0_20px_rgba(0,112,243,0.7)]"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 bg-white border-2 border-[#0070f3] rounded-full shadow-[0_0_15px_rgba(0,112,243,0.9)] z-30" />
              </motion.div>
            </div>
            <span className="text-[10px] md:text-xs font-medium text-blue-500/70 w-10">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-6 md:gap-10 mt-2">
            <button 
              onClick={() => {
                const modes: ('normal' | 'shuffle' | 'repeat')[] = ['normal', 'shuffle', 'repeat'];
                const nextMode = modes[(modes.indexOf(playbackMode) + 1) % modes.length];
                setPlaybackMode(nextMode);
              }}
              className={`p-2 rounded-full transition-all flex items-center justify-center relative ${playbackMode !== 'normal' ? 'bg-[#0070f3]/20 text-[#0070f3]' : 'text-gray-500 hover:text-white'}`}
              title={playbackMode === 'shuffle' ? 'Shuffle' : playbackMode === 'repeat' ? 'Repeat' : 'Normal'}
            >
              {playbackMode === 'repeat' ? <Repeat className="w-5 h-5 md:w-6 md:h-6" /> : <Shuffle className="w-5 h-5 md:w-6 md:h-6" />}
            </button>

            <button 
              onClick={prevSong}
              className="text-[#0070f3] hover:scale-110 transition-transform p-1 drop-shadow-[0_0_8px_rgba(0,112,243,0.5)]"
            >
              <SkipBack className="w-6 h-6 md:w-8 md:h-8 fill-current" />
            </button>
            <button 
              onClick={togglePlay}
              className="w-12 h-12 md:w-16 md:h-16 border-2 border-[#0070f3]/40 text-[#0070f3] rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all bg-[#0070f3]/5 shadow-[0_0_20px_rgba(0,112,243,0.2)]"
            >
              {isPlaying ? <Pause className="w-6 h-6 md:w-8 md:h-8 fill-current" /> : <Play className="w-6 h-6 md:w-8 md:h-8 fill-current ml-1" />}
            </button>
            <button 
              onClick={nextSong}
              className="text-[#0070f3] hover:scale-110 transition-transform p-1 drop-shadow-[0_0_8px_rgba(0,112,243,0.5)]"
            >
              <SkipForward className="w-6 h-6 md:w-8 md:h-8 fill-current" />
            </button>
            <button 
              onClick={handleReplay}
              className="text-[#0070f3]/60 hover:text-[#0070f3] transition-colors"
              title="Replay"
            >
              <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>
      </footer>

      <audio
        ref={audioRef}
        src={currentSong?.audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={nextSong}
      />

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
