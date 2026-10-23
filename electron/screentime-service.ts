import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { powerMonitor } from "electron";
import type { ScreenTimeData, ScreenTimeDay } from "./ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ScreenTimeService {
  private cachedData: ScreenTimeData | null = null;
  private lastFetchTime: number = 0;
  private isFetching: boolean = false;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    // Increment today's active screen time every minute when user is active
    this.timer = setInterval(() => {
      try {
        if (powerMonitor && powerMonitor.getSystemIdleTime) {
          const idle = powerMonitor.getSystemIdleTime();
          if (idle < 60 && this.cachedData) {
            this.cachedData.todayMinutes += 1;
            const h = Math.floor(this.cachedData.todayMinutes / 60);
            const m = this.cachedData.todayMinutes % 60;
            this.cachedData.todayFormatted = `${h}h ${m.toString().padStart(2, "0")}m`;

            // Update delta
            const delta = this.cachedData.todayMinutes - this.cachedData.averageMinutes;
            this.cachedData.deltaMinutes = delta;
            this.cachedData.isAboveAverage = delta >= 0;
            const absDelta = Math.abs(delta);
            const sign = delta >= 0 ? "+" : "-";
            const dh = Math.floor(absDelta / 60);
            const dm = absDelta % 60;
            this.cachedData.deltaFormatted =
              dh > 0 ? `${sign}${dh}h ${dm}m` : `${sign}${dm}m`;

            // Update today entry in days array
            const todayItem = this.cachedData.days.find((d) => d.isToday);
            if (todayItem) {
              todayItem.minutes = this.cachedData.todayMinutes;
              todayItem.formattedTime = this.cachedData.todayFormatted;
            }
          }
        }
      } catch {
        // ignore
      }
    }, 60000);
  }

  public async getScreenTimeData(): Promise<ScreenTimeData> {
    const now = Date.now();
    // Use cached data if fresh (< 45s)
    if (this.cachedData && now - this.lastFetchTime < 45000) {
      return this.cachedData;
    }

    if (!this.isFetching) {
      this.isFetching = true;
      try {
        const rawDays = await this.queryWindowsScreenTimeWorker();
        this.cachedData = this.computeScreenTimeData(rawDays);
        this.lastFetchTime = Date.now();
      } catch (err) {
        console.warn("[ScreenTimeService] Worker query failed, using fallback:", err);
        if (!this.cachedData) {
          this.cachedData = this.generateFallbackData();
        }
      } finally {
        this.isFetching = false;
      }
    }

    return this.cachedData || this.generateFallbackData();
  }

  private queryWindowsScreenTimeWorker(): Promise<Array<{ Day: string; Date: string; Minutes: number }>> {
    return new Promise((resolve, reject) => {
      const candidatePaths = [
        path.join(__dirname, "screentime-worker.ps1"),
        path.join(__dirname, "../electron/screentime-worker.ps1"),
        path.join(process.cwd(), "electron/screentime-worker.ps1"),
        path.join(process.cwd(), "dist-electron/screentime-worker.ps1")
      ];

      const scriptPath = candidatePaths.find((p) => fs.existsSync(p));
      if (!scriptPath) {
        return reject(new Error("screentime-worker.ps1 not found"));
      }

      execFile(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        { timeout: 4000, windowsHide: true },
        (error, stdout) => {
          if (error) return reject(error);
          try {
            const parsed = JSON.parse(stdout.trim());
            if (Array.isArray(parsed)) {
              resolve(parsed);
            } else {
              reject(new Error("Invalid worker output"));
            }
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  private computeScreenTimeData(rawDays: Array<{ Day: string; Date: string; Minutes: number }>): ScreenTimeData {
    if (!rawDays || rawDays.length === 0) {
      return this.generateFallbackData();
    }

    // Use local date string YYYY-MM-DD instead of UTC to avoid timezone mismatches
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    // Compute average of days with recorded activity
    const activeDays = rawDays.filter((d) => d.Minutes > 0);
    const totalMinutes = activeDays.reduce((acc, d) => acc + d.Minutes, 0);
    const averageMinutes = activeDays.length > 0
      ? Math.round(totalMinutes / activeDays.length)
      : 360;

    const avgH = Math.floor(averageMinutes / 60);
    const avgM = averageMinutes % 60;
    const averageFormatted = `${avgH}H ${avgM.toString().padStart(2, "0")}M`;

    // Take the 3 most recent days (e.g. 2 days ago, yesterday, today)
    const recent3 = rawDays.slice(-3);
    const days: ScreenTimeDay[] = recent3.map((d, index) => {
      const isToday = d.Date === todayStr || index === recent3.length - 1;
      let mins = d.Minutes;
      // Safeguard: if today has 0 recorded but system has uptime, use uptime
      if (isToday && mins === 0) {
        mins = Math.min(1440, Math.floor(os.uptime() / 60));
      }
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return {
        day: d.Day,
        date: d.Date,
        minutes: mins,
        formattedTime: `${h}h ${m.toString().padStart(2, "0")}m`,
        isToday
      };
    });

    const todayItem = days.find((d) => d.isToday) || days[days.length - 1];
    const todayMinutes = todayItem ? todayItem.minutes : Math.floor(os.uptime() / 60);
    const th = Math.floor(todayMinutes / 60);
    const tm = todayMinutes % 60;
    const todayFormatted = `${th}h ${tm.toString().padStart(2, "0")}m`;

    const deltaMinutes = todayMinutes - averageMinutes;
    const isAboveAverage = deltaMinutes >= 0;
    const absDelta = Math.abs(deltaMinutes);
    const sign = isAboveAverage ? "+" : "-";
    const dh = Math.floor(absDelta / 60);
    const dm = absDelta % 60;
    const deltaFormatted = dh > 0 ? `${sign}${dh}h ${dm}m` : `${sign}${dm}m`;

    // Dynamic scale: ensure the highest value (and average) fits with breathing room
    const maxVal = Math.max(averageMinutes, ...days.map((d) => d.minutes), 600);
    const maxScaleHours = Math.max(12, Math.ceil((maxVal / 60) + 1));
    const maxScaleMinutes = maxScaleHours * 60;
    const avgPercent = Math.min(95, Math.max(10, (averageMinutes / maxScaleMinutes) * 100));

    return {
      todayMinutes,
      todayFormatted,
      deltaMinutes,
      deltaFormatted,
      isAboveAverage,
      averageMinutes,
      averageFormatted,
      days,
      maxScaleHours,
      avgPercent
    };
  }

  private generateFallbackData(): ScreenTimeData {
    const uptimeMins = Math.max(60, Math.floor(os.uptime() / 60));
    const now = new Date();
    const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

    const d2 = new Date(now);
    d2.setDate(now.getDate() - 2);
    const d1 = new Date(now);
    d1.setDate(now.getDate() - 1);

    const m0 = uptimeMins;
    const m1 = Math.round(uptimeMins * 1.15);
    const m2 = Math.round(uptimeMins * 0.95);

    const avg = Math.round((m0 + m1 + m2) / 3);
    const avgH = Math.floor(avg / 60);
    const avgM = avg % 60;

    const delta = m0 - avg;
    const absDelta = Math.abs(delta);
    const sign = delta >= 0 ? "+" : "-";
    const dh = Math.floor(absDelta / 60);
    const dm = absDelta % 60;

    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const days: ScreenTimeDay[] = [
      {
        day: dayNames[d2.getDay()],
        date: formatDate(d2),
        minutes: m2,
        formattedTime: `${Math.floor(m2 / 60)}h ${(m2 % 60).toString().padStart(2, "0")}m`,
        isToday: false
      },
      {
        day: dayNames[d1.getDay()],
        date: formatDate(d1),
        minutes: m1,
        formattedTime: `${Math.floor(m1 / 60)}h ${(m1 % 60).toString().padStart(2, "0")}m`,
        isToday: false
      },
      {
        day: dayNames[now.getDay()],
        date: formatDate(now),
        minutes: m0,
        formattedTime: `${Math.floor(m0 / 60)}h ${(m0 % 60).toString().padStart(2, "0")}m`,
        isToday: true
      }
    ];

    const maxScaleHours = Math.max(12, Math.ceil(Math.max(avg, m0, m1, m2) / 60 + 1));
    const avgPercent = Math.min(95, Math.max(10, (avg / (maxScaleHours * 60)) * 100));

    return {
      todayMinutes: m0,
      todayFormatted: `${Math.floor(m0 / 60)}h ${(m0 % 60).toString().padStart(2, "0")}m`,
      deltaMinutes: delta,
      deltaFormatted: dh > 0 ? `${sign}${dh}h ${dm}m` : `${sign}${dm}m`,
      isAboveAverage: delta >= 0,
      averageMinutes: avg,
      averageFormatted: `${avgH}H ${avgM.toString().padStart(2, "0")}M`,
      days,
      maxScaleHours,
      avgPercent
    };
  }

  public destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
