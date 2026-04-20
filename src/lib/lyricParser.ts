export interface LyricLine {
  time: number;
  text: string;
}

export function parseLRC(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split('\n');
  const lyrics: LyricLine[] = [];
  
  // Matches [mm:ss.xx], [mm:ss:xx], [mm:ss]
  const timeRegex = /\[(\d+):(\d+)(?:[:.](\d+))?\]/g;

  for (const line of lines) {
    let match;
    const text = line.replace(/\[(\d+):(\d+)(?:[:.](\d+))?\]/g, '').trim();
    
    // Reset regex index for multiple timestamps on one line
    timeRegex.lastIndex = 0;
    
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = match[3] ? parseInt(match[3]) : 0;
      
      // Handle different millisecond formats (e.g. .5 vs .50 vs .500)
      let msFactor = 1;
      if (match[3]) {
        if (match[3].length === 1) msFactor = 0.1;
        else if (match[3].length === 2) msFactor = 0.01;
        else if (match[3].length === 3) msFactor = 0.001;
      }

      const time = minutes * 60 + seconds + (milliseconds * msFactor);
      
      if (text || line.includes(']')) { // Keep empty lines if they have a timestamp
        lyrics.push({ time, text });
      }
    }
  }

  return lyrics.sort((a, b) => a.time - b.time);
}
