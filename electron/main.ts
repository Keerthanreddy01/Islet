import { app, BrowserWindow, globalShortcut, ipcMain, net, protocol, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CalendarEvent, CalendarWeek, MediaState, Settings, Tab, Task } from "./ipc.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([
  { scheme: "islet-art", privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
]);
let mainWindow: BrowserWindow | null = null;
let expanded = true;

const placeholderMedia: MediaState = {
  status: "playing",
  title: "Cocoon",
  album: "Vespertine",
  artist: "Björk",
  source: "apple-music",
  artworkUrl: "islet-art://placeholder.svg",
  positionMs: 48_000,
  durationMs: 262_000
};

const placeholderTasks: Task[] = [
  { id: 1, title: "Choose icon", dueAt: "16:00", link: "link", completed: false },
  { id: 2, title: "Check designs", dueAt: "17:30", link: "link", completed: false },
  { id: 3, title: "Inspect figma file", dueAt: "18:00", link: "link", completed: false }
];

const createWindow = () => {
  const display = screen.getPrimaryDisplay();
  const width = 1000;
  mainWindow = new BrowserWindow({
    width,
    height: 390,
    x: Math.round(display.bounds.x + (display.bounds.width - width) / 2),
    y: display.bounds.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
};

const registerIpc = () => {
  ipcMain.handle("window:set-expanded", (_event, value: boolean) => {
    expanded = value;
    return expanded;
  });
  ipcMain.handle("window:set-tab", (_event, tab: Tab) => tab);
  ipcMain.handle("settings:get", (): Settings => ({ hotkey: "Ctrl+Alt+Space", monitor: "active", accentColor: "#0a84ff", animations: true }));
  ipcMain.handle("settings:update", (_event, patch: Partial<Settings>) => ({ hotkey: "Ctrl+Alt+Space", monitor: "active", accentColor: "#0a84ff", animations: true, ...patch }));
  ipcMain.handle("media:get-state", () => placeholderMedia);
  ipcMain.handle("media:play-pause", () => undefined);
  ipcMain.handle("media:next", () => undefined);
  ipcMain.handle("media:previous", () => undefined);
  ipcMain.handle("media:seek", () => undefined);
  ipcMain.handle("tasks:list", () => placeholderTasks);
  ipcMain.handle("tasks:create", (_event, input: { title: string; dueAt?: string; link?: string }) => ({ id: Date.now(), ...input, completed: false }));
  ipcMain.handle("tasks:complete", (_event, id: number) => { const task = placeholderTasks.find((item) => item.id === id); if (task) task.completed = true; });
  ipcMain.handle("tasks:remove", (_event, id: number) => { const index = placeholderTasks.findIndex((item) => item.id === id); if (index >= 0) placeholderTasks.splice(index, 1); });
  ipcMain.handle("tasks:capture-from-clipboard", () => ({ id: Date.now(), title: "Captured clipboard item", completed: false }));
  ipcMain.handle("clipboard:list", () => []);
  ipcMain.handle("clipboard:copy", () => undefined);
  ipcMain.handle("clipboard:pin", () => undefined);
  ipcMain.handle("clipboard:remove", () => undefined);
  ipcMain.handle("clipboard:clear", () => undefined);
  ipcMain.handle("timers:list", () => []);
  ipcMain.handle("timers:create", () => ({ id: String(Date.now()), kind: "countdown", state: "paused", remainingMs: 0 }));
  ipcMain.handle("timers:pause", () => undefined);
  ipcMain.handle("timers:resume", () => undefined);
  ipcMain.handle("timers:cancel", () => undefined);
  ipcMain.handle("calendar:get-week", (): CalendarWeek => ({
    month: "Jul",
    days: [
      { weekday: "S", date: 13, isToday: false, hasEvent: false },
      { weekday: "M", date: 14, isToday: false, hasEvent: false },
      { weekday: "T", date: 15, isToday: false, hasEvent: true },
      { weekday: "T", date: 16, isToday: true, hasEvent: false },
      { weekday: "W", date: 17, isToday: false, hasEvent: false },
      { weekday: "T", date: 18, isToday: false, hasEvent: false },
      { weekday: "F", date: 19, isToday: false, hasEvent: false }
    ],
    events: []
  }));
  ipcMain.handle("calendar:refresh", () => undefined);
  ipcMain.handle("calendar:create-event", (_event, input: Omit<CalendarEvent, "id" | "source">) => ({ id: crypto.randomUUID(), ...input, source: "local" }));
  ipcMain.handle("calendar:remove-event", () => undefined);
};

app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  registerIpc();
  protocol.handle("islet-art", (request) => {
    const fileName = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
    if (fileName !== "placeholder.svg") {
      return new Response("Artwork not found", { status: 404 });
    }
    return net.fetch(`file://${path.join(__dirname, "../assets/artwork", fileName)}`);
  });
  createWindow();
  globalShortcut.register("CommandOrControl+Alt+Space", () => {
    expanded = !expanded;
    mainWindow?.webContents.send("window:toggle-expanded", expanded);
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
