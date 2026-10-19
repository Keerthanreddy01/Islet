import { app, BrowserWindow, globalShortcut, ipcMain, net, protocol, screen } from "electron";
import fs from "node:fs";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([
  { scheme: "islet-art", privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
]);

const COLLAPSED_SIZE = 64;
const EXPANDED_SIZE = { width: 680, height: 300 };
const EDGE_MARGIN = 12;
const SETTINGS_FILE = "settings.json";

let mainWindow: BrowserWindow | null = null;
let expanded = false;
let dragOffset = { x: 0, y: 0 };
let collapseTimer: NodeJS.Timeout | null = null;
let settings: Settings;

const defaultSettings: Settings = {
  hotkey: "Ctrl+Alt+Space",
  monitor: "active",
  accentColor: "#0a84ff",
  animations: true,
  expandOnHover: false,
  notchMode: false,
  snapToEdge: true,
  iconSize: 64,
  closeOnBlur: true,
  positions: {}
};

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

const settingsPath = () => path.join(app.getPath("userData"), SETTINGS_FILE);

const loadSettings = () => {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    return { ...defaultSettings, ...JSON.parse(raw) } as Settings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Unable to load Islet settings:", error);
    }
    return { ...defaultSettings };
  }
};

const saveSettings = () => {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("Unable to save Islet settings:", error);
  }
};

const displayForPosition = (position: WindowPosition) =>
  screen.getAllDisplays().find((display) => {
    const area = display.workArea;
    return position.x >= area.x && position.x <= area.x + area.width && position.y >= area.y && position.y <= area.y + area.height;
  }) ?? screen.getPrimaryDisplay();

const clampPosition = (position: WindowPosition, width: number, height: number, display = displayForPosition(position)) => {
  const area = display.workArea;
  return {
    x: Math.max(area.x, Math.min(position.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(position.y, area.y + area.height - height))
  };
};

const positionKey = (display: Electron.Display) => String(display.id);

const defaultPosition = (): WindowPosition => {
  const display = screen.getPrimaryDisplay();
  const saved = settings.positions[positionKey(display)];
  return saved ? clampPosition(saved, COLLAPSED_SIZE, COLLAPSED_SIZE, display) : {
    x: Math.round(display.workArea.x + (display.workArea.width - COLLAPSED_SIZE) / 2),
    y: display.workArea.y + EDGE_MARGIN
  };
};

const persistPosition = (position: WindowPosition) => {
  const display = displayForPosition(position);
  settings.positions[positionKey(display)] = clampPosition(position, COLLAPSED_SIZE, COLLAPSED_SIZE, display);
  saveSettings();
};

const snapPosition = (position: WindowPosition): WindowPosition => {
  const display = displayForPosition(position);
  const area = display.workArea;
  const maxX = area.x + area.width - COLLAPSED_SIZE;
  const maxY = area.y + area.height - COLLAPSED_SIZE;
  const distances = [
    { edge: "left", distance: Math.abs(position.x - (area.x + EDGE_MARGIN)), value: { x: area.x + EDGE_MARGIN, y: position.y } },
    { edge: "right", distance: Math.abs(position.x - (maxX - EDGE_MARGIN)), value: { x: maxX - EDGE_MARGIN, y: position.y } },
    { edge: "top", distance: Math.abs(position.y - (area.y + EDGE_MARGIN)), value: { x: position.x, y: area.y + EDGE_MARGIN } },
    { edge: "bottom", distance: Math.abs(position.y - (maxY - EDGE_MARGIN)), value: { x: position.x, y: maxY - EDGE_MARGIN } }
  ];
  const nearest = distances.sort((a, b) => a.distance - b.distance)[0];
  return clampPosition(nearest.value, COLLAPSED_SIZE, COLLAPSED_SIZE, display);
};

const animateSnap = (from: WindowPosition, to: WindowPosition) => {
  if (!mainWindow || !settings.snapToEdge) {
    persistPosition(to);
    return;
  }
  const startedAt = Date.now();
  const duration = 200;
  const tick = () => {
    if (!mainWindow) return;
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    mainWindow.setPosition(
      Math.round(from.x + (to.x - from.x) * eased),
      Math.round(from.y + (to.y - from.y) * eased)
    );
    if (progress < 1) {
      setTimeout(tick, 16);
    } else {
      persistPosition(to);
    }
  };
  tick();
};

const expandedBoundsForAnchor = (anchor: WindowPosition) => {
  const display = displayForPosition(anchor);
  const area = display.workArea;
  const centeredX = anchor.x + COLLAPSED_SIZE / 2 - EXPANDED_SIZE.width / 2;
  const belowY = anchor.y;
  const aboveY = anchor.y + COLLAPSED_SIZE - EXPANDED_SIZE.height;
  const y = belowY + EXPANDED_SIZE.height <= area.y + area.height ? belowY : aboveY;
  return clampPosition({ x: centeredX, y }, EXPANDED_SIZE.width, EXPANDED_SIZE.height, display);
};

const resizeToExpanded = () => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const bounds = expandedBoundsForAnchor({ x, y });
  mainWindow.setBounds({ ...bounds, ...EXPANDED_SIZE });
  mainWindow.showInactive();
};

const resizeToCollapsed = () => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  const anchor = {
    x: x + Math.round((EXPANDED_SIZE.width - COLLAPSED_SIZE) / 2),
    y: y
  };
  const position = clampPosition(anchor, COLLAPSED_SIZE, COLLAPSED_SIZE);
  mainWindow.setBounds({ ...position, width: COLLAPSED_SIZE, height: COLLAPSED_SIZE });
  persistPosition(position);
  mainWindow.showInactive();
};

const requestCollapse = () => {
  if (!expanded || !mainWindow) return;
  mainWindow.webContents.send("window:start-collapse");
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    if (expanded) {
      expanded = false;
      resizeToCollapsed();
    }
    collapseTimer = null;
  }, 320);
};

const createWindow = () => {
  const position = defaultPosition();
  mainWindow = new BrowserWindow({
    ...position,
    width: COLLAPSED_SIZE,
    height: COLLAPSED_SIZE,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.on("blur", () => {
    if (settings.closeOnBlur && expanded) mainWindow?.webContents.send("window:blurred");
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  if (process.env.VITE_DEV_SERVER_URL) void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  mainWindow.once("ready-to-show", () => mainWindow?.showInactive());
};

const registerWindowIpc = () => {
  ipcMain.handle("window:set-expanded", (_event, value: boolean) => {
    if (value === expanded) return expanded;
    expanded = value;
    if (expanded) resizeToExpanded();
    else resizeToCollapsed();
    return expanded;
  });
  ipcMain.handle("window:get-state", () => ({ expanded }));
  ipcMain.handle("window:begin-drag", (_event, point: WindowDragPoint) => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    dragOffset = { x: point.screenX - x, y: point.screenY - y };
  });
  ipcMain.handle("window:move-drag", (_event, point: WindowDragPoint) => {
    if (!mainWindow) return;
    mainWindow.setPosition(Math.round(point.screenX - dragOffset.x), Math.round(point.screenY - dragOffset.y));
  });
  ipcMain.handle("window:end-drag", () => {
    if (!mainWindow) return { x: 0, y: 0 };
    const [x, y] = mainWindow.getPosition();
    const snapped = snapPosition({ x, y });
    animateSnap({ x, y }, snapped);
    return snapped;
  });
  ipcMain.handle("window:collapse", () => {
    requestCollapse();
    return true;
  });
  ipcMain.handle("window:finish-collapse", () => {
    if (collapseTimer) clearTimeout(collapseTimer);
    collapseTimer = null;
    expanded = false;
    resizeToCollapsed();
    return false;
  });
};

const registerIpc = () => {
  registerWindowIpc();
  ipcMain.handle("window:set-tab", (_event, tab: Tab) => tab);
  ipcMain.handle("settings:get", () => settings);
  ipcMain.handle("settings:update", (_event, patch: Partial<Settings>) => {
    settings = { ...settings, ...patch };
    saveSettings();
    return settings;
  });
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
  settings = loadSettings();
  registerIpc();
  protocol.handle("islet-art", (request) => {
    const fileName = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
    if (fileName !== "placeholder.svg") return new Response("Artwork not found", { status: 404 });
    return net.fetch(`file://${path.join(__dirname, "../assets/artwork", fileName)}`);
  });
  createWindow();
  globalShortcut.register("CommandOrControl+Alt+Space", () => {
    if (expanded) requestCollapse();
    else {
      expanded = true;
      resizeToExpanded();
      mainWindow?.webContents.send("window:expanded");
    }
  });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
