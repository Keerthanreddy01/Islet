import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { powerMonitor } from "electron";
import type { ScreenTimeData, ScreenTimeDay } from "./ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DailyRecord {
  date: string; // YYYY-MM-DD
  dayName: string; // SUN..SAT
  totalSeconds: number;
  hourlySeconds: number[]; // 24 entries (0..23)
  appSeconds: Record<string, number>;
  lastActiveTimestamp: number;
}

interface ScreenTimeStore {
  version: 1;
  trackingStartedDate: string;
  days: Record<string, DailyRecord>;
}

export type Logger = (message: string, error?: unknown) => void;

function getLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export class ScreenTimeService {
  private log: Logger;
  private store: ScreenTimeStore;
  private storePath: string;
  private isDirty = false;

  private isSuspended = false;
  private isScreenLocked = false;
  private lastTickTime: number = Date.now();
  private ticker: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;

  private workerProcess: ChildProcess | null = null;
  private currentForegroundApp: string = "";
  private workerIdleSec: number = 0;
  private isDestroyed = false;

  constructor(logger?: Logger) {
    this.log = logger || ((msg) => console.log(`[ScreenTimeService] ${msg}`));
    this.storePath = this.resolveStorePath();
    this.store = this.loadStore();

    this.setupPowerEvents();
    this.startWorker();
    this.startTicker();
  }

  private resolveStorePath(): string {
    const appData =
      process.env.APPDATA ||
      (process.platform === "win32" ? path.join(os.homedir(), "AppData", "Roaming") : os.homedir());
    const isletDir = path.join(appData, "islet");
    try {
      fs.mkdirSync(isletDir, { recursive: true });
    } catch {
      // ignore
    }
    return path.join(isletDir, "screentime.json");
  }

  private loadStore(): ScreenTimeStore {
    const todayStr = getLocalDateString(new Date());
    if (fs.existsSync(this.storePath)) {
      try {
        const raw = fs.readFileSync(this.storePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && typeof parsed.days === "object") {
          return parsed as ScreenTimeStore;
        }
      } catch (err) {
        this.log("Failed to parse screentime.json, initializing fresh store", err);
      }
    }

    return {
      version: 1,
      trackingStartedDate: todayStr,
      days: {}
    };
  }

  private saveStore(): void {
    if (!this.isDirty) return;
    try {
      const tempPath = `${this.storePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.store, null, 2), "utf8");
      fs.renameSync(tempPath, this.storePath);
      this.isDirty = false;
    } catch (err) {
      this.log("Failed to save screentime.json", err);
    }
  }

  private setupPowerEvents(): void {
    try {
      powerMonitor.on("suspend", () => {
        this.isSuspended = true;
        this.saveStore();
      });

      powerMonitor.on("resume", () => {
        this.isSuspended = false;
        this.lastTickTime = Date.now();
      });

      powerMonitor.on("lock-screen", () => {
        this.isScreenLocked = true;
        this.saveStore();
      });

      powerMonitor.on("unlock-screen", () => {
        this.isScreenLocked = false;
        this.lastTickTime = Date.now();
      });

      powerMonitor.on("shutdown", () => {
        this.saveStore();
      });
    } catch (err) {
      this.log("powerMonitor setup warning", err);
    }
  }

  private resolveWorkerScript(): string | null {
    if (__dirname.includes("app.asar")) {
      const unpackedCandidate = path.join(
        __dirname.replace("app.asar", "app.asar.unpacked"),
        "screentime-worker.ps1"
      );
      if (fs.existsSync(unpackedCandidate)) {
        return unpackedCandidate;
      }
      if (process.resourcesPath) {
        const resCandidate = path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "dist-electron",
          "screentime-worker.ps1"
        );
        if (fs.existsSync(resCandidate)) {
          return resCandidate;
        }
      }
    }

    const candidatePaths = [
      path.join(__dirname, "screentime-worker.ps1"),
      path.join(__dirname, "../electron/screentime-worker.ps1"),
      path.join(process.cwd(), "electron/screentime-worker.ps1"),
      path.join(process.cwd(), "dist-electron/screentime-worker.ps1")
    ];

    for (const p of candidatePaths) {
      if (!p.includes("app.asar") && fs.existsSync(p)) {
        return p;
      }
    }

    try {
      const sourceInAsar = candidatePaths.find((p) => fs.existsSync(p));
      if (sourceInAsar) {
        const content = fs.readFileSync(sourceInAsar, "utf8");
        const cacheDir = path.join(os.tmpdir(), "islet-workers");
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        const cachedPath = path.join(cacheDir, "screentime-worker.ps1");
        fs.writeFileSync(cachedPath, content, "utf8");
        return cachedPath;
      }
    } catch (err) {
      this.log("Failed to extract screentime worker from asar:", err);
    }

    return null;
  }

  private startWorker(): void {
    if (this.isDestroyed) return;

    const scriptPath = this.resolveWorkerScript();
    if (!scriptPath) {
      this.log("screentime-worker.ps1 not found, running with Electron idle tracking only");
      return;
    }

    try {
      this.workerProcess = spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
      );

      if (!this.workerProcess.stdout) return;

      const rl = readline.createInterface({ input: this.workerProcess.stdout });
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) return;
        try {
          const data = JSON.parse(trimmed);
          if (data.type === "tick") {
            this.currentForegroundApp = data.app || "";
            this.workerIdleSec = typeof data.idleSec === "number" ? data.idleSec : 0;
          }
        } catch {
          // ignore parsing error for non-JSON lines
        }
      });

      this.workerProcess.on("exit", (code) => {
        this.log(`screentime worker exited with code ${code}`);
        this.workerProcess = null;
        if (!this.isDestroyed) {
          setTimeout(() => this.startWorker(), 5000);
        }
      });

      this.workerProcess.on("error", (err) => {
        this.log("screentime worker process error", err);
      });
    } catch (err) {
      this.log("Failed to spawn screentime worker", err);
    }
  }

  private startTicker(): void {
    this.lastTickTime = Date.now();

    // Measure activity every 1000ms
    this.ticker = setInterval(() => {
      this.onTick();
    }, 1000);

    // Auto-save every 30 seconds if dirty
    this.saveTimer = setInterval(() => {
      this.saveStore();
    }, 30000);
  }

  private onTick(): void {
    const now = Date.now();
    const elapsedMs = Math.min(3000, Math.max(0, now - this.lastTickTime));
    this.lastTickTime = now;

    // Skip if system is sleeping or screen is locked
    if (this.isSuspended || this.isScreenLocked) {
      return;
    }

    // Skip if user is idle (no input for >= 60 seconds)
    let idleSec = 0;
    try {
      if (powerMonitor && typeof powerMonitor.getSystemIdleTime === "function") {
        idleSec = powerMonitor.getSystemIdleTime();
      } else {
        idleSec = this.workerIdleSec;
      }
    } catch {
      idleSec = this.workerIdleSec;
    }

    if (idleSec >= 60) {
      return;
    }

    // User is genuinely active on screen
    const deltaSec = elapsedMs / 1000;
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const curHour = today.getHours();

    if (!this.store.days[todayStr]) {
      this.store.days[todayStr] = {
        date: todayStr,
        dayName: DAY_NAMES[today.getDay()],
        totalSeconds: 0,
        hourlySeconds: new Array(24).fill(0),
        appSeconds: {},
        lastActiveTimestamp: now
      };
    }

    const rec = this.store.days[todayStr];
    rec.totalSeconds += deltaSec;

    if (!Array.isArray(rec.hourlySeconds) || rec.hourlySeconds.length !== 24) {
      rec.hourlySeconds = new Array(24).fill(0);
    }
    rec.hourlySeconds[curHour] = (rec.hourlySeconds[curHour] || 0) + deltaSec;

    const app = this.currentForegroundApp.trim();
    if (app && app.toLowerCase() !== "idle" && app.toLowerCase() !== "lockapp") {
      if (!rec.appSeconds) rec.appSeconds = {};
      rec.appSeconds[app] = (rec.appSeconds[app] || 0) + deltaSec;
    }

    rec.lastActiveTimestamp = now;
    this.isDirty = true;
  }

  public async getScreenTimeData(): Promise<ScreenTimeData> {
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const todayRec = this.store.days[todayStr];
    const todayMinutes = todayRec ? Math.floor(todayRec.totalSeconds / 60) : 0;
    const todayFormatted = formatDuration(todayMinutes);

    // Build the 7-day period ending today
    const days: ScreenTimeDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = getLocalDateString(d);
      const dayName = DAY_NAMES[d.getDay()];
      const rec = this.store.days[dateStr];
      const isToday = i === 0;
      const isUntracked = !rec && dateStr < this.store.trackingStartedDate;
      const minutes = rec ? Math.floor(rec.totalSeconds / 60) : 0;

      days.push({
        day: dayName,
        date: dateStr,
        minutes,
        formattedTime: isUntracked ? "No data" : formatDuration(minutes),
        isToday,
        isUntracked
      });
    }

    // Average: calculated consistently from the recorded days in the period
    const trackedDays = days.filter((d) => !d.isUntracked);
    const totalTrackedMinutes = trackedDays.reduce((acc, d) => acc + d.minutes, 0);
    const averageMinutes = trackedDays.length > 0
      ? Math.round(totalTrackedMinutes / trackedDays.length)
      : todayMinutes;
    const avgH = Math.floor(averageMinutes / 60);
    const avgM = averageMinutes % 60;
    const averageFormatted = `${avgH}H ${avgM.toString().padStart(2, "0")}M`;

    // Daily comparison: Difference from yesterday using the same time-of-day cutoff
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);
    const yesterdayRec = this.store.days[yesterdayStr];

    let deltaFormatted: string | null = null;
    let deltaMinutes = 0;
    let isAboveAverage = false;
    let deltaLabel = "Screen time tracking active";

    if (yesterdayRec && Array.isArray(yesterdayRec.hourlySeconds)) {
      const curHour = now.getHours();
      let yestSec = 0;
      let todaySec = 0;
      for (let h = 0; h <= curHour; h++) {
        yestSec += (yesterdayRec.hourlySeconds[h] || 0);
        todaySec += (todayRec?.hourlySeconds?.[h] || 0);
      }
      const diffMin = Math.round((todaySec - yestSec) / 60);
      deltaMinutes = diffMin;
      const absDiff = Math.abs(diffMin);
      const sign = diffMin >= 0 ? "+" : "-";
      const dh = Math.floor(absDiff / 60);
      const dm = absDiff % 60;
      const formatted = dh > 0 ? `${sign}${dh}h ${dm}m` : `${sign}${dm}m`;

      deltaFormatted = formatted;
      // In screen time tracking, lower usage than yesterday is a positive health achievement (displayed in green)
      isAboveAverage = diffMin <= 0;
      deltaLabel = diffMin >= 0
        ? `${formatted} vs yesterday at this time`
        : `${absDiff}m less than yesterday at this time`;
    } else {
      // First day of tracking: no prior day for comparison
      deltaFormatted = null;
      deltaLabel = "Tracking started today";
    }

    // Dynamic scale for chart bars
    const maxVal = Math.max(averageMinutes, ...days.map((d) => d.minutes), 360);
    const maxScaleHours = Math.max(12, Math.ceil(maxVal / 60 + 1));
    const maxScaleMinutes = maxScaleHours * 60;
    const avgPercent = Math.min(95, Math.max(5, (averageMinutes / maxScaleMinutes) * 100));

    // Top application usage today
    let topApps: Array<{ name: string; minutes: number }> | undefined = undefined;
    if (todayRec && todayRec.appSeconds) {
      topApps = Object.entries(todayRec.appSeconds)
        .map(([name, sec]) => ({ name, minutes: Math.round(sec / 60) }))
        .filter((a) => a.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 5);
    }

    return {
      todayMinutes,
      todayFormatted,
      deltaMinutes,
      deltaFormatted,
      deltaLabel,
      isAboveAverage,
      averageMinutes,
      averageFormatted,
      days,
      maxScaleHours,
      avgPercent,
      topApps
    };
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.workerProcess) {
      try {
        this.workerProcess.kill();
      } catch {
        // ignore
      }
      this.workerProcess = null;
    }
    this.saveStore();
  }
}
