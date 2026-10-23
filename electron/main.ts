import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, protocol, screen, Tray } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CalendarEvent,
  CalendarWeek,
  MediaState,
  Settings,
  Tab,
  Task,
  WindowDragPoint,
  WindowPosition
} from "./ipc.js";

import { MediaService } from "./media-service.js";
import { ScreenTimeService } from "./screentime-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "islet-art",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
]);

// Window element sizing - Sleek 390px width and comfortable expanded height
const WIN_WIDTH = 390;
const COLLAPSED_WIN_HEIGHT = 48;
const EXPANDED_WIN_HEIGHT = 165;

const SETTINGS_FILE = "settings.json";

const resolveLogPath = (): string => {
  const appData =
    process.env.APPDATA ||
    (process.platform === "win32" ? path.join(os.homedir(), "AppData", "Roaming") : os.homedir());
  const isletDir = path.join(appData, "islet");
  try {
    fs.mkdirSync(isletDir, { recursive: true });
  } catch {
    // ignore
  }
  return path.join(isletDir, "islet.log");
};

const logFile: string = resolveLogPath();

export const log = (message: string, error?: unknown) => {
  const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : error ? String(error) : "";
  const line = `[${new Date().toISOString()}] ${message}${detail ? `\n${detail}` : ""}\n`;
  console.log(line.trimEnd());
  try {
    fs.appendFileSync(logFile, line, "utf8");
  } catch (writeError) {
    console.error("Unable to write Islet diagnostic log:", writeError);
  }
};

const mediaService = new MediaService(log);
const screenTimeService = new ScreenTimeService();
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let expanded = false;
let hidden = false;
let dragOffset = { x: 0, y: 0 };
let collapseTimer: NodeJS.Timeout | null = null;
let snapAnimationTimer: NodeJS.Timeout | null = null;
let currentAnchor: WindowPosition | null = null;
let settings: Settings;
let registeredHotkey: string | null = null;
let rendererReady = false;

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
}

const defaultSettings: Settings = {
  hotkey: "Ctrl+Alt+Space",
  monitor: "active",
  accentColor: "#0a84ff",
  animations: true,
  expandOnHover: false,
  notchMode: true,
  snapToEdge: true,
  iconSize: 64,
  closeOnBlur: true,
  startWithWindows: true,
  positions: {}
};

const placeholderTasks: Task[] = [
  { id: 1, title: "Refine Dynamic Island geometry", dueAt: "16:00", link: "linear.app", completed: false },
  { id: 2, title: "Verify artwork & layout", dueAt: "17:30", link: "figma.com", completed: false },
  { id: 3, title: "Test native window bounds", dueAt: "18:00", link: "github.com", completed: false }
];

const settingsPath = () => path.join(app.getPath("userData"), SETTINGS_FILE);

const loadSettings = () => {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    return { ...defaultSettings, ...JSON.parse(raw) } as Settings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log("Unable to load Islet settings:", error);
    }
    return { ...defaultSettings };
  }
};

const saveSettings = () => {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    log("Unable to save Islet settings:", error);
  }
};

const getStartupStatus = () => app.getLoginItemSettings().openAtLogin;

const applyStartupSetting = (enabled: boolean) => {
  settings.startWithWindows = enabled;
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: ["--startup"],
      name: "Islet"
    });
  }
  saveSettings();
  updateTrayMenu();
};

const reconcileStartupSetting = () => {
  if (!app.isPackaged) return;
  const actual = getStartupStatus();
  if (actual !== settings.startWithWindows) applyStartupSetting(settings.startWithWindows);
};

const cancelCollapse = () => {
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = null;
};

// Monitor & Geometry Resolution
const getActiveDisplay = (): Electron.Display => {
  const cursorPoint = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursorPoint) ?? screen.getPrimaryDisplay();
};

const displayForPosition = (position: WindowPosition): Electron.Display => {
  const allDisplays = screen.getAllDisplays();
  const found = allDisplays.find((display) => {
    const area = display.workArea;
    return (
      position.x >= area.x - 40 &&
      position.x <= area.x + area.width + 40 &&
      position.y >= area.y - 40 &&
      position.y <= area.y + area.height + 40
    );
  });
  return found ?? getActiveDisplay();
};

const clampWindowPosition = (
  _position: WindowPosition,
  _winWidth: number = WIN_WIDTH,
  _winHeight: number = COLLAPSED_WIN_HEIGHT,
  display: Electron.Display = getActiveDisplay()
): WindowPosition => {
  return defaultTopCenterPosition(display);
};

const defaultTopCenterPosition = (display: Electron.Display = getActiveDisplay()): WindowPosition => {
  const area = display.workArea;
  return {
    x: ((Math.round(area.x + (area.width - WIN_WIDTH) / 2) || 0) | 0),
    y: ((Math.round(area.y) || 0) | 0)
  };
};

const positionKey = (display: Electron.Display) => String(display.id);

const persistPosition = (position: WindowPosition) => {
  const display = displayForPosition(position);
  settings.positions[positionKey(display)] = clampWindowPosition(position, WIN_WIDTH, COLLAPSED_WIN_HEIGHT, display);
  saveSettings();
};

const snapPosition = (_position: WindowPosition): WindowPosition => {
  const display = getActiveDisplay();
  return defaultTopCenterPosition(display);
};

const animateSnap = (from: WindowPosition, to: WindowPosition) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (snapAnimationTimer) {
    clearTimeout(snapAnimationTimer);
    snapAnimationTimer = null;
  }

  const startX = Number.isFinite(from?.x) ? Math.round(from.x) : (to?.x ?? 0);
  const startY = Number.isFinite(from?.y) ? Math.round(from.y) : (to?.y ?? 0);
  const targetX = Number.isFinite(to?.x) ? Math.round(to.x) : startX;
  const targetY = Number.isFinite(to?.y) ? Math.round(to.y) : startY;

  const safeTargetX = ((Math.round(targetX) || 0) | 0);
  const safeTargetY = ((Math.round(targetY) || 0) | 0);

  if (!settings.snapToEdge || (startX === targetX && startY === targetY)) {
    try {
      mainWindow.setPosition(safeTargetX, safeTargetY);
    } catch (err) {
      log("[animateSnap] setPosition error:", err);
    }
    currentAnchor = { x: safeTargetX, y: safeTargetY };
    persistPosition(currentAnchor);
    return;
  }

  const startedAt = Date.now();
  const duration = 180;
  const tick = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      snapAnimationTimer = null;
      return;
    }
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const curX = ((Math.round(startX + (targetX - startX) * eased) || 0) | 0);
    const curY = ((Math.round(startY + (targetY - startY) * eased) || 0) | 0);

    try {
      mainWindow.setPosition(curX, curY);
    } catch (err) {
      log("[animateSnap:tick] setPosition error:", err);
    }

    if (progress < 1) {
      snapAnimationTimer = setTimeout(tick, 16);
    } else {
      snapAnimationTimer = null;
      currentAnchor = { x: safeTargetX, y: safeTargetY };
      persistPosition(currentAnchor);
    }
  };
  tick();
};

const resizeToExpanded = (customHeight?: number) => {
  if (!mainWindow) return;
  const targetH = customHeight && customHeight > EXPANDED_WIN_HEIGHT ? customHeight + 10 : EXPANDED_WIN_HEIGHT;
  const display = getActiveDisplay();
  const pos = defaultTopCenterPosition(display);
  currentAnchor = pos;
  mainWindow.setBounds({
    x: pos.x,
    y: pos.y,
    width: WIN_WIDTH,
    height: targetH
  });
  mainWindow.showInactive();
};

const resizeToCollapsed = () => {
  if (!mainWindow) return;
  const display = currentAnchor ? displayForPosition(currentAnchor) : getActiveDisplay();
  const anchor = currentAnchor ?? defaultTopCenterPosition(display);
  const clamped = clampWindowPosition(anchor, WIN_WIDTH, COLLAPSED_WIN_HEIGHT, display);
  currentAnchor = clamped;
  mainWindow.setBounds({
    x: clamped.x,
    y: clamped.y,
    width: WIN_WIDTH,
    height: COLLAPSED_WIN_HEIGHT
  });
  persistPosition(clamped);
  mainWindow.showInactive();
};

export const showIslet = (reason: string = "manual") => {
  if (!mainWindow) return;
  const beforeVisible = mainWindow.isVisible();
  const beforeBounds = mainWindow.getBounds();
  log(
    `[showIslet] START reason="${reason}" | before: isVisible=${beforeVisible}, bounds=${JSON.stringify(beforeBounds)}`
  );

  cancelCollapse();
  hidden = false;
  expanded = false;
  const display = getActiveDisplay();
  const pos = defaultTopCenterPosition(display);
  currentAnchor = pos;
  mainWindow.setBounds({ ...pos, width: WIN_WIDTH, height: COLLAPSED_WIN_HEIGHT });
  persistPosition(pos);
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.showInactive();
  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.moveTop();

  if (rendererReady) {
    mainWindow.webContents.send("window:shown");
  }
  updateTrayMenu();

  const afterVisible = mainWindow.isVisible();
  const afterBounds = mainWindow.getBounds();
  log(
    `[showIslet] END reason="${reason}" | after: isVisible=${afterVisible}, bounds=${JSON.stringify(afterBounds)}, isMinimized=${mainWindow.isMinimized()}`
  );
};

export const hideIslet = (reason: string = "manual") => {
  if (!mainWindow) return;
  const beforeVisible = mainWindow.isVisible();
  const beforeBounds = mainWindow.getBounds();
  log(
    `[hideIslet] START reason="${reason}" | before: isVisible=${beforeVisible}, bounds=${JSON.stringify(beforeBounds)}`
  );

  hidden = true;
  expanded = false;
  cancelCollapse();
  resizeToCollapsed();
  mainWindow.hide();

  if (rendererReady) {
    mainWindow.webContents.send("window:hidden");
  }
  updateTrayMenu();

  const afterVisible = mainWindow.isVisible();
  const afterBounds = mainWindow.getBounds();
  log(
    `[hideIslet] END reason="${reason}" | after: isVisible=${afterVisible}, bounds=${JSON.stringify(afterBounds)}`
  );
};

const handleGlobalHotkey = () => {
  log(
    `[hotkey] Global hotkey pressed. hidden=${hidden}, isVisible=${mainWindow?.isVisible() ?? false}, expanded=${expanded}`
  );
  if (hidden || !mainWindow?.isVisible()) {
    showIslet("hotkey-toggle-show");
  } else if (expanded) {
    requestCollapse();
  } else {
    hideIslet("hotkey-toggle-hide");
  }
};

const requestCollapse = () => {
  if (!expanded || !mainWindow) return;
  log("[main] Requesting collapse from expanded mode");
  mainWindow.webContents.send("window:start-collapse");
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    if (expanded) {
      expanded = false;
      resizeToCollapsed();
    }
    collapseTimer = null;
  }, 650);
};

const registerGlobalHotkey = () => {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }
  const requested = settings.hotkey || defaultSettings.hotkey;
  if (globalShortcut.register(requested, handleGlobalHotkey)) {
    registeredHotkey = requested;
    log(`[hotkey] Successfully registered hotkey: ${requested}`);
    return true;
  }
  if (requested !== defaultSettings.hotkey && globalShortcut.register(defaultSettings.hotkey, handleGlobalHotkey)) {
    registeredHotkey = defaultSettings.hotkey;
    settings.hotkey = defaultSettings.hotkey;
    saveSettings();
    log(`[hotkey] Fell back to default hotkey: ${defaultSettings.hotkey}`);
    return false;
  }
  log(`[hotkey ERROR] Unable to register Islet hotkey: ${requested}`);
  return false;
};

const resolveLogoPath = (): string => {
  const newLogoPath = "C:\\Users\\keert\\Desktop\\Islet\\logo.png";
  if (fs.existsSync(newLogoPath)) return newLogoPath;
  const candidates = [
    path.join(process.cwd(), "logo.png"),
    path.join(__dirname, "../logo.png"),
    path.join(process.cwd(), "assets/logo.png"),
    path.join(__dirname, "../assets/logo.png")
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.join(process.cwd(), "logo.png");
};

const resolveTrayIconPath = (): string => {
  const candidates = [
    path.join(__dirname, "../assets/tray-icon-32.png"),
    path.join(process.cwd(), "assets/tray-icon-32.png"),
    path.join(__dirname, "../assets/tray-icon.png"),
    path.join(process.cwd(), "assets/tray-icon.png"),
    resolveLogoPath()
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return resolveLogoPath();
};

const trayIcon = (): Electron.NativeImage => {
  const iconPath = resolveTrayIconPath();
  if (fs.existsSync(iconPath)) {
    try {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        return img.resize({ width: 32, height: 32, quality: "best" });
      }
    } catch (err) {
      log("[trayIcon] Error loading tray icon:", err);
    }
  }
  return nativeImage.createEmpty();
};

const updateTrayMenu = () => {
  if (!tray) return;
  const visible = !hidden && Boolean(mainWindow?.isVisible());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Islet", enabled: !visible, click: () => showIslet("tray-menu-show") },
      { label: "Hide Islet", enabled: visible, click: () => hideIslet("tray-menu-hide") },
      { type: "separator" },
      {
        label: "Start with Windows",
        type: "checkbox",
        checked: getStartupStatus(),
        click: (item) => applyStartupSetting(item.checked)
      },
      {
        label: "Settings",
        click: () => {
          showIslet("tray-settings");
          mainWindow?.webContents.send("settings:open");
        }
      },
      {
        label: "Reset to top-center",
        click: () => {
          const display = getActiveDisplay();
          const position = defaultTopCenterPosition(display);
          currentAnchor = position;
          mainWindow?.setBounds({ ...position, width: WIN_WIDTH, height: COLLAPSED_WIN_HEIGHT });
          persistPosition(position);
          showIslet("tray-reset");
        }
      },
      { type: "separator" },
      { label: "Quit Islet", click: () => app.quit() }
    ])
  );
};

const createTray = () => {
  tray = new Tray(trayIcon());
  tray.setToolTip("Islet — Dynamic Island for Windows");
  tray.on("click", handleGlobalHotkey);
  updateTrayMenu();
};

const createWindow = () => {
  const display = getActiveDisplay();
  const position = defaultTopCenterPosition(display);
  currentAnchor = position;

  log(
    `[createWindow] Creating BrowserWindow: initial bounds=${JSON.stringify({
      ...position,
      width: WIN_WIDTH,
      height: COLLAPSED_WIN_HEIGHT
    })}`
  );

  mainWindow = new BrowserWindow({
    ...position,
    width: WIN_WIDTH,
    height: COLLAPSED_WIN_HEIGHT,
    icon: resolveLogoPath(),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.on("blur", () => {
    if (!hidden && settings.closeOnBlur && expanded) {
      mainWindow?.webContents.send("window:blurred");
    }
  });

  mainWindow.on("show", updateTrayMenu);
  mainWindow.on("hide", updateTrayMenu);
  mainWindow.on("closed", () => {
    log("[main] Window closed event");
    mainWindow = null;
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    log(
      `[Renderer ERROR] did-fail-load (code=${errorCode}, isMainFrame=${isMainFrame}): ${errorDescription} [${validatedURL}]`
    );
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    rendererReady = false;
    log(`[Renderer CRASH] process exited: reason="${details.reason}", exitCode=${details.exitCode}`);
    mainWindow?.webContents.send("renderer:error", `Renderer exited: ${details.reason}`);
    mainWindow?.hide();
  });

  mainWindow.webContents.on("unresponsive", () => log("[Renderer WARNING] became unresponsive"));
  mainWindow.webContents.on("responsive", () => log("[Renderer INFO] became responsive"));

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    log(`[Renderer Console lvl=${level}] ${sourceId}:${line} -> ${message}`);
  });

  const loadPromise = process.env.VITE_DEV_SERVER_URL
    ? mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    : mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));

  void loadPromise.catch((error) => {
    rendererReady = false;
    log("[Renderer ERROR] load URL/file rejected:", error);
    mainWindow?.hide();
  });

  mainWindow.webContents.once("did-finish-load", () => {
    rendererReady = true;
    log("[main] Renderer did-finish-load complete.");
    const current = mediaService.getCurrentMedia();
    log(`[main] Media state on did-finish-load: ${current ? `"${current.title}" (${current.status})` : "null"}`);
    if (current) {
      mainWindow?.webContents.send("media:changed", current);
    }
    if (!hidden) {
      showIslet("startup-ready");
    }
  });
};

const registerWindowIpc = () => {
  ipcMain.handle("window:set-expanded", (_event, value: boolean, customHeight?: number) => {
    if (!rendererReady || hidden) return false;
    cancelCollapse();
    if (value) {
      expanded = true;
      log(`[IPC:window:set-expanded] Setting expanded: true, height: ${customHeight}`);
      mediaService.setInteractive(true);
      resizeToExpanded(customHeight);
      mainWindow?.webContents.send("window:expanded");
    } else {
      if (expanded) {
        requestCollapse();
      }
    }
    return expanded;
  });

  ipcMain.handle("window:get-state", () => ({ expanded }));

  ipcMain.handle("window:begin-drag", () => {});

  ipcMain.handle("window:move-drag", () => {});

  ipcMain.handle("window:end-drag", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { x: 0, y: 0 };
    const display = getActiveDisplay();
    const pos = defaultTopCenterPosition(display);
    currentAnchor = pos;
    try {
      mainWindow.setPosition(pos.x, pos.y);
    } catch (err) {
      log("[window:end-drag] setPosition error:", err);
    }
    return pos;
  });

  ipcMain.handle("window:collapse", () => {
    mediaService.setInteractive(false);
    requestCollapse();
    return true;
  });

  ipcMain.handle("window:finish-collapse", () => {
    cancelCollapse();
    expanded = false;
    mediaService.setInteractive(false);
    resizeToCollapsed();
    return false;
  });

  ipcMain.on("window:set-ignore-mouse-events", (_event, ignore: boolean, options?: { forward: boolean }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.setIgnoreMouseEvents(ignore, options);
    } catch (err) {
      log("[setIgnoreMouseEvents] error:", err);
    }
  });
};

const getRealCurrentWeek = (): CalendarWeek => {
  const now = new Date();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonth = monthNames[now.getMonth()];
  const currentDayOfWeek = now.getDay();

  const sunday = new Date(now);
  sunday.setDate(now.getDate() - currentDayOfWeek);

  const weekdayLetters = ["S", "M", "T", "W", "T", "F", "S"];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    days.push({
      weekday: weekdayLetters[i],
      date: d.getDate(),
      isToday: d.toDateString() === now.toDateString(),
      hasEvent: i === 2 || i === 4
    });
  }

  return {
    month: currentMonth,
    days,
    events: [
      { id: "e1", title: "Product Architecture Review", startsAt: "14:30", endsAt: "15:15", location: "Teams", source: "local" }
    ]
  };
};

const registerIpc = () => {
  registerWindowIpc();

  ipcMain.handle("window:set-tab", (_event, tab: Tab) => tab);
  ipcMain.handle("settings:get", () => ({ ...settings, startWithWindows: getStartupStatus() }));
  ipcMain.handle("settings:get-startup-status", getStartupStatus);
  ipcMain.handle("settings:update", (_event, patch: Partial<Settings>) => {
    settings = { ...settings, ...patch };
    if (patch.startWithWindows !== undefined) applyStartupSetting(patch.startWithWindows);
    if (patch.hotkey !== undefined) registerGlobalHotkey();
    saveSettings();
    return { ...settings, startWithWindows: getStartupStatus() };
  });

  ipcMain.handle("media:get-state", () => {
    const current = mediaService.getCurrentMedia();
    log(`[IPC:media:get-state] Returning: ${current ? `"${current.title}" (${current.status})` : "null"}`);
    return current;
  });

  ipcMain.handle("media:play-pause", () => {
    log("[IPC:media:play-pause] Dispatching play-pause command");
    mediaService.sendCommand("play-pause");
    return mediaService.getCurrentMedia();
  });

  ipcMain.handle("media:next", () => {
    log("[IPC:media:next] Dispatching next command");
    mediaService.sendCommand("next");
    return mediaService.getCurrentMedia();
  });

  ipcMain.handle("media:previous", () => {
    log("[IPC:media:previous] Dispatching previous command");
    mediaService.sendCommand("previous");
    return mediaService.getCurrentMedia();
  });

  ipcMain.handle("media:seek", (_event, positionMs: number) => {
    log(`[IPC:media:seek] Position requested: ${positionMs}`);
    mediaService.seek(positionMs);
    return mediaService.getCurrentMedia();
  });

  ipcMain.handle("media:set-volume", (_event, volumePercent: number) => {
    mediaService.setVolume(volumePercent);
  });

  ipcMain.handle("media:get-volume", () => {
    return mediaService.getVolume();
  });

  ipcMain.handle("media:volume-up", () => {
    mediaService.sendCommand("volume-up");
  });

  ipcMain.handle("media:volume-down", () => {
    mediaService.sendCommand("volume-down");
  });

  ipcMain.handle("media:volume-mute", () => {
    mediaService.sendCommand("volume-mute");
  });

  ipcMain.handle("tasks:list", () => placeholderTasks);
  ipcMain.handle("tasks:create", (_event, input: { title: string; dueAt?: string; link?: string }) => {
    const task: Task = { id: Date.now(), ...input, completed: false };
    placeholderTasks.unshift(task);
    return task;
  });
  ipcMain.handle("tasks:complete", (_event, id: number) => {
    const task = placeholderTasks.find((item) => item.id === id);
    if (task) task.completed = !task.completed;
    return placeholderTasks;
  });
  ipcMain.handle("tasks:remove", (_event, id: number) => {
    const index = placeholderTasks.findIndex((item) => item.id === id);
    if (index >= 0) placeholderTasks.splice(index, 1);
    return placeholderTasks;
  });
  ipcMain.handle("tasks:capture-from-clipboard", () => {
    let text = "";
    try {
      text = clipboard.readText().trim();
    } catch {
      // fallback
    }
    const title = text
      ? (text.length > 40 ? text.slice(0, 37) + "..." : text)
      : "Quick clipboard task";
    const isUrl = text.startsWith("http://") || text.startsWith("https://") || text.includes(".com");
    const task: Task = {
      id: Date.now(),
      title,
      dueAt: "Today",
      link: isUrl ? text.replace(/^https?:\/\//, "").slice(0, 25) : undefined,
      completed: false
    };
    placeholderTasks.unshift(task);
    return task;
  });

  ipcMain.handle("clipboard:list", () => {
    let text = "";
    try {
      text = clipboard.readText().trim();
    } catch {
      // fallback
    }
    if (!text) return [];
    return [
      {
        id: 1,
        kind: "text" as const,
        preview: text.length > 50 ? text.slice(0, 47) + "..." : text,
        pinned: true,
        createdAt: "Now",
        sourceApp: "Windows Clipboard"
      }
    ];
  });
  ipcMain.handle("clipboard:copy", () => undefined);
  ipcMain.handle("clipboard:pin", () => undefined);
  ipcMain.handle("clipboard:remove", () => undefined);
  ipcMain.handle("clipboard:clear", () => undefined);

  ipcMain.handle("timers:list", () => []);
  ipcMain.handle("timers:create", () => ({ id: String(Date.now()), kind: "countdown", state: "paused", remainingMs: 0 }));
  ipcMain.handle("timers:pause", () => undefined);
  ipcMain.handle("timers:resume", () => undefined);
  ipcMain.handle("timers:cancel", () => undefined);

  ipcMain.handle("calendar:get-week", (): CalendarWeek => getRealCurrentWeek());
  ipcMain.handle("calendar:refresh", () => undefined);
  ipcMain.handle("calendar:create-event", (_event, input: Omit<CalendarEvent, "id" | "source">) => ({
    id: crypto.randomUUID(),
    ...input,
    source: "local"
  }));
  ipcMain.handle("calendar:remove-event", () => undefined);

  // Shelf Image Caching, Native Drag & Drop, and OS Clipboard Copy
  const resolveShelfCacheDir = (): string => {
    const appData =
      process.env.APPDATA ||
      (process.platform === "win32" ? path.join(os.homedir(), "AppData", "Roaming") : os.homedir());
    const shelfDir = path.join(appData, "islet", "shelf");
    try {
      fs.mkdirSync(shelfDir, { recursive: true });
    } catch {
      // ignore
    }
    return shelfDir;
  };

  ipcMain.handle(
    "shelf:save-image",
    async (_event, { name, buffer, originalPath }: { name: string; buffer: ArrayBuffer; originalPath?: string }) => {
      try {
        if (originalPath && fs.existsSync(originalPath)) {
          return { filePath: originalPath };
        }
        const shelfDir = resolveShelfCacheDir();
        const safeName = `${Date.now()}_${(name || "image.png").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const targetPath = path.join(shelfDir, safeName);
        fs.writeFileSync(targetPath, Buffer.from(buffer));
        log(`[shelf:save-image] Cached temporary image to disk: ${targetPath}`);
        return { filePath: targetPath };
      } catch (err) {
        log("[shelf:save-image] Failed to cache image:", err);
        return { filePath: originalPath || "" };
      }
    }
  );

  ipcMain.handle(
    "shelf:copy-image",
    async (_event, { filePath, dataUrl }: { filePath?: string; dataUrl?: string }) => {
      try {
        if (filePath && fs.existsSync(filePath)) {
          const img = nativeImage.createFromPath(filePath);
          if (!img.isEmpty()) {
            clipboard.writeImage(img);
            log(`[shelf:copy-image] Copied image from path to OS clipboard: ${filePath}`);
            return true;
          }
        }
        if (dataUrl) {
          const img = nativeImage.createFromDataURL(dataUrl);
          if (!img.isEmpty()) {
            clipboard.writeImage(img);
            log("[shelf:copy-image] Copied image from dataUrl to OS clipboard");
            return true;
          }
        }
      } catch (err) {
        log("[shelf:copy-image] Failed to copy image to clipboard:", err);
      }
      return false;
    }
  );

  ipcMain.on("shelf:start-drag", (event, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) {
      log(`[shelf:start-drag] File does not exist for drag: ${filePath}`);
      return;
    }
    try {
      let icon = nativeImage.createFromPath(filePath);
      if (!icon.isEmpty()) {
        icon = icon.resize({ width: 64, height: 64 });
      } else {
        icon = nativeImage.createEmpty();
      }
      event.sender.startDrag({
        file: filePath,
        icon
      });
      log(`[shelf:start-drag] Initiated native Windows file drag: ${filePath}`);
    } catch (err) {
      log("[shelf:start-drag] Error starting native drag:", err);
    }
  });

  ipcMain.handle("screentime:get", async () => {
    return screenTimeService.getScreenTimeData();
  });
};

app.whenReady().then(() => {
  if (!singleInstance) {
    app.quit();
    return;
  }
  log("Islet starting");
  settings = loadSettings();
  if (settings.startWithWindows === undefined) settings.startWithWindows = true;

  registerIpc();

  // Resilient artwork protocol handler
  protocol.handle("islet-art", (request) => {
    try {
      const url = new URL(request.url);
      log(`[protocol:islet-art] Handling request: ${request.url}`);
      const rawName = url.pathname.replace(/^\/+/, "") || url.hostname || url.host;
      const fileName = decodeURIComponent(rawName);

      if (fileName.includes("live-artwork") || fileName.includes("current-art")) {
        const livePath = mediaService.getCurrentArtworkPath();
        log(`[protocol:islet-art] Resolved live artwork path: "${livePath}"`);
        if (livePath && fs.existsSync(livePath) && fs.statSync(livePath).isFile()) {
          const data = fs.readFileSync(livePath);
          log(`[protocol:islet-art] Serving live artwork: ${data.length} bytes`);
          return new Response(data, {
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-cache",
              "Access-Control-Allow-Origin": "*"
            }
          });
        } else {
          log(`[protocol:islet-art] livePath not found or not file: ${livePath}`);
        }
      }

      if (!fileName || fileName === "/" || fileName === ".") {
        return new Response("Invalid artwork request", { status: 400 });
      }

      const filePath = path.join(__dirname, "../assets/artwork", fileName);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: {
            "Content-Type": fileName.endsWith(".svg") ? "image/svg+xml" : "image/png",
            "Cache-Control": "public, max-age=3600",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    } catch (err) {
      log("Failed to serve artwork:", err);
    }
    return new Response("Artwork not found", { status: 404 });
  });

  createWindow();
  reconcileStartupSetting();
  registerGlobalHotkey();
  createTray();

  // Start real Windows GSMTC media monitoring
  mediaService.start();

  mediaService.onMediaChanged((media) => {
    log(
      `[main:onMediaChanged] media=${media ? `"${media.title}" (${media.status})` : "null"}, rendererReady=${rendererReady}, windowVisible=${mainWindow?.isVisible() ?? false
      }, hidden=${hidden}`
    );

    if (rendererReady && mainWindow) {
      log(`[main:IPC] Sending media:changed to renderer: ${media ? `"${media.title}"` : "null"}`);
      mainWindow.webContents.send("media:changed", media);
    }

    if (media) {
      if (media.status === "playing") {
        if (hidden || !mainWindow?.isVisible()) {
          showIslet("media-playing");
        }
      } else if (media.status === "paused") {
        if (hidden || !mainWindow?.isVisible()) {
          showIslet("media-paused");
        }
      }
    }
    // Note: When media stops, do NOT hide the window! The island smoothly shows the Idle Time/Day/Weather notch.
  });
});

app.on("second-instance", () => {
  log("Second instance request received");
  showIslet("second-instance");
});

app.on("will-quit", () => {
  mediaService.stop();
  screenTimeService.destroy();
  globalShortcut.unregisterAll();
  tray?.destroy();
  log("Islet quitting");
});
