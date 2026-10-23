import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import type { MediaState } from "./ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MediaServiceListener {
  (media: MediaState | null): void;
}

export type Logger = (message: string, error?: unknown) => void;

export class MediaService {
  private workerProcess: ChildProcess | null = null;
  private currentMedia: MediaState | null = null;
  private currentArtworkPath: string = "";
  private listeners: Set<MediaServiceListener> = new Set();
  private pauseGraceTimer: NodeJS.Timeout | null = null;
  private cmdFile: string;
  private isInteractive: boolean = false;
  private lastCommandTime: number = 0;
  private log: Logger;

  private artCacheDir: string;
  private lastArtworkLookupKey: string = "";
  private currentArtworkSongKey: string = "";

  constructor(logger?: Logger) {
    this.log = logger || ((msg) => console.log(`[MediaService] ${msg}`));
    this.artCacheDir = path.join(os.tmpdir(), "islet-media-art");
    if (!fs.existsSync(this.artCacheDir)) {
      try {
        fs.mkdirSync(this.artCacheDir, { recursive: true });
      } catch {
        // ignore
      }
    }
    this.cmdFile = path.join(this.artCacheDir, "cmd.txt");
  }

  public start(): void {
    const candidatePaths = [
      path.join(__dirname, "media-worker.ps1"),
      path.join(__dirname, "../electron/media-worker.ps1"),
      path.join(process.cwd(), "electron/media-worker.ps1"),
      path.join(process.cwd(), "dist-electron/media-worker.ps1")
    ];

    const resolvedScript = candidatePaths.find((p) => fs.existsSync(p));
    if (!resolvedScript) {
      this.log(
        `[MediaService ERROR] Could not locate media-worker.ps1 in candidate paths: ${JSON.stringify(candidatePaths)}`
      );
      return;
    }

    this.log(`[MediaService] Launching media worker script: ${resolvedScript}`);

    try {
      this.workerProcess = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolvedScript],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
      );

      this.log(`[MediaService] Worker process successfully spawned with PID ${this.workerProcess.pid}`);

      if (this.workerProcess.stdout) {
        const rl = readline.createInterface({
          input: this.workerProcess.stdout,
          terminal: false
        });

        rl.on("line", (line: string) => {
          this.handleWorkerLine(line.trim());
        });
      }

      if (this.workerProcess.stderr) {
        this.workerProcess.stderr.on("data", (data: Buffer) => {
          const text = data.toString("utf8").trim();
          if (text) {
            this.log(`[MediaWorker STDERR] ${text}`);
          }
        });
      }

      this.workerProcess.on("exit", (code: number | null, signal: string | null) => {
        this.log(`[MediaService] Worker process exited. Code=${code}, Signal=${signal}`);
        this.workerProcess = null;
      });

      this.workerProcess.on("error", (err: Error) => {
        this.log(`[MediaService ERROR] Worker process error:`, err);
      });
    } catch (err) {
      this.log("[MediaService ERROR] Failed to spawn media worker:", err);
    }
  }

  public stop(): void {
    this.log("[MediaService] Stopping media service");
    if (this.pauseGraceTimer) {
      clearTimeout(this.pauseGraceTimer);
      this.pauseGraceTimer = null;
    }
    if (this.workerProcess) {
      try {
        this.workerProcess.kill();
      } catch {
        // ignore
      }
      this.workerProcess = null;
    }
  }

  public isWorkerAlive(): boolean {
    return Boolean(this.workerProcess && !this.workerProcess.killed);
  }

  public getCurrentMedia(): MediaState | null {
    return this.currentMedia;
  }

  public getCurrentArtworkPath(): string {
    return this.currentArtworkPath;
  }

  public setInteractive(interactive: boolean): void {
    this.isInteractive = interactive;
    this.log(`[MediaService] setInteractive: ${interactive}`);
    if (this.isInteractive && this.pauseGraceTimer) {
      this.log("[MediaService] Cancelling pause grace timer due to user interaction");
      clearTimeout(this.pauseGraceTimer);
      this.pauseGraceTimer = null;
    }
  }

  public onMediaChanged(listener: MediaServiceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public sendCommand(cmd: "play-pause" | "next" | "previous" | string): void {
    this.lastCommandTime = Date.now();
    this.log(`[MediaService] Dispatching media command: ${cmd} (worker alive: ${this.isWorkerAlive()})`);
    try {
      fs.writeFileSync(this.cmdFile, cmd, "utf8");
    } catch (err) {
      this.log(`[MediaService ERROR] Failed to dispatch command ${cmd}:`, err);
    }
  }

  public seek(positionMs: number): void {
    if (this.currentMedia) {
      this.currentMedia.positionMs = positionMs;
      this.notify(this.currentMedia);
    }
    this.sendCommand(`seek:${Math.round(positionMs)}`);
  }

  private notify(media: MediaState | null): void {
    this.log(
      `[MediaService] Notifying ${this.listeners.size} listeners with media: ${media ? `"${media.title}" by "${media.artist}" [${media.status}]` : "null"
      }`
    );
    for (const listener of this.listeners) {
      try {
        listener(media);
      } catch (err) {
        this.log("[MediaService ERROR] Error in media listener:", err);
      }
    }
  }

  private handleWorkerLine(line: string): void {
    if (!line) return;
    if (!line.startsWith("{")) {
      this.log(`[MediaWorker RAW OUTPUT] ${line}`);
      return;
    }

    try {
      const data = JSON.parse(line);

      if (data.type === "error") {
        this.log(`[MediaWorker ERROR EVENT] ${data.message}`);
        return;
      }

      if (data.type !== "media") return;

      if (data.status === "stopped" || data.status === "closed" || (!data.title && !data.artist)) {
        const recentlyIssuedCommand = Date.now() - this.lastCommandTime < 1500;
        if (recentlyIssuedCommand) {
          this.log(`[MediaService] Suppressing stopped event during command transition`);
          return;
        }

        if (this.pauseGraceTimer) {
          clearTimeout(this.pauseGraceTimer);
          this.pauseGraceTimer = null;
        }
        if (this.currentMedia !== null) {
          this.log(`[MediaService] Platform closed or media stopped (${data.status}); clearing immediately to time & weather`);
          this.currentMedia = null;
          this.notify(null);
        }
        return;
      }

      const isPlaying = data.status === "playing";
      const isPaused = data.status === "paused";

      if (data.artworkPath && fs.existsSync(data.artworkPath)) {
        this.currentArtworkPath = data.artworkPath;
      }

      const appLower = (data.app || "media").toLowerCase();
      const titleLower = (data.title || "").toLowerCase();
      const artistLower = (data.artist || "").toLowerCase();
      const albumLower = (data.album || "").toLowerCase();
      const sourceHint = (((data as any).sourceHint as string) || "").toLowerCase();
      const playbackType = (((data as any).playbackType as string) || "").toLowerCase();

      let source: MediaState["source"] = "generic";
      if (
        appLower.includes("spotify") ||
        sourceHint === "spotify" ||
        albumLower.includes("spotify") ||
        titleLower.includes("spotify") ||
        artistLower.includes("spotify")
      ) {
        source = "spotify";
      } else if (appLower.includes("apple") || sourceHint === "apple-music") {
        source = "apple-music";
      } else if (appLower.includes("vlc")) {
        source = "vlc";
      } else if (
        titleLower.includes("youtube") ||
        artistLower.includes("youtube") ||
        albumLower.includes("youtube") ||
        appLower.includes("youtube") ||
        sourceHint === "youtube" ||
        playbackType === "video"
      ) {
        source = "youtube";
      } else if (data.album && data.album.length > 0) {
        // Track has a genuine music album name (e.g. Spotify Web Player)
        source = "spotify";
      } else if (
        appLower.includes("brave") ||
        appLower.includes("chrome") ||
        appLower.includes("edge") ||
        appLower.includes("firefox") ||
        appLower.includes("opera") ||
        appLower.includes("vivaldi") ||
        appLower.includes("browser")
      ) {
        source = "browser";
      }

      const isBrowserSource = source === "youtube" || source === "generic";

      if (!isBrowserSource && data.artworkPath && fs.existsSync(data.artworkPath)) {
        this.currentArtworkPath = data.artworkPath;
      } else if (isBrowserSource) {
        // Chromium GSMTC provides browser executable icons (e.g. Brave lion) rather than song artwork.
        // Don't treat the browser icon as the song's album art.
        if (this.currentArtworkSongKey !== `${data.title}:::${data.artist}`) {
          this.currentArtworkPath = "";
        }
      }

      // If playing in browser or missing artwork, automatically resolve the genuine high-res album cover
      if ((isBrowserSource || !this.currentArtworkPath) && data.title) {
        this.tryResolveOnlineArtwork(data.title, data.artist || "");
      }

      const mediaState: MediaState = {
        status: isPlaying ? "playing" : "paused",
        title: data.title || "Unknown Title",
        artist: data.artist || "Unknown Artist",
        album: data.album || "",
        source,
        artworkUrl: this.currentArtworkPath ? `islet-art://live-artwork?t=${Date.now()}` : undefined,
        positionMs: data.positionMs || 0,
        durationMs: data.durationMs || 0
      };

      this.log(
        `[MediaService] Valid media session parsed: player="${data.app}" (${source}), status="${mediaState.status}", title="${mediaState.title}", artist="${mediaState.artist}", artwork=${this.currentArtworkPath ? "yes" : "no"}`
      );

      if (isPlaying) {
        if (this.pauseGraceTimer) {
          this.log("[MediaService] Playback resumed; cancelling pause grace timer");
          clearTimeout(this.pauseGraceTimer);
          this.pauseGraceTimer = null;
        }
        this.currentMedia = mediaState;
        this.notify(mediaState);
      } else if (isPaused) {
        this.currentMedia = mediaState;
        this.notify(mediaState);

        // Pause grace policy: wait 6s before clearing to time and weather
        if (!this.pauseGraceTimer) {
          this.log("[MediaService] Playback paused; starting 6s grace period timer");
          this.pauseGraceTimer = setTimeout(() => {
            this.pauseGraceTimer = null;
            if (this.currentMedia && this.currentMedia.status === "paused") {
              this.log("[MediaService] 6s pause grace elapsed; reverting to time & weather");
              this.currentMedia = null;
              this.notify(null);
            }
          }, 6000);
        }
      }
    } catch (err) {
      this.log(`[MediaService ERROR] Failed to parse worker line: ${line}`, err);
    }
  }

  private hashCode(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = (hash << 5) - hash + s.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private async tryResolveOnlineArtwork(title: string, artist: string): Promise<void> {
    const rawKey = `${title}:::${artist}`;
    if (this.lastArtworkLookupKey === rawKey) return;
    this.lastArtworkLookupKey = rawKey;

    try {
      // 1. Separate Artist and Title if title is formatted as "Artist - Song Title"
      let parsedArtist = (artist || "").trim();
      let parsedTitle = (title || "").trim();

      if (parsedTitle.includes(" - ")) {
        const parts = parsedTitle.split(/\s+-\s+/);
        if (parts.length >= 2) {
          // If artist is generic like "YouTube", "Browser", or empty, extract from title
          if (!parsedArtist || parsedArtist.toLowerCase().includes("youtube") || parsedArtist.toLowerCase().includes("chrome") || parsedArtist.toLowerCase().includes("brave")) {
            parsedArtist = parts[0].trim();
            parsedTitle = parts.slice(1).join(" - ").trim();
          }
        }
      }

      // 2. Strip video noise like (Official Music Video), [Lyrics], 4K, etc.
      const cleanTitle = parsedTitle
        .replace(/\s*[\(\[](official\s*(music\s*)?(video|audio|visualizer)|lyrics?|visualizer|feat\.?|ft\.?|remix|hd|4k|prod\.?).*?[\)\]]/gi, "")
        .replace(/\s*[\(\[].*?beat.*?[\)\]]/gi, "")
        .replace(/\s*\|.*$/, "")
        .replace(/\s*#\w+/g, "")
        .trim();

      const cleanArtist = parsedArtist
        .replace(/\s*-\s*topic$/i, "")
        .replace(/\s*vevo$/i, "")
        .split(/[,&/]|feat\.?|ft\.?/i)[0]
        .trim();

      if (!cleanTitle) return;

      let artUrl: string | null = null;

      // Search attempt 1: cleanTitle + cleanArtist
      if (cleanArtist && !cleanArtist.toLowerCase().includes("youtube")) {
        const q1 = encodeURIComponent(`${cleanArtist} ${cleanTitle}`);
        try {
          const r1 = await fetch(`https://itunes.apple.com/search?term=${q1}&entity=song&limit=1`);
          const d1 = (await r1.json()) as any;
          if (d1.results && d1.results.length > 0 && d1.results[0].artworkUrl100) {
            artUrl = d1.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
          }
        } catch {}
      }

      // Search attempt 2: cleanTitle alone
      if (!artUrl) {
        const q2 = encodeURIComponent(cleanTitle);
        try {
          const r2 = await fetch(`https://itunes.apple.com/search?term=${q2}&entity=song&limit=1`);
          const d2 = (await r2.json()) as any;
          if (d2.results && d2.results.length > 0 && d2.results[0].artworkUrl100) {
            artUrl = d2.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
          }
        } catch {}
      }

      // Search attempt 3: generic music entity
      if (!artUrl) {
        const q3 = encodeURIComponent(`${cleanArtist} ${cleanTitle}`.trim());
        try {
          const r3 = await fetch(`https://itunes.apple.com/search?term=${q3}&media=music&limit=1`);
          const d3 = (await r3.json()) as any;
          if (d3.results && d3.results.length > 0 && d3.results[0].artworkUrl100) {
            artUrl = d3.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
          }
        } catch {}
      }

      if (artUrl) {
        const imgRes = await fetch(artUrl);
        const arrayBuf = await imgRes.arrayBuffer();
        const hash = Math.abs(this.hashCode(rawKey));
        const outPath = path.join(this.artCacheDir, `art-resolved-${hash}.jpg`);
        fs.writeFileSync(outPath, Buffer.from(arrayBuf));
        this.currentArtworkPath = outPath;
        this.currentArtworkSongKey = rawKey;
        this.log(`[MediaService] Resolved genuine album artwork for "${title}": ${outPath}`);
        if (this.currentMedia && this.currentMedia.title === title) {
          this.currentMedia.artworkUrl = `islet-art://live-artwork?t=${Date.now()}`;
          this.notify(this.currentMedia);
        }
      }
    } catch (err) {
      this.log(`[MediaService] Failed to resolve online artwork for "${title}":`, err);
    }
  }
}
