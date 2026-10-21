import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { MediaState } from "../electron/ipc";

const artworkMemoryCache = new Map<string, string>();

function cleanTrackTitle(title: string): string {
  return (title || "")
    .replace(/\s*[\(\[](official\s*(music\s*)?(video|audio)|lyrics?|visualizer|feat\.?|ft\.?|remix|hd|4k|prod\.?).*?[\)\]]/gi, "")
    .replace(/\s*[\(\[].*?beat.*?[\)\]]/gi, "")
    .replace(/^.+?\s*-\s*/, "") // Strip "Artist - " prefix
    .trim();
}

function cleanArtistName(artist: string): string {
  return (artist || "").split(/[,&/]|feat\.?|ft\.?/i)[0].trim();
}

async function fetchOnlineArtwork(title: string, artist: string): Promise<string | null> {
  const cTitle = cleanTrackTitle(title);
  const cArtist = cleanArtistName(artist);
  if (!cTitle) return null;

  const cacheKey = `${cTitle.toLowerCase()}:::${cArtist.toLowerCase()}`;
  if (artworkMemoryCache.has(cacheKey)) {
    return artworkMemoryCache.get(cacheKey)!;
  }

  try {
    const saved = sessionStorage.getItem(`art_${cacheKey}`);
    if (saved) {
      artworkMemoryCache.set(cacheKey, saved);
      return saved;
    }
  } catch {}

  try {
    // 1. Search clean title + artist
    let query = encodeURIComponent(`${cTitle} ${cArtist}`.trim());
    let res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
    let data = await res.json();
    if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
      const art = data.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
      artworkMemoryCache.set(cacheKey, art);
      try { sessionStorage.setItem(`art_${cacheKey}`, art); } catch {}
      return art;
    }

    // 2. Search clean title alone
    query = encodeURIComponent(cTitle);
    res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
    data = await res.json();
    if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
      const art = data.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
      artworkMemoryCache.set(cacheKey, art);
      try { sessionStorage.setItem(`art_${cacheKey}`, art); } catch {}
      return art;
    }
  } catch (err) {
    console.warn("[AlbumArtwork] Online search failed:", err);
  }

  return null;
}

// Resilient Album Artwork Component with High-Res iTunes Resolver & Vinyl Fallback
function AlbumArtwork({
  src,
  title,
  artist,
  source,
  className,
  size = 32
}: {
  src?: string;
  title?: string;
  artist?: string;
  source?: string;
  className?: string;
  size?: number;
}) {
  const [onlineUrl, setOnlineUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const isBrowserOrWeb = source === "browser" || source === "youtube" || source === "generic";

  useEffect(() => {
    setImgFailed(false);
    if (!title) {
      setOnlineUrl(null);
      return;
    }

    const cTitle = cleanTrackTitle(title);
    const cArtist = cleanArtistName(artist || "");
    const cacheKey = `${cTitle.toLowerCase()}:::${cArtist.toLowerCase()}`;

    if (artworkMemoryCache.has(cacheKey)) {
      setOnlineUrl(artworkMemoryCache.get(cacheKey)!);
      return;
    }

    // For browser media or when local artwork is missing, immediately resolve the genuine cover
    if (isBrowserOrWeb || !src) {
      let active = true;
      fetchOnlineArtwork(title, artist || "").then((url) => {
        if (active && url) {
          setOnlineUrl(url);
        }
      });
      return () => {
        active = false;
      };
    } else {
      setOnlineUrl(null);
    }
  }, [title, artist, src, isBrowserOrWeb]);

  let displayUrl: string | null = null;
  if (isBrowserOrWeb) {
    // For browsers, prefer the genuine online album cover over the browser executable logo (e.g. Brave lion)
    displayUrl = onlineUrl || null;
  } else {
    // For native players (Spotify), prefer native src unless failed or onlineUrl is ready
    displayUrl = !imgFailed && src ? src : onlineUrl;
  }

  const handleImgError = () => {
    setImgFailed(true);
    if (!onlineUrl && title) {
      fetchOnlineArtwork(title, artist || "").then((url) => {
        if (url) setOnlineUrl(url);
      });
    }
  };

  if (!displayUrl || (displayUrl === src && imgFailed)) {
    return (
      <div className={`art-fallback ${className ?? ""}`} style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" rx="8" fill="#14171d" />
          <circle cx="20" cy="20" r="14" fill="#090a0d" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
          <circle cx="20" cy="20" r="6" fill="#1c1f26" />
          <circle cx="20" cy="20" r="2.2" fill="#0a84ff" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={displayUrl}
      className={className}
      alt=""
      style={{ width: size, height: size, objectFit: "cover" }}
      onError={handleImgError}
    />
  );
}

// Micro Equalizer Animation
function MicroEq() {
  return (
    <div className="mini-eq" aria-hidden="true" title="Playing">
      <span className="eq-bar b1" />
      <span className="eq-bar b2" />
      <span className="eq-bar b3" />
    </div>
  );
}

function MusicIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="m6 18 8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 1 }}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

// Quick Action Icon SVGs
function ClipboardSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function TimerSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M9 2h6M12 2v2" />
    </svg>
  );
}

function ScreenTimeSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M7 8l3 3 4-4" />
    </svg>
  );
}

function FocusSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
    </svg>
  );
}


// Quick Action Button — Smooth hover + scale with badge
function QuickIconBtn({
  id,
  icon,
  label,
  count,
  active,
  onClick
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.button
      id={id}
      className={`quick-icon-btn ${active ? "active" : ""}`}
      title={label}
      onClick={onClick}
      whileHover={{ scale: 1.15, y: -1 }}
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", stiffness: 500, damping: 22, mass: 0.5 }}
    >
      <span className="quick-icon-svg">{icon}</span>
      {count != null && count > 0 && (
        <span className="quick-icon-badge">{count}</span>
      )}
    </motion.button>
  );
}

function BellSvg() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

const getEndTime = (secondsLeft: number): string => {
  const end = new Date(Date.now() + Math.max(0, secondsLeft) * 1000);
  const hours = end.getHours().toString().padStart(2, "0");
  const minutes = end.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const formatTimer = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const formatTime = (ms?: number) => {
  if (!ms || ms < 0 || isNaN(ms)) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Custom Timer Tape / Ruler Dial Component (Screenshot 2 exact replica)
function CustomTimerDial({
  selectedMinutes,
  onChange,
  onStart,
  onBackToTools,
  onClose
}: {
  selectedMinutes: number;
  onChange: (mins: number) => void;
  onStart: () => void;
  onBackToTools: () => void;
  onClose: () => void;
}) {
  const TICK_SPACING = 14;
  const MAX_MINUTES = 60;
  const MIN_MINUTES = 1;
  const centerOffset = 170;

  const minX = centerOffset - MAX_MINUTES * TICK_SPACING; // -670
  const maxX = centerOffset - MIN_MINUTES * TICK_SPACING; // 156

  const trackRef = useRef<HTMLDivElement>(null);
  const digitsRef = useRef<HTMLDivElement>(null);

  const currentX = useRef(centerOffset - selectedMinutes * TICK_SPACING);
  const targetX = useRef(centerOffset - selectedMinutes * TICK_SPACING);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartTrackX = useRef(0);
  const rafId = useRef<number | null>(null);
  const wheelTimer = useRef<NodeJS.Timeout | null>(null);
  const currentMinutesRef = useRef(selectedMinutes);

  // Sync if selectedMinutes changes externally while not dragging or animating
  useEffect(() => {
    if (!isDragging.current && rafId.current === null) {
      const snapX = centerOffset - selectedMinutes * TICK_SPACING;
      currentX.current = snapX;
      targetX.current = snapX;
      currentMinutesRef.current = selectedMinutes;
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${snapX}px)`;
      }
      if (digitsRef.current) {
        digitsRef.current.textContent = `${selectedMinutes.toString().padStart(2, "0")}:00`;
      }
    }
  }, [selectedMinutes]);

  const updateDisplay = (x: number) => {
    const rawM = (centerOffset - x) / TICK_SPACING;
    const roundedM = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(rawM)));
    if (roundedM !== currentMinutesRef.current) {
      currentMinutesRef.current = roundedM;
      if (digitsRef.current) {
        digitsRef.current.textContent = `${roundedM.toString().padStart(2, "0")}:00`;
      }
      onChange(roundedM);
    }
  };

  // Continuous animation loop for physics lerping / wheel scrolling / snapping
  const animateToTarget = (onDone?: () => void) => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);

    const step = () => {
      const diff = targetX.current - currentX.current;
      if (Math.abs(diff) < 0.25) {
        currentX.current = targetX.current;
        if (trackRef.current) {
          trackRef.current.style.transform = `translateX(${currentX.current}px)`;
        }
        updateDisplay(currentX.current);
        rafId.current = null;
        if (onDone) onDone();
        return;
      }

      // Butter-smooth exponential spring lerp
      currentX.current += diff * 0.22;
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${currentX.current}px)`;
      }
      updateDisplay(currentX.current);
      rafId.current = requestAnimationFrame(step);
    };

    rafId.current = requestAnimationFrame(step);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (wheelTimer.current) {
      clearTimeout(wheelTimer.current);
      wheelTimer.current = null;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartTrackX.current = currentX.current;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - dragStartX.current;
    const rawX = dragStartTrackX.current + deltaX;
    // Slight elastic resistance at boundaries
    const clampedX = Math.max(minX - 35, Math.min(maxX + 35, rawX));
    currentX.current = clampedX;
    targetX.current = clampedX;

    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(${clampedX}px)`;
    }
    updateDisplay(clampedX);
  };

  const handlePointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    // Smooth magnetic snap to the nearest integer minute
    const nearestM = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round((centerOffset - currentX.current) / TICK_SPACING)));
    targetX.current = centerOffset - nearestM * TICK_SPACING;
    animateToTarget();
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isDragging.current) return;

    // Support both trackpad smooth deltas and discrete mouse wheel notches
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    // Scrolling down increases time, moving track to the left
    const scrollStep = delta > 0 ? -18 : 18;
    const newTarget = Math.max(minX, Math.min(maxX, targetX.current + scrollStep));
    targetX.current = newTarget;

    animateToTarget();

    // Auto-snap to exact minute after wheel scrolling stops
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => {
      const nearestM = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round((centerOffset - targetX.current) / TICK_SPACING)));
      targetX.current = centerOffset - nearestM * TICK_SPACING;
      animateToTarget();
    }, 140);
  };

  // Clean up RAF and timer on unmount
  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, []);

  const ticks = [];
  for (let m = 0; m <= MAX_MINUTES; m++) {
    const isMajor = m % 5 === 0;
    ticks.push({
      minute: m,
      isMajor,
      label: isMajor ? String(m) : null
    });
  }

  return (
    <div className="custom-timer-setup-panel">
      {/* Top Header Row */}
      <div className="timer-setup-header" onPointerDown={(e) => e.stopPropagation()}>
        <button className="timer-nav-btn" onClick={onBackToTools} title="Back to Quick Tools">
          <span>✦ Tools</span>
        </button>
        <span className="timer-setup-title">Set Timer</span>
        <button className="timer-nav-btn timer-min-btn" onClick={onClose} title="Close">
          <CloseIcon />
        </button>
      </div>

      {/* Horizontal Tape / Ruler Dial (Screenshot 2 exact replica) */}
      <div
        className="timer-ruler-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          ref={trackRef}
          className="timer-ruler-track"
          style={{
            transform: `translateX(${currentX.current}px)`
          }}
        >
          {ticks.map((t) => (
            <div
              key={t.minute}
              className={`timer-tick-wrap ${t.isMajor ? "is-major" : "is-minor"}`}
              style={{ left: `${t.minute * TICK_SPACING}px` }}
              onClick={(e) => {
                e.stopPropagation();
                if (t.minute >= 1) {
                  targetX.current = centerOffset - t.minute * TICK_SPACING;
                  animateToTarget();
                }
              }}
            >
              {t.isMajor && (
                <span className="timer-tick-number">{t.label}</span>
              )}
              <div className="timer-tick-mark" />
            </div>
          ))}
        </div>

        {/* Center Orange Pointer Arrow ▲ */}
        <div className="timer-ruler-center-indicator">
          <svg width="12" height="9" viewBox="0 0 12 9" fill="#ff9f0a">
            <polygon points="6,0 12,9 0,9" />
          </svg>
        </div>
      </div>

      {/* Bottom Row: [Start Timer] on left, large orange digits on right */}
      <div className="timer-setup-bottom-row" onPointerDown={(e) => e.stopPropagation()}>
        <motion.button
          className="timer-start-btn"
          onClick={onStart}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
        >
          Start Timer
        </motion.button>

        <div ref={digitsRef} className="timer-display-digits-orange">
          {selectedMinutes.toString().padStart(2, "0")}:00
        </div>
      </div>
    </div>
  );
}

// Hook for live real-time clock, day of week, and weather
function useLiveTimeAndWeather() {
  const [time, setTime] = useState(() => {
    const d = new Date();
    return {
      hoursMinutes: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      dayOfWeek: d.toLocaleDateString([], { weekday: "short" }),
      dateFormatted: d.toLocaleDateString([], { month: "short", day: "numeric" })
    };
  });

  const [weather, setWeather] = useState<{ temp: string; icon: string; condition: string }>(() => {
    try {
      const cached = localStorage.getItem("islet_weather_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 30 * 60 * 1000) {
          return parsed.data;
        }
      }
    } catch {
      // ignore
    }
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour >= 19;
    return {
      temp: "22°",
      icon: isNight ? "🌙" : "🌤️",
      condition: isNight ? "Clear Night" : "Partly Cloudy"
    };
  });

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime({
        hoursMinutes: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        dayOfWeek: d.toLocaleDateString([], { weekday: "short" }),
        dateFormatted: d.toLocaleDateString([], { month: "short", day: "numeric" })
      });
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchWeather = async () => {
      try {
        const res = await fetch("https://wttr.in/?format=j1");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const current = data.current_condition?.[0];
        if (!current) return;
        const temp = `${current.temp_C}°`;
        const desc = current.weatherDesc?.[0]?.value || "Clear";
        
        const hour = new Date().getHours();
        const isNight = hour < 6 || hour >= 19;
        let icon = isNight ? "🌙" : "☀️";
        const dLower = desc.toLowerCase();
        if (dLower.includes("rain") || dLower.includes("drizzle") || dLower.includes("shower")) {
          icon = "🌧️";
        } else if (dLower.includes("thunder") || dLower.includes("storm")) {
          icon = "⛈️";
        } else if (dLower.includes("snow") || dLower.includes("ice") || dLower.includes("blizzard")) {
          icon = "❄️";
        } else if (dLower.includes("cloud") || dLower.includes("overcast")) {
          icon = "☁️";
        } else if (dLower.includes("fog") || dLower.includes("mist")) {
          icon = "🌫️";
        } else if (dLower.includes("partly") || dLower.includes("sun")) {
          icon = isNight ? "☁️" : "🌤️";
        }

        const weatherData = { temp, icon, condition: desc };
        setWeather(weatherData);
        try {
          localStorage.setItem(
            "islet_weather_cache",
            JSON.stringify({ timestamp: Date.now(), data: weatherData })
          );
        } catch {
          // ignore
        }
      } catch {
        // Fallback
      }
    };

    void fetchWeather();
    const interval = setInterval(fetchWeather, 20 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { time, weather };
}

type DragState = {
  active: boolean;
  moved: boolean;
  startX: number;
  startY: number;
  pointerId: number;
  frame: number | null;
};

type InteractionState = "collapsed" | "expanding" | "expanded" | "collapsing";

export type StoredImage = {
  id: string;
  name: string;
  filePath: string;
  url: string;
  size: number;
  timeAdded: string;
};

export function App() {
  const [state, setState] = useState<InteractionState>("collapsed");
  const [activeTab, setActiveTab] = useState<"music" | "shelf" | "tools" | "timer">("tools");
  const [media, setMedia] = useState<MediaState | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const { time, weather } = useLiveTimeAndWeather();

  // Quick Action States
  const [customMinutes, setCustomMinutes] = useState(15);
  const [totalSeconds, setTotalSeconds] = useState(15 * 60);
  const [timerSeconds, setTimerSeconds] = useState(15 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFocusOn, setIsFocusOn] = useState(false);
  const timerProgress = totalSeconds > 0 ? Math.max(0, Math.min(1, timerSeconds / totalSeconds)) : 0;

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          setTimerSeconds(customMinutes * 60);
          return customMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, customMinutes]);

  // Temporary Image Storage (Drag & Drop Shelf)
  const [storedImages, setStoredImages] = useState<StoredImage[]>([]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const dragCounter = useRef(0);
  const mediaClearTimer = useRef<NodeJS.Timeout | null>(null);

  const drag = useRef<DragState>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    pointerId: -1,
    frame: null
  });
  const latestPoint = useRef({ screenX: 0, screenY: 0 });

  const isExpanded = state === "expanded" || state === "expanding";
  const isCollapsing = state === "collapsing";

  // Active music detection: stays active while switching or while playing/paused
  const hasActiveMedia = Boolean(
    isSwitching || (media && (media.status === "playing" || (media.status === "paused" && media.title)))
  );

  useEffect(() => {
    const api = window.islet;
    if (!api) return;

    void api.media.getState().then((m) => {
      if (m) {
        setMedia(m);
        setActiveTab("music");
      }
    });

    const unsubscribeMedia = api.media.subscribe((nextMedia) => {
      if (nextMedia) {
        if (mediaClearTimer.current) {
          clearTimeout(mediaClearTimer.current);
          mediaClearTimer.current = null;
        }
        setIsSwitching(false);
        setMedia(nextMedia);
        setActiveTab((prev) => (prev === "shelf" ? "shelf" : "music"));
      } else {
        if (mediaClearTimer.current) {
          clearTimeout(mediaClearTimer.current);
          mediaClearTimer.current = null;
        }
        setMedia(null);
        setIsSwitching(false);
        setActiveTab((prev) => (prev === "shelf" ? "shelf" : "tools"));
      }
    });

    const removeExpanded = api.window.onExpanded(() => {
      setState("expanded");
    });

    const removeStartCollapse = api.window.onStartCollapse(() => {
      setState("collapsing");
    });

    const removeBlurred = api.window.onBlurred(() => {
      triggerCollapse();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isExpanded) {
        triggerCollapse();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      unsubscribeMedia();
      removeExpanded();
      removeStartCollapse();
      removeBlurred();
      window.removeEventListener("keydown", onKey);
      if (mediaClearTimer.current) clearTimeout(mediaClearTimer.current);
    };
  }, [isExpanded]);

  // Click-through pass-through: Only the notch surface is clickable.
  // All transparent background areas pass clicks through to background apps (browser tabs, desktop, etc.)
  useEffect(() => {
    const api = window.islet;
    if (!api?.window?.setIgnoreMouseEvents) return;

    // Start with clicks ignored on transparent areas (forward mousemove so we still detect hovering over notch)
    api.window.setIgnoreMouseEvents(true, { forward: true });

    let isOverNotch = false;

    const handleMouseMove = (e: MouseEvent) => {
      if (drag.current.active) {
        if (!isOverNotch) {
          isOverNotch = true;
          api.window.setIgnoreMouseEvents(false);
        }
        return;
      }

      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const over = Boolean(elem && elem.closest(".islet-notch-surface"));

      if (over !== isOverNotch) {
        isOverNotch = over;
        if (over) {
          api.window.setIgnoreMouseEvents(false);
        } else {
          api.window.setIgnoreMouseEvents(true, { forward: true });
        }
      }
    };

    const handleMouseLeave = () => {
      if (!drag.current.active && isOverNotch) {
        isOverNotch = false;
        api.window.setIgnoreMouseEvents(true, { forward: true });
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const switchTab = (tab: "music" | "shelf" | "tools" | "timer") => {
    setActiveTab(tab);
    if (isExpanded) {
      const h = tab === "shelf" ? 116 : tab === "timer" ? 118 : tab === "music" ? 100 : 48;
      void window.islet.window.setExpanded(true, h);
    }
  };

  const triggerExpand = (panelHeight?: number) => {
    if (state !== "collapsed") return;
    setState("expanding");
    const h = panelHeight || (
      activeTab === "shelf" ? 116 :
      activeTab === "timer" ? 118 :
      activeTab === "music" && hasActiveMedia ? 100 : 48
    );
    void window.islet.window.setExpanded(true, h).catch((err: unknown) => {
      console.error("Expand failed:", err);
      setState("collapsed");
    });
  };

  const triggerCollapse = () => {
    if (state === "collapsed" || state === "collapsing") return;
    setState("collapsing");
    void window.islet.window.collapse().catch((err: unknown) => {
      console.error("Collapse failed:", err);
      setState("collapsed");
    });
  };

  const handleAnimationComplete = () => {
    if (state === "expanding") {
      setState("expanded");
    } else if (state === "collapsing") {
      setState("collapsed");
      void window.islet.window.finishCollapse().catch((err: unknown) => {
        console.error("Finish collapse failed:", err);
      });
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, [role='button'], .shelf-image-card")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      active: true,
      moved: false,
      startX: event.screenX,
      startY: event.screenY,
      pointerId: event.pointerId,
      frame: null
    };
    latestPoint.current = { screenX: event.screenX, screenY: event.screenY };
    void window.islet.window.beginDrag(latestPoint.current).catch((err: unknown) => console.error("Drag start:", err));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current.active || drag.current.pointerId !== event.pointerId) return;
    const dist = Math.hypot(event.screenX - drag.current.startX, event.screenY - drag.current.startY);
    if (dist > 3) {
      drag.current.moved = true;
    }
    if (!drag.current.moved) return;

    latestPoint.current = { screenX: event.screenX, screenY: event.screenY };
    if (drag.current.frame === null) {
      drag.current.frame = requestAnimationFrame(() => {
        drag.current.frame = null;
        void window.islet.window.moveDrag(latestPoint.current).catch((err: unknown) => console.error("Drag move:", err));
      });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current.active || drag.current.pointerId !== event.pointerId) return;
    if (drag.current.frame !== null) cancelAnimationFrame(drag.current.frame);
    const wasMoved = drag.current.moved;
    drag.current.active = false;

    if (wasMoved) {
      void window.islet.window.endDrag().catch((err: unknown) => console.error("Drag end:", err));
    } else {
      if (!isExpanded) {
        triggerExpand();
      } else {
        triggerCollapse();
      }
    }
  };

  const handlePlayPause = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    void window.islet.media.playPause().catch((err: unknown) => console.error("Media play/pause:", err));
  };

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsSwitching(true);
    void window.islet.media.previous().catch((err: unknown) => console.error("Media prev:", err));
    setTimeout(() => setIsSwitching(false), 1200);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsSwitching(true);
    void window.islet.media.next().catch((err: unknown) => console.error("Media next:", err));
    setTimeout(() => setIsSwitching(false), 1200);
  };

  // =========================================================================
  // Drag and Drop Images Temporarily onto Notch
  // =========================================================================
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.islet?.window.setIgnoreMouseEvents?.(false);
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingFile(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.islet?.window.setIgnoreMouseEvents?.(false);
    e.dataTransfer.dropEffect = "copy";
    if (!isDraggingFile) {
      setIsDraggingFile(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingFile(false);
      window.islet?.window.setIgnoreMouseEvents?.(true, { forward: true });
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingFile(false);
    window.islet?.window.setIgnoreMouseEvents?.(false);

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)
    );

    if (files.length === 0) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    const newStored: StoredImage[] = [];

    for (const file of files) {
      let filePath = "";
      if (window.islet?.shelf?.getPathForFile) {
        filePath = window.islet.shelf.getPathForFile(file) || "";
      }
      if (!filePath && (file as any).path) {
        filePath = (file as any).path;
      }

      // If no disk path (e.g. from browser drag), cache it to disk so native drag & copy work everywhere
      if (!filePath && window.islet?.shelf?.saveTempImage) {
        try {
          const buffer = await file.arrayBuffer();
          const res = await window.islet.shelf.saveTempImage(file.name, buffer);
          filePath = res.filePath;
        } catch (err) {
          console.error("Failed to cache temp image:", err);
        }
      }

      newStored.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        filePath,
        url: URL.createObjectURL(file),
        size: file.size,
        timeAdded: timeStr
      });
    }

    setStoredImages((prev) => [...newStored, ...prev]);
    setActiveTab("shelf");
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 1800);

    // Expand smoothly to show the stored temporary images
    if (!isExpanded) {
      triggerExpand();
    }
  };

  const removeStoredImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStoredImages((prev) => prev.filter((item) => item.id !== id));
  };

  const copyStoredImage = async (img: StoredImage, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let success = false;
      if (window.islet?.shelf?.copyImage) {
        success = await window.islet.shelf.copyImage(img.filePath, img.url);
      }
      if (!success) {
        const res = await fetch(img.url);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || "image/png"]: blob })
        ]);
        success = true;
      }
      if (success) {
        setCopiedId(img.id);
        setTimeout(() => setCopiedId((curr) => (curr === img.id ? null : curr)), 1800);
      }
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleCardDragStart = (e: React.DragEvent, img: StoredImage) => {
    e.stopPropagation();
    if (img.filePath && window.islet?.shelf?.startDrag) {
      e.preventDefault();
      window.islet.shelf.startDrag(img.filePath);
    }
  };

  const clearAllStoredImages = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStoredImages([]);
  };

  const isPlaying = media?.status === "playing";
  const progressPercent =
    media && media.durationMs > 0
      ? Math.min(100, Math.max(0, (media.positionMs / media.durationMs) * 100))
      : 0;

  const isShelfActive = activeTab === "shelf" && storedImages.length > 0;
  const isTimerActive = activeTab === "timer";
  const isMusicActive = Boolean(hasActiveMedia && media && activeTab !== "shelf" && activeTab !== "tools" && activeTab !== "timer");
  // Only show collapsed timer capsule when timer is actually running
  const showCollapsedTimer = isTimerRunning;

  // Dynamic sleek proportions:
  let targetWidth = 250;
  let targetHeight = 42;
  let targetRadius = "21px";

  if (isExpanded && !isCollapsing) {
    if (isShelfActive) {
      targetWidth = 370;
      targetHeight = 110;
      targetRadius = "26px";
    } else if (isTimerActive) {
      targetWidth = 356;
      targetHeight = 118;
      targetRadius = "28px";
    } else if (isMusicActive) {
      targetWidth = 370;
      targetHeight = 94;
      targetRadius = "26px";
    } else {
      // Short, sleek Quick Actions Bar — only 48px high!
      targetWidth = 340;
      targetHeight = 48;
      targetRadius = "24px"; // Perfectly continuous semicircle pill ends!
    }
  } else {
    if (showCollapsedTimer) {
      targetWidth = 200;
      targetHeight = 38;
      targetRadius = "19px";
    }
  }

  return (
    <div
      className="notch-viewport"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <motion.main
        className={`islet-notch-surface ${isExpanded ? "mode-expanded" : "mode-collapsed"} ${isCollapsing ? "mode-collapsing" : ""} ${isDraggingFile ? "notch-drop-active" : ""}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{
          opacity: 1,
          scale: 1,
          width: targetWidth,
          height: targetHeight,
          borderBottomLeftRadius: targetRadius,
          borderBottomRightRadius: targetRadius,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0
        }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{
          type: "spring",
          stiffness: 380,
          damping: 30,
          mass: 0.6
        }}
        onAnimationComplete={handleAnimationComplete}
        onMouseEnter={() => {
          window.islet?.window.setIgnoreMouseEvents?.(false);
        }}
        onMouseLeave={() => {
          if (!drag.current.active) {
            window.islet?.window.setIgnoreMouseEvents?.(true, { forward: true });
          }
        }}
      >
        {/* Dragging over indicator — Smooth Framer Motion */}
        <AnimatePresence>
          {isDraggingFile && (
            <motion.div
              className="drop-overlay-capsule"
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{ type: "spring", stiffness: 420, damping: 26, mass: 0.55 }}
            >
              <motion.span
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              >
                📥
              </motion.span>
              <span>Drop to save</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Saved Toast — slides in from top */}
        <AnimatePresence>
          {showSavedToast && (
            <motion.div
              className="drop-toast-pill"
              initial={{ opacity: 0, y: -8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 460, damping: 28, mass: 0.5 }}
            >
              <span>✓ Saved in Shelf</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {isExpanded && !isCollapsing ? (
            isShelfActive ? (
              /* =================================================================
                 EXPANDED TEMPORARY IMAGE SHELF
                 ================================================================= */
              <motion.div
                key="expanded-shelf"
                className="expanded-shelf-panel"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.6 }}
              >
                {/* Header */}
                <div
                  className="shelf-header drag-handle"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  <div className="shelf-title-wrap" onPointerDown={(e) => e.stopPropagation()}>
                    <span className="shelf-brand">Saved Files</span>
                    <span className="shelf-count-tag">
                      {storedImages.length} {storedImages.length === 1 ? "file" : "files"}
                    </span>
                  </div>

                  <div className="shelf-header-actions" onPointerDown={(e) => e.stopPropagation()}>
                    {/* Back to Song toggle button when music is active, or Tools if no media */}
                    {hasActiveMedia && media ? (
                      <button
                        className="shelf-song-btn"
                        onClick={() => switchTab("music")}
                        title={`Back to: ${media.title}`}
                      >
                        <span className="song-icon">◀ ♫</span>
                        <span>Song</span>
                      </button>
                    ) : (
                      <button
                        className="shelf-song-btn"
                        onClick={() => switchTab("tools")}
                        title="Back to Tools"
                      >
                        <span className="song-icon">◀ ✦</span>
                        <span>Tools</span>
                      </button>
                    )}
                    <button className="shelf-clear-btn" onClick={clearAllStoredImages}>
                      Clear All
                    </button>
                    <button className="shelf-close-btn" onClick={triggerCollapse} title="Close">
                      <CloseIcon />
                    </button>
                  </div>
                </div>

                {/* Image List Strip */}
                <div className="shelf-items-strip" onPointerDown={(e) => e.stopPropagation()}>
                  {storedImages.map((img) => (
                    <div
                      key={img.id}
                      className="shelf-image-card"
                      title={`${img.name}\n• Drag out to upload anywhere\n• Click Copy to paste`}
                      draggable={Boolean(img.filePath)}
                      onDragStart={(e) => handleCardDragStart(e, img)}
                    >
                      <img src={img.url} alt={img.name} draggable={false} />
                      <div className="shelf-card-overlay">
                        <button
                          className={`shelf-action-btn ${copiedId === img.id ? "copied" : ""}`}
                          onClick={(e) => copyStoredImage(img, e)}
                        >
                          {copiedId === img.id ? "Copied!" : "Copy"}
                        </button>
                        <span className="shelf-drag-hint">Drag out ↗</span>
                      </div>
                      <button
                        className="shelf-card-delete"
                        onClick={(e) => removeStoredImage(img.id, e)}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* Drop Zone Footer */}
                <div
                  className={`shelf-dropzone ${isDraggingFile ? "dragover" : ""}`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span>📥</span>
                  <span>Drop more images to store</span>
                </div>
              </motion.div>
            ) : isTimerActive ? (
              !isTimerRunning ? (
                /* =================================================================
                   CUSTOM TIMER SETUP DIAL (Screenshot 2 exact replica)
                   ================================================================= */
                <CustomTimerDial
                  key="custom-timer-setup"
                  selectedMinutes={customMinutes}
                  onChange={(mins) => {
                    setCustomMinutes(mins);
                    setTotalSeconds(mins * 60);
                    setTimerSeconds(mins * 60);
                  }}
                  onStart={() => {
                    setTotalSeconds(customMinutes * 60);
                    setTimerSeconds(customMinutes * 60);
                    setIsTimerRunning(true);
                  }}
                  onBackToTools={() => switchTab("tools")}
                  onClose={triggerCollapse}
                />
              ) : (
                /* =================================================================
                   ACTIVE RUNNING TIMER PANEL (Screenshot 1 replica)
                   ================================================================= */
                <motion.div
                  key="expanded-timer-running"
                  className="expanded-timer-panel drag-handle"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.55 }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  {/* Top Animated Orange Progress Line */}
                  <div
                    className="timer-running-top-line"
                    style={{ width: `${timerProgress * 100}%` }}
                  />

                  {/* Top Header Row */}
                  <div className="timer-header-row" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="timer-header-left">
                      <button
                        className="timer-nav-btn"
                        onClick={() => switchTab("tools")}
                        title="Back to Quick Tools"
                      >
                        <span>✦ Tools</span>
                      </button>
                      {hasActiveMedia && media && (
                        <button
                          className="timer-nav-btn"
                          onClick={() => switchTab("music")}
                          title={`Switch to: ${media.title}`}
                        >
                          <span>♫ Song</span>
                        </button>
                      )}
                    </div>

                    {/* Bell + Finish Time */}
                    <div className="timer-alarm-info" title="Estimated finish time">
                      <BellSvg />
                      <span>{getEndTime(timerSeconds)}</span>
                    </div>

                    {/* Minimize / Close */}
                    <button
                      className="timer-nav-btn timer-min-btn"
                      onClick={triggerCollapse}
                      title="Minimize to capsule (Esc)"
                      aria-label="Minimize"
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  {/* Main Row: [Pause Circle Button] [Center Big Digits + Timer] [Cancel Red Circle Button] */}
                  <div className="timer-main-row" onPointerDown={(e) => e.stopPropagation()}>
                    <motion.button
                      className={`timer-action-btn timer-pause-btn ${!isTimerRunning ? "is-paused" : ""}`}
                      onClick={() => setIsTimerRunning((prev) => !prev)}
                      title={isTimerRunning ? "Pause timer" : "Resume timer"}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.94 }}
                    >
                      {isTimerRunning ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                          <rect x="6" y="4" width="3.8" height="16" rx="1.9" />
                          <rect x="14.2" y="4" width="3.8" height="16" rx="1.9" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginLeft: "2px" }}>
                          <polygon points="7 4 20 12 7 20 7 4" />
                        </svg>
                      )}
                    </motion.button>

                    <div className="timer-center-display">
                      <div className="timer-big-digits">{formatTimer(timerSeconds)}</div>
                      <div className="timer-sublabel">Timer</div>
                    </div>

                    <motion.button
                      className="timer-action-btn timer-cancel-btn"
                      onClick={() => {
                        setIsTimerRunning(false);
                        setTimerSeconds(customMinutes * 60);
                        setTotalSeconds(customMinutes * 60);
                      }}
                      title="Cancel & Reset Timer"
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.94 }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="17" y1="7" x2="7" y2="17" />
                        <line x1="7" y1="7" x2="17" y2="17" />
                      </svg>
                    </motion.button>
                  </div>
                </motion.div>
              )
            ) : isMusicActive && media ? (
              /* =================================================================
                 EXPANDED MUSIC PLAYER (MacBook Style Proportions)
                 ================================================================= */
              <motion.div
                key="expanded-music"
                className="expanded-music-panel"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.6 }}
              >
                {/* Header */}
                <header
                  className="expanded-header drag-handle"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  <div className="source-badge-pill" onPointerDown={(e) => e.stopPropagation()}>
                    <span className={`source-dot source-dot-${media.source}`} />
                    <span>
                      {media.source === "spotify"
                        ? "Spotify"
                        : media.source === "youtube"
                          ? "YouTube"
                          : media.source === "apple-music"
                            ? "Apple Music"
                            : media.source === "browser"
                              ? "Browser"
                              : "Music"}
                    </span>
                  </div>

                  <div className="expanded-header-actions" onPointerDown={(e) => e.stopPropagation()}>
                    {isTimerRunning && (
                      <button
                        className="music-shelf-btn"
                        onClick={() => switchTab("timer")}
                        title={`View Timer (${formatTimer(timerSeconds)})`}
                      >
                        <span style={{ color: "#ff9500" }}>⏱</span>
                        <span style={{ color: "#ff9500", fontWeight: 700 }}>{formatTimer(timerSeconds)}</span>
                      </button>
                    )}
                    <button
                      className="music-shelf-btn"
                      onClick={() => switchTab("tools")}
                      title="Quick Tools"
                    >
                      <span>✦ Tools</span>
                    </button>
                    {/* Clipboard toggle button if files are present */}
                    {storedImages.length > 0 && (
                      <button
                        className="music-shelf-btn"
                        onClick={() => switchTab("shelf")}
                        title={`View ${storedImages.length} saved images`}
                      >
                        <span>📋</span>
                        <span>{storedImages.length}</span>
                      </button>
                    )}
                    {isPlaying && <MicroEq />}
                    <button
                      className="music-close-btn"
                      onClick={triggerCollapse}
                      title="Dismiss (Esc)"
                      aria-label="Dismiss"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </header>

                {/* Main Row: 46px Artwork (left) + Track Info (center) + Transport (right) */}
                <div className="expanded-main-row">
                  <div className="expanded-art-wrap">
                    <AlbumArtwork
                      src={media.artworkUrl}
                      title={media.title}
                      artist={media.artist}
                      source={media.source}
                      className="expanded-art"
                      size={46}
                    />
                  </div>

                  <div className="expanded-info-col">
                    <span className="expanded-title" title={media.title}>
                      {isSwitching ? "" : media.title}
                    </span>
                    <span className="expanded-artist" title={media.artist}>
                      {isSwitching ? "" : media.artist || "Unknown Artist"}
                    </span>
                  </div>

                  <div className="expanded-transport-row" onPointerDown={(e) => e.stopPropagation()}>
                    <button className="transport-btn" onClick={handlePrev} title="Previous" aria-label="Previous">
                      <PrevIcon />
                    </button>
                    <button
                      className="transport-play-btn"
                      onClick={handlePlayPause}
                      title={isPlaying ? "Pause" : "Play"}
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <button className="transport-btn" onClick={handleNext} title="Next" aria-label="Next">
                      <NextIcon />
                    </button>
                  </div>
                </div>

                {/* Scrubber */}
                <div className="expanded-progress-section" onPointerDown={(e) => e.stopPropagation()}>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="progress-time-row">
                    <span>{formatTime(media.positionMs)}</span>
                    <span>{formatTime(media.durationMs)}</span>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* =================================================================
                 EXPANDED QUICK ACTIONS ISLAND (MacBook Style, Short & Compact)
                 ================================================================= */
              <motion.div
                key="expanded-quick-tools"
                className="expanded-quickbar-panel drag-handle"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.55 }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {/* Brand / Status Indicator */}
                <div className="quickbar-brand" onPointerDown={(e) => e.stopPropagation()}>
                  <span className="quickbar-dot" />
                  <span className="quickbar-name">Islet</span>
                </div>

                {/* Quick Action Tools Row */}
                <div className="quickbar-tools" onPointerDown={(e) => e.stopPropagation()}>
                  {/* Clipboard / Shelf */}
                  <QuickIconBtn
                    id="qi-clipboard"
                    icon={<ClipboardSvg />}
                    label={storedImages.length > 0 ? `${storedImages.length} saved images (Click to view)` : "Clipboard Shelf"}
                    count={storedImages.length}
                    active={activeTab === "shelf"}
                    onClick={() => {
                      if (storedImages.length > 0) {
                        switchTab("shelf");
                      }
                    }}
                  />

                  {/* Timer / Pomodoro with interactive countdown */}
                  <motion.button
                    id="qi-timer"
                    className={`quick-icon-btn ${isTimerRunning ? "active timer-running" : ""}`}
                    title={isTimerRunning ? `Timer: ${formatTimer(timerSeconds)} (Click to view)` : `Custom Timer`}
                    onClick={() => {
                      switchTab("timer");
                    }}
                    whileHover={{ scale: 1.15, y: -1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <span className="quick-icon-svg"><TimerSvg /></span>
                    {isTimerRunning && (
                      <span className="quick-timer-label">{formatTimer(timerSeconds)}</span>
                    )}
                  </motion.button>

                  {/* Screen Time */}
                  <motion.button
                    id="qi-screentime"
                    className="quick-icon-btn"
                    title="Screen Time: 2h 45m today"
                    whileHover={{ scale: 1.15, y: -1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <span className="quick-icon-svg"><ScreenTimeSvg /></span>
                  </motion.button>

                  {/* Focus Mode */}
                  <motion.button
                    id="qi-focus"
                    className={`quick-icon-btn ${isFocusOn ? "active focus-active" : ""}`}
                    title={isFocusOn ? "Focus Mode: Active (Click to turn off)" : "Turn on Focus Mode"}
                    onClick={() => setIsFocusOn((prev) => !prev)}
                    whileHover={{ scale: 1.15, y: -1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <span className="quick-icon-svg"><FocusSvg /></span>
                    {isFocusOn && <span className="focus-indicator-dot" />}
                  </motion.button>

                </div>

                {/* Close Button on far right */}
                <button
                  className="quickbar-close-btn"
                  onClick={triggerCollapse}
                  title="Close (Esc)"
                  aria-label="Close"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <CloseIcon />
                </button>
              </motion.div>
            )
          ) : showCollapsedTimer ? (
            /* =================================================================
               COLLAPSED TIMER CAPSULE (Screenshot 3 Top: 200px x 38px)
               ================================================================= */
            <motion.div
              key="collapsed-timer"
              className="capsule-timer-bar drag-handle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onPointerDown={(event) => {
                setActiveTab("timer");
                onPointerDown(event);
              }}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => {
                if (!drag.current.active || drag.current.pointerId !== event.pointerId) return;
                if (drag.current.frame !== null) cancelAnimationFrame(drag.current.frame);
                const wasMoved = drag.current.moved;
                drag.current.active = false;
                if (wasMoved) {
                  void window.islet.window.endDrag().catch((err: unknown) => console.error("Drag end:", err));
                } else if (!isExpanded) {
                  setActiveTab("timer");
                  triggerExpand(118);
                }
              }}
              title="Timer running — Click to expand"
            >
              <div className="collapsed-timer-left">
                <svg width="20" height="20" viewBox="0 0 20 20" className="collapsed-timer-ring">
                  <circle cx="10" cy="10" r="7.5" fill="none" stroke="rgba(255, 159, 10, 0.25)" strokeWidth="2.4" />
                  <circle
                    cx="10"
                    cy="10"
                    r="7.5"
                    fill="none"
                    stroke="#ff9f0a"
                    strokeWidth="2.4"
                    strokeDasharray={47.12}
                    strokeDashoffset={47.12 * (1 - timerProgress)}
                    strokeLinecap="round"
                    transform="rotate(-90 10 10)"
                    style={{ transition: "stroke-dashoffset 0.8s linear" }}
                  />
                </svg>
              </div>

              <div className="collapsed-timer-right">
                <span className="collapsed-timer-time">{formatTimer(timerSeconds)}</span>
              </div>
            </motion.div>
          ) : hasActiveMedia && media ? (
            /* =================================================================
               COLLAPSED MUSIC CAPSULE (250px x 42px)
               ================================================================= */
            <motion.div
              key="collapsed-music"
              className="capsule-music-bar drag-handle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              title="Click to expand (Ctrl+Alt+Space)"
            >
              <div className="capsule-art-wrap">
                <AlbumArtwork
                  src={media.artworkUrl}
                  title={media.title}
                  artist={media.artist}
                  source={media.source}
                  className="capsule-art"
                  size={30}
                />
              </div>

              {/* Title shows empty during song transition as requested */}
              <div className="capsule-meta">
                <span className="capsule-title" title={media.title}>
                  {isSwitching ? "" : media.title}
                </span>
                <span className="capsule-artist" title={media.artist}>
                  {isSwitching ? "" : media.artist || "Unknown Artist"}
                </span>
              </div>

              {/* Clipboard symbol shown ONLY when images are stored */}
              {storedImages.length > 0 && (
                <button
                  className="notch-clipboard-badge"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab("shelf");
                    triggerExpand();
                  }}
                  title={`${storedImages.length} saved files — Click to view`}
                >
                  <span className="clipboard-icon">📋</span>
                  <span className="badge-count">{storedImages.length}</span>
                </button>
              )}

              <div className="capsule-status-badge">
                {isPlaying ? (
                  <MicroEq />
                ) : (
                  <div className="capsule-paused-pill" title="Paused">
                    <span className="paused-dot" />
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* =================================================================
               COLLAPSED IDLE CAPSULE — Time, Day & Live Weather (250px x 42px)
               ================================================================= */
            <motion.div
              key="collapsed-idle"
              className="capsule-idle-bar drag-handle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              title="Click to expand (Ctrl+Alt+Space)"
            >
              <div className="idle-left">
                <span className="idle-time">{time.hoursMinutes}</span>
                <span className="idle-sep">•</span>
                <span className="idle-day">
                  {time.dayOfWeek} {time.dateFormatted}
                </span>
              </div>

              <div className="idle-right">
                {/* Clipboard symbol shown ONLY when images are stored */}
                {storedImages.length > 0 && (
                  <button
                    className="notch-clipboard-badge"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab("shelf");
                      triggerExpand();
                    }}
                    title={`${storedImages.length} saved files — Click to view`}
                  >
                    <span className="clipboard-icon">📋</span>
                    <span className="badge-count">{storedImages.length}</span>
                  </button>
                )}
                <span className="idle-weather-icon">{weather.icon}</span>
                <span className="idle-temp">{weather.temp}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>
    </div>
  );
}
