import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateTimestampedLyrics(songName: string, rawLyrics: string) {
  const prompt = `
    You are a professional music lyric synchronizer. 
    I will give you a song name and its raw lyrics. 
    Your task is to generate a high-quality LRC format (timestamped lyrics) for this song.
    
    Song Name: ${songName}
    Raw Lyrics:
    ${rawLyrics}
    
    Instructions:
    1. Estimate the timestamps [mm:ss.xx] based on typical song structures (intro, verse, chorus, bridge, outro).
    2. Ensure the timestamps are logical and sequential.
    3. Return ONLY the LRC formatted text.
    4. Do not include metadata tags like [ar: ], [ti: ], just the timestamped lines.
    5. If you know the song, try to be as accurate as possible with the timing.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "";
  } catch (error) {
    console.error("Error generating lyrics:", error);
    throw error;
  }
}
