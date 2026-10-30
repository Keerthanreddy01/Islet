export type Tab = "nook" | "tray";

export type MediaState = {
  status: "playing" | "paused" | "stopped";
  title: string;
  artist: string;
  album?: string;
  source: "spotify" | "youtube" | "apple-music" | "browser" | "vlc" | "generic";
  artworkUrl?: string;
  positionMs: number;
  durationMs: number;
  lastUpdatedMs?: number;
  volume?: number; // 0 to 100
  isMuted?: boolean;
};

export type AgentStatus =
  | "idle"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export type AgentId = "antigravity" | "claude" | "codex" | "chatgpt" | "custom";

export interface AgentActivityItem {
  id: string;
  agentId: AgentId;
  agentName: string;
  taskTitle: string;
  status: AgentStatus;
  statusText?: string;
  activeTool?: string;
  activityText?: string;
  startedAt?: number;
  completedAt?: number;
  lastUpdatedAt: number;
  progress?: number;
  confidence: number;
  source: string;
  cwd?: string;
}

export interface AgentState {
  agents: AgentActivityItem[];
  activeAgent: AgentActivityItem | null;
  primaryMode: "agent" | "spotify";
}

export type ScreenTimeDay = {
  day: string; // e.g. "WED", "THU", "FRI"
  date: string; // "2026-10-23"
  minutes: number;
  formattedTime: string; // "6h 01m"
  isToday: boolean;
  isUntracked?: boolean;
};

export type ScreenTimeData = {
  todayMinutes: number;
  todayFormatted: string; // "6h 01m"
  deltaMinutes: number;
  deltaFormatted: string | null; // e.g. "-12m" or "+45m" or null if first day
  deltaLabel?: string; // "vs yesterday at this time"
  isAboveAverage: boolean;
  averageMinutes: number;
  averageFormatted: string; // "10H 38M"
  days: ScreenTimeDay[]; // 7-day period
  maxScaleHours: number;
  avgPercent: number; // 0-100%
  topApps?: Array<{ name: string; minutes: number }>;
};

export type Timer = {
  id: string;
  kind: "countdown" | "stopwatch" | "pomodoro";
  state: "running" | "paused" | "finished";
  label?: string;
  remainingMs?: number;
  elapsedMs?: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  source: "local" | "ics";
};

export type CalendarWeek = {
  month: string;
  days: Array<{ weekday: string; date: number; isToday: boolean; hasEvent: boolean }>;
  events: CalendarEvent[];
};

export type Task = {
  id: number;
  title: string;
  dueAt?: string;
  link?: string;
  completed: boolean;
  thumbnailPath?: string;
};

export type ClipboardItem = {
  id: number;
  kind: "text" | "link" | "image";
  preview: string;
  thumbnailPath?: string;
  pinned: boolean;
  createdAt: string;
  sourceApp?: string;
};

export type IslandTheme =
  | "midnight"
  | "graphite"
  | "ocean"
  | "emerald"
  | "rose"
  | "lavender"
  | "sunset"
  | "arctic";

export type CompletedIndicatorMode = "brief" | "persistent";

export type Settings = {
  hotkey: string;
  monitor: "active" | string;
  theme: IslandTheme;
  accentColor: string;
  islandOpacity: number;
  animations: boolean;
  expandOnHover: boolean;
  notchMode: boolean;
  snapToEdge: boolean;
  iconSize: number;
  closeOnBlur: boolean;
  startWithWindows: boolean;
  launchMinimized: boolean;
  showAgentIndicators: boolean;
  compactTaskDescription: boolean;
  completedIndicatorDuration: CompletedIndicatorMode;
  showSpotifyIndicator: boolean;
  positions: Record<string, WindowPosition>;
};

export type WindowPosition = {
  x: number;
  y: number;
};

export type WindowDragPoint = {
  screenX: number;
  screenY: number;
};

export type CreateTaskInput = {
  title: string;
  dueAt?: string;
  link?: string;
};

export type CreateTimerInput = {
  kind: Timer["kind"];
  durationMs?: number;
  label?: string;
};

export type CreateCalendarEventInput = Omit<CalendarEvent, "id" | "source">;

export type IsletApi = {
  window: {
    setExpanded(expanded: boolean, height?: number): Promise<void>;
    getState(): Promise<{ expanded: boolean }>;
    beginDrag(point: WindowDragPoint): Promise<void>;
    moveDrag(point: WindowDragPoint): Promise<void>;
    endDrag(): Promise<WindowPosition>;
    collapse(): Promise<void>;
    finishCollapse(): Promise<void>;
    setCollapsedHeight?(height: number): Promise<void>;
    onExpanded(listener: () => void): () => void;
    onStartCollapse(listener: () => void): () => void;
    onBlurred(listener: () => void): () => void;
    onShown(listener: () => void): () => void;
    onHidden(listener: () => void): () => void;
    onRendererError(listener: (message: string) => void): () => void;
    setActiveTab(tab: Tab): Promise<void>;
    getSettings(): Promise<Settings>;
    setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
  };
  media: {
    getState(): Promise<MediaState | null>;
    subscribe(listener: (state: MediaState | null) => void): () => void;
    playPause(): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    setVolume(volumePercent: number): Promise<void>;
    getVolume(): Promise<{ volume: number; isMuted: boolean }>;
    volumeUp(): Promise<void>;
    volumeDown(): Promise<void>;
    volumeMute(): Promise<void>;
  };
  tasks: {
    list(): Promise<Task[]>;
    create(input: CreateTaskInput): Promise<Task>;
    complete(id: number): Promise<void>;
    remove(id: number): Promise<void>;
    captureFromClipboard(): Promise<Task>;
  };
  clipboard: {
    list(query?: string): Promise<ClipboardItem[]>;
    copy(id: number): Promise<void>;
    pin(id: number, pinned: boolean): Promise<void>;
    remove(id: number): Promise<void>;
    clear(): Promise<void>;
    subscribe(listener: (item: ClipboardItem) => void): () => void;
  };
  timers: {
    list(): Promise<Timer[]>;
    create(input: CreateTimerInput): Promise<Timer>;
    pause(id: string): Promise<void>;
    resume(id: string): Promise<void>;
    cancel(id: string): Promise<void>;
    subscribe(listener: (timer: Timer) => void): () => void;
  };
  calendar: {
    getWeek(): Promise<CalendarWeek>;
    refresh(): Promise<void>;
    createEvent(input: CreateCalendarEventInput): Promise<CalendarEvent>;
    removeEvent(id: string): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: Partial<Settings>): Promise<Settings>;
    setHotkey(hotkey: string): Promise<{ success: boolean; hotkey: string; error?: string }>;
    getStartupStatus(): Promise<boolean>;
    restoreDefaults(): Promise<Settings>;
  };
  shelf: {
    getPathForFile(file: File): string;
    saveTempImage(name: string, buffer: ArrayBuffer, originalPath?: string): Promise<{ filePath: string }>;
    copyImage(filePath?: string, dataUrl?: string): Promise<boolean>;
    startDrag(filePath: string): void;
  };
  screentime: {
    get(): Promise<ScreenTimeData>;
  };
  agents: {
    getState(): Promise<AgentState>;
    subscribe(listener: (state: AgentState) => void): () => void;
    setPrimaryMode(mode: "agent" | "spotify"): Promise<void>;
    swapPrimary(): Promise<AgentState>;
  };
};
