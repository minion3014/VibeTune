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

    // Use root name from the first file's path or fallback
    const firstFileWithPath = Array.from(files).find(f => f.webkitRelativePath);
    const rootName = firstFileWithPath 
      ? firstFileWithPath.webkitRelativePath.split('/')[0] 
      : 'Imported Files';
    
    setRootFolderName(rootName);

    const songMap = new Map<string, { audio?: File; lrc?: File; folder: string }>();
    const folderMap = new Map<string, Song[]>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // On mobile/Android, webkitRelativePath is often empty
      const path = file.webkitRelativePath || file.name;
      const pathParts = path.split('/');
      
      let folderName = rootName;
      if (file.webkitRelativePath) {
        folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';
      }
      
      const lastDotIndex = file.name.lastIndexOf('.');
      if (lastDotIndex === -1) continue;
      
      const fileNameNoExt = file.name.substring(0, lastDotIndex).toLowerCase();
      const ext = file.name.substring(lastDotIndex + 1).toLowerCase();

      if (['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext)) {
        const current = songMap.get(fileNameNoExt) || { folder: folderName };
        songMap.set(fileNameNoExt, { ...current, audio: file });
      } else if (ext === 'txt' || ext === 'lrc') {
        const current = songMap.get(fileNameNoExt) || { folder: folderName };
        songMap.set(fileNameNoExt, { ...current, lrc: file });
      }
    }

    const allLoadedSongs: Song[] = [];
    for (const [name, data] of songMap.entries()) {
      if (data.audio) {
        let lyrics: LyricLine[] = [];
        if (data.lrc) {
          try {
            const lrcText = await data.lrc.text();
            lyrics = parseLRC(lrcText);
          } catch (e) {
            console.error(`Error parsing lyrics for ${data.audio.name}:`, e);
          }
        }

        let artist = data.folder;
        try {
          const metadata = await mm.parseBlob(data.audio);
          artist = metadata.common.composer || metadata.common.artist || data.folder;
        } catch (e) {
          console.warn(`Error parsing metadata for ${data.audio.name}:`, e);
        }

        const songName = data.audio.name.substring(0, data.audio.name.lastIndexOf('.'));
        const song: Song = {
          id: Math.random().toString(36).substr(2, 9),
          name: songName,
          artist,
          audioUrl: URL.createObjectURL(data.audio),
          lyrics,
          cover: `https://picsum.photos/seed/${data.audio.name}/400/400`,
        };

        allLoadedSongs.push(song);
        
        const folderSongs = folderMap.get(data.folder) || [];
        folderMap.set(data.folder, [...folderSongs, song]);
      }
    }

    if (allLoadedSongs.length === 0) {
      alert("Không tìm thấy file nhạc hợp lệ. Vui lòng chọn đồng thời cả file nhạc và file .txt tương ứng.");
      return;
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
        audioRef.current.play().catch(console.error);
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

  const renderSongList = () => {
    if (filteredSongs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500 text-center p-4 border border-dashed border-white/10 rounded-2xl mx-2">
          <Music className="w-10 h-10 mb-4 opacity-10" />
          <p className="text-sm font-medium">No tracks found</p>
          
          <div className="mt-4 space-y-2 flex flex-col items-center">
            <button 
              onClick={() => triggerFileSelect()}
              className="text-xs font-bold text-blue-400 hover:underline px-6 py-2.5 bg-blue-500/10 rounded-xl transition-all hover:bg-blue-500/20"
            >
              Open Music Folder
            </button>
            <p className="text-[9px] opacity-40 max-w-[180px]">
              Select a folder containing your music and .txt lyrics.
            </p>
          </div>
        </div>
      );
    }

    return filteredSongs.map((song) => (
      <button
        key={song.id}
        onClick={() => {
          setCurrentSongIndex(songs.indexOf(song));
          setIsPlaying(true);
          if (window.innerWidth < 768) setIsLibraryOpen(false);
        }}
        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group border border-transparent ${
          currentSong?.id === song.id 
            ? 'bg-blue-500/10 text-white border-blue-500/30' 
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
    ));
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
                className="fixed md:absolute top-16 md:top-full left-0 right-0 md:mt-2 bg-[#1a1a1a] md:rounded-2xl border-b md:border border-white/10 shadow-2xl overflow-hidden z-[200] max-h-[80vh] md:max-h-[400px]"
              >
                  <div className="p-4 md:p-2">
                    {allSongs.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <Music className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No music imported yet.</p>
                        <p className="text-[10px] mt-1 opacity-60 text-blue-400">Open Library to add music</p>
                      </div>
                    ) : (
                      <>
                        <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest flex justify-between items-center">
                          <span>Categories / Folders</span>
                        </div>
                        
                        {folderSuggestions.length > 0 ? (
                          <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                            {folderSuggestions.map(name => (
                              <button 
                                key={name}
                                onClick={() => selectFolder(name)}
                                className="w-full flex items-center gap-3 p-4 md:p-3 hover:bg-blue-600/20 text-white rounded-xl transition-all text-sm text-left group"
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
                          <div className="p-12 text-center text-gray-500">
                            <Search className="w-10 h-10 mx-auto mb-4 opacity-20" />
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
            onClick={() => setIsLibraryOpen(!isLibraryOpen)}
            className={`p-2 md:p-2.5 rounded-xl transition-all group flex items-center gap-2 border ${isLibraryOpen ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}
            title={isLibraryOpen ? "Close Library" : "Open Library"}
          >
            <ListMusic className="w-5 h-5 group-hover:text-blue-400" />
            <span className="text-xs font-bold hidden sm:block">Library</span>
          </button>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center overflow-hidden shadow-lg">
            <User className="w-5 h-5 md:w-6 md:h-6 text-gray-400" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Desktop Sidebar Library (Web Mode) */}
        <AnimatePresence mode="wait">
          {isLibraryOpen && (
            <motion.aside
              key="desktop-library"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ 
                type: 'spring', 
                damping: 30, 
                stiffness: 150,
                opacity: { duration: 0.2 }
              }}
              className="hidden md:flex flex-col border-r border-white/10 bg-black/20 backdrop-blur-md overflow-hidden h-full"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ListMusic className="w-5 h-5 text-blue-400" />
                  <span className="font-black tracking-tight text-lg uppercase">Library</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => triggerFileSelect()}
                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-blue-400"
                    title="Open Folder"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setIsLibraryOpen(false)}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col p-2 pt-4">
                {currentFolder && (
                  <div className="mx-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center gap-3 mb-4">
                    <FolderOpen className="w-4 h-4 text-blue-400" />
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs font-bold text-blue-400 truncate">{currentFolder}</p>
                      <p className="text-[10px] text-blue-400/60">{songs.length} tracks</p>
                    </div>
                    <button onClick={resetFilter} className="text-blue-400 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-2 space-y-1 custom-scrollbar">
                  {renderSongList()}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Mobile Drawer Library (Mobile Mode) */}
        <AnimatePresence>
          {isLibraryOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsLibraryOpen(false)}
                className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[150]"
              />
              
              <motion.div 
                key="mobile-library"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ 
                  type: 'spring', 
                  damping: 32, 
                  stiffness: 180,
                  opacity: { duration: 0.15 } 
                }}
                className="md:hidden fixed bottom-0 left-0 right-0 h-[80vh] bg-[#161616] border-t border-white/10 z-[160] flex flex-col rounded-t-[32px] shadow-2xl overflow-hidden"
              >
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-12 h-1.5 bg-white/10 rounded-full" />
                </div>

                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ListMusic className="w-5 h-5 text-blue-400" />
                    <span className="font-bold text-lg">Your Library</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => triggerFileSelect()}
                      className="p-2 bg-blue-500/10 rounded-full text-blue-400"
                      title="Open Folder"
                    >
                      <FolderOpen className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setIsLibraryOpen(false)}
                      className="p-2 bg-white/5 rounded-full"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col p-4">
                  {currentFolder && (
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center gap-3 mb-6">
                      <FolderOpen className="w-5 h-5 text-blue-400" />
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold text-blue-400 truncate">{currentFolder}</p>
                        <p className="text-xs text-blue-400/60">{songs.length} items</p>
                      </div>
                      <button onClick={resetFilter} className="p-1">
                        <X className="w-5 h-5 text-blue-400" />
                      </button>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pb-12">
                    {renderSongList()}
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
                  className="relative group max-w-[260px] md:max-w-[360px] aspect-square w-full my-12"
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
