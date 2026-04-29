import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

const googleDrive = google.drive({ version: "v3" });

const getRedirectUri = (req: express.Request) => {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  
  // Construct from request if not in env
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'];
  return `${protocol}://${host}/auth/callback`;
};

// API Routes
app.get("/api/auth/google/url", (req, res) => {
  const redirectUri = getRedirectUri(req);
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/userinfo.profile"
    ],
    prompt: "consent",
    redirect_uri: redirectUri
  });
  res.json({ url, redirectUri });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  const redirectUri = getRedirectUri(req);
  try {
    const { tokens } = await oauth2Client.getToken({
      code: code as string,
      redirect_uri: redirectUri
    });
    // In a real app, you'd store tokens in a session/cookie correctly.
    // For this demo, we'll send a cookie with the refresh token.
    res.cookie("google_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code:", error);
    res.status(500).send("Authentication failed: " + (error instanceof Error ? error.message : String(error)));
  }
});

function removeAccents(str: string) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "").normalize('NFC');
}

app.get("/api/drive/songs", async (req, res) => {
  const tokenCookie = req.cookies.google_tokens;
  if (!tokenCookie) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const tokens = JSON.parse(tokenCookie);
    oauth2Client.setCredentials(tokens);

    // Fetch user info optionally
    let user = null;
    try {
      const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
      const userInfo = await oauth2.userinfo.get();
      user = userInfo.data;
    } catch (e) {
      // User info failed, not critical
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || "root";
    
    // Recursive function to fetch files from a folder and its subfolders with pagination
    async function fetchFilesRecursively(fid: string, folderNamePath: string[] = []): Promise<any[]> {
      let allFiles: any[] = [];
      let pageToken: string | undefined = undefined;

      do {
        const resp = await googleDrive.files.list({
          auth: oauth2Client,
          q: `'${fid}' in parents and trashed = false`,
          fields: "nextPageToken, files(id, name, mimeType)",
          pageToken: pageToken,
          pageSize: 1000
        });

        const files = resp.data.files || [];
        for (const file of files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            const subFiles = await fetchFilesRecursively(file.id!, [...folderNamePath, file.name!]);
            allFiles = [...allFiles, ...subFiles];
          } else {
            allFiles.push({ ...file, folderPath: folderNamePath });
          }
        }
        pageToken = resp.data.nextPageToken as string | undefined;
      } while (pageToken);

      return allFiles;
    }

    console.log(`Fetching files from Drive folder: ${folderId}`);
    const files = await fetchFilesRecursively(folderId);
    console.log(`Found ${files.length} raw files in Drive`);
    
    // Process songs and lyrics
    // We'll group them by filename without extension, but also handle different folders
    const songMap = new Map();

    for (const file of files) {
      if (!file.name || !file.id) continue;
      
      const lastDotIndex = file.name.lastIndexOf('.');
      if (lastDotIndex === -1) continue;

      const baseName = file.name.substring(0, lastDotIndex).trim();
      const nameWithoutExt = removeAccents(baseName.toLowerCase().replace(/\s+/g, ' '));
      const ext = file.name.substring(lastDotIndex + 1).toLowerCase();
      const folderKey = removeAccents((file.folderPath.join('/') || "Root").toLowerCase().replace(/\s+/g, ' '));

      const fullKey = `${folderKey}/${nameWithoutExt}`;

      if (['mp3', 'wav', 'm4a', 'flac', 'ogg'].includes(ext)) {
        const current = songMap.get(fullKey) || { folder: file.folderPath.join('/') || "Root" };
        songMap.set(fullKey, { ...current, audio: file, name: baseName.normalize('NFC') });
      } else if (ext === 'txt' || ext === 'lrc') {
        const current = songMap.get(fullKey) || { folder: file.folderPath.join('/') || "Root" };
        songMap.set(fullKey, { ...current, lrc: file });
      }
    }

    const songs = [];
    for (const [key, data] of songMap.entries()) {
      if (data.audio) {
        songs.push({
          id: data.audio.id,
          name: data.name,
          artist: data.folder === "Root" ? "Google Drive" : data.folder,
          audioUrl: `/api/drive/stream/${data.audio.id}`,
          lrcId: data.lrc?.id,
          hasLyrics: !!data.lrc,
          cover: `https://picsum.photos/seed/${data.audio.id}/400/400`,
          folder: data.folder
        });
      }
    }
    console.log(`Processed ${songs.length} songs from Drive`);

    res.json({ songs, user });
  } catch (error: any) {
    console.error("Error listing Drive files:", error);
    const message = error.response?.data?.error?.message || error.message || "Failed to fetch songs";
    res.status(500).json({ error: message });
  }
});

app.get("/api/drive/lyrics/:fileId", async (req, res) => {
  const tokenCookie = req.cookies.google_tokens;
  if (!tokenCookie) return res.status(401).send("Unauthorized");

  try {
    const tokens = JSON.parse(tokenCookie);
    oauth2Client.setCredentials(tokens);
    
    const response = await googleDrive.files.get({
      auth: oauth2Client,
      fileId: req.params.fileId,
      alt: "media"
    }, { responseType: 'arraybuffer' });

    const buffer = Buffer.from(response.data as ArrayBuffer);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(buffer);
  } catch (error) {
    res.status(500).send("Error fetching lyrics");
  }
});

app.get("/api/drive/stream/:fileId", async (req, res) => {
  const tokenCookie = req.cookies.google_tokens;
  if (!tokenCookie) return res.status(401).send("Unauthorized");

  try {
    const tokens = JSON.parse(tokenCookie);
    oauth2Client.setCredentials(tokens);

    // Get file info for metadata (mimeType, size)
    const fileInfo = await googleDrive.files.get({
      auth: oauth2Client,
      fileId: req.params.fileId,
      fields: "mimeType, size"
    });

    const fileSize = parseInt(fileInfo.data.size || "0");
    const range = req.headers.range;

    if (range && fileSize) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      const response = await googleDrive.files.get({
        auth: oauth2Client,
        fileId: req.params.fileId,
        alt: "media"
      }, { 
        responseType: "stream",
        headers: {
          Range: `bytes=${start}-${end}`
        }
      });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": fileInfo.data.mimeType || "audio/mpeg",
      });

      (response.data as any).pipe(res);
    } else {
      // Stream the entire file if no range is requested
      const response = await googleDrive.files.get({
        auth: oauth2Client,
        fileId: req.params.fileId,
        alt: "media"
      }, { responseType: "stream" });

      res.setHeader("Content-Type", fileInfo.data.mimeType || "audio/mpeg");
      res.setHeader("Accept-Ranges", "bytes");
      if (fileSize) {
        res.setHeader("Content-Length", fileSize);
      }
      
      (response.data as any).pipe(res);
    }
  } catch (error) {
    console.error("Error streaming file:", error);
    res.status(500).send("Error streaming file");
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
