import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, useCallback, memo } from "react";
import type { MediaState, ScreenTimeData, AgentState, AgentStatus } from "../electron/ipc";
import appLogo from "../logo.png";

const artworkMemoryCache = new Map<string, string>();

function cleanTrackTitle(title: string, artist?: string): string {
  let parsedArtist = (artist || "").trim();
  let parsedTitle = (title || "").trim();

  if (parsedTitle.includes(" - ")) {
    const parts = parsedTitle.split(/\s+-\s+/);
    if (parts.length >= 2) {
      if (
        !parsedArtist ||
        parsedArtist.toLowerCase().includes("youtube") ||
        parsedArtist.toLowerCase().includes("chrome") ||
        parsedArtist.toLowerCase().includes("brave") ||
        parsedArtist.toLowerCase().includes("edge") ||
        parsedArtist.toLowerCase().includes("browser")
      ) {
        parsedArtist = parts[0].trim();
        parsedTitle = parts.slice(1).join(" - ").trim();
      } else if (parsedTitle.toLowerCase().startsWith(parsedArtist.toLowerCase())) {
        parsedTitle = parsedTitle.slice(parsedArtist.length).replace(/^[\s\-–—:]+/, "").trim();
      }
    }
  }

  return (
    parsedTitle
      .replace(/\s*[\(\[](official\s*(music\s*)?(video|audio|visualizer)|lyrics?|visualizer|feat\.?|ft\.?|remix|hd|4k|prod\.?).*?[\)\]]/gi, "")
      .replace(/\s*[\(\[].*?beat.*?[\)\]]/gi, "")
      .replace(/\s*\|.*$/, "")
      .replace(/\s*#\w+/g, "")
      .trim() || title
  );
}

function cleanArtistName(artist: string): string {
  return (artist || "")
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .split(/[,&/]|feat\.?|ft\.?/i)[0]
    .trim();
}

async function fetchOnlineArtwork(title: string, artist: string): Promise<string | null> {
  const cTitle = cleanTrackTitle(title, artist);
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
  } catch { }

  try {
    // 1. Search clean title + artist
    if (cArtist && !cArtist.toLowerCase().includes("youtube") && !cArtist.toLowerCase().includes("browser")) {
      const query = encodeURIComponent(`${cTitle} ${cArtist}`.trim());
      const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
      const data = await res.json();
      if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
        const art = data.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
        artworkMemoryCache.set(cacheKey, art);
        try { sessionStorage.setItem(`art_${cacheKey}`, art); } catch { }
        return art;
      }
    }

    // 2. Search clean title alone
    const query = encodeURIComponent(cTitle);
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
    const data = await res.json();
    if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
      const art = data.results[0].artworkUrl100.replace("100x100bb", "600x600bb");
      artworkMemoryCache.set(cacheKey, art);
      try { sessionStorage.setItem(`art_${cacheKey}`, art); } catch { }
      return art;
    }
  } catch (err) {
    console.warn("[AlbumArtwork] Online search failed:", err);
  }

  return null;
}

// Official YouTube Play Logo Artwork Component
function YouTubeLogoArtwork({
  size = 32,
  className = ""
}: {
  size?: number;
  className?: string;
}) {
  const isExpanded = size > 40;
  const iconW = isExpanded ? 34 : 22;
  const iconH = Math.round(iconW * 0.708); // 24:17 aspect ratio

  return (
    <div
      className={`youtube-art-wrap ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: isExpanded ? 12 : 8,
        background: "linear-gradient(145deg, #18191f 0%, #0d0f13 100%)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: isExpanded
          ? "0 4px 14px rgba(0, 0, 0, 0.5)"
          : "0 2px 8px rgba(0, 0, 0, 0.45)"
      }}
      title="YouTube"
    >
      <svg
        width={iconW}
        height={iconH}
        viewBox="0 0 24 17"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <path
          d="M23.498 2.686A3.016 3.016 0 0 0 21.376.55C19.505.045 12 .045 12 .045s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 2.686C0 4.57 0 8.5 0 8.5s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 12.43 24 8.5 24 8.5s0-3.93-.502-5.814z"
          fill="#FF0000"
        />
        <polygon points="9.6 12 15.6 8.5 9.6 5" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

// Resilient Album Artwork Component with High-Res iTunes Resolver, Official YouTube Branding & Vinyl Fallback
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
  const isYouTube =
    source === "youtube" ||
    Boolean(title && title.toLowerCase().includes("youtube")) ||
    Boolean(artist && artist.toLowerCase().includes("youtube"));

  // Track key strictly isolates artwork per song to prevent stale artwork leaks
  const trackKey = `${(title || "").trim().toLowerCase()}:::${(artist || "").trim().toLowerCase()}`;

  const [onlineState, setOnlineState] = useState<{ trackKey: string; url: string | null }>({
    trackKey: "",
    url: null
  });
  const [failedState, setFailedState] = useState<{ trackKey: string; failedUrl: string | null }>({
    trackKey: "",
    failedUrl: null
  });
  const [retryNonce, setRetryNonce] = useState(0);

  // For YouTube media, directly render the official YouTube play-logo icon
  if (isYouTube) {
    return <YouTubeLogoArtwork size={size} className={className} />;
  }

  const isBrowserOrWeb = source === "browser" || source === "generic";

  useEffect(() => {
    if (!title) return;

    const cTitle = cleanTrackTitle(title, artist);
    const cArtist = cleanArtistName(artist || "");
    const cacheKey = `${cTitle.toLowerCase()}:::${cArtist.toLowerCase()}`;

    if (artworkMemoryCache.has(cacheKey)) {
      setOnlineState({ trackKey, url: artworkMemoryCache.get(cacheKey)! });
      return;
    }

    // For browser media or when native artwork is missing, immediately resolve genuine album cover
    if (isBrowserOrWeb || !src) {
      let active = true;
      fetchOnlineArtwork(title, artist || "").then((url) => {
        if (active && url) {
          setOnlineState({ trackKey, url });
        }
      });
      return () => {
        active = false;
      };
    }
  }, [title, artist, src, isBrowserOrWeb, trackKey]);

  // Derive active online artwork ONLY if it belongs to current track
  const currentOnlineUrl = onlineState.trackKey === trackKey ? onlineState.url : null;
  const isSrcFailed = failedState.trackKey === trackKey && failedState.failedUrl === src;

  let displayUrl: string | null = null;
  if (isBrowserOrWeb) {
    // For browsers, prefer genuine online album cover over browser executable logo
    displayUrl = currentOnlineUrl;
  } else {
    // For native players (Spotify), prefer native src unless failed, otherwise fall back to onlineUrl
    displayUrl = src && !isSrcFailed ? src : currentOnlineUrl;
  }

  const handleImgError = () => {
    if (displayUrl) {
      // Bounded retry if it's a native islet-art:// stream that might have had transient file timing
      if (displayUrl.includes("islet-art://") && retryNonce < 2) {
        const nextRetry = retryNonce + 1;
        setTimeout(() => {
          setRetryNonce(nextRetry);
        }, 150 * nextRetry);
        return;
      }

      setFailedState({ trackKey, failedUrl: displayUrl });

      // If native stream failed and we don't have online artwork yet, trigger online lookup
      if (!currentOnlineUrl && title) {
        fetchOnlineArtwork(title, artist || "").then((url) => {
          if (url) {
            setOnlineState({ trackKey, url });
          }
        });
      }
    }
  };

  if (!displayUrl || (failedState.trackKey === trackKey && failedState.failedUrl === displayUrl)) {
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

  const finalSrc =
    displayUrl.includes("islet-art://") && retryNonce > 0
      ? `${displayUrl}&r=${retryNonce}`
      : displayUrl;

  return (
    <img
      key={`${trackKey}::${displayUrl}::${retryNonce}`}
      src={finalSrc}
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

function CloseIcon() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" />
    </svg>
  );
}

function ApplePrevIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function AppleNextIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6-8.5-6z" />
    </svg>
  );
}

function ApplePauseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5.5" y="3.5" width="4.5" height="17" rx="2.25" />
      <rect x="14" y="3.5" width="4.5" height="17" rx="2.25" />
    </svg>
  );
}

function ApplePlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function SoundWaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function ToolsGridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

interface CompactVolumeSliderProps {
  volume: number;
  onVolumeChange: (vol: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

// Dedicated high-performance volume slider with zero-latency synchronization
const CompactVolumeSlider = memo(function CompactVolumeSlider({
  volume,
  onVolumeChange,
  onDragStateChange
}: CompactVolumeSliderProps) {
  const [localVolume, setLocalVolume] = useState(() => Math.max(0, Math.min(100, Math.round(volume))));
  const [isDragging, setIsDragging] = useState(false);

  const isDraggingRef = useRef(false);
  const currentVolumeRef = useRef(localVolume);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const trackRectRef = useRef<DOMRect | null>(null);

  const onVolumeChangeRef = useRef(onVolumeChange);
  onVolumeChangeRef.current = onVolumeChange;

  const onDragStateChangeRef = useRef(onDragStateChange);
  onDragStateChangeRef.current = onDragStateChange;

  const throttleTimerRef = useRef<number | null>(null);
  const pendingVolumeRef = useRef<number | null>(null);
  const lastDispatchedVolumeRef = useRef<number>(localVolume);

  // Sync external volume updates ONLY when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      const clamped = Math.max(0, Math.min(100, Math.round(volume)));
      currentVolumeRef.current = clamped;
      setLocalVolume(clamped);
      if (fillRef.current) fillRef.current.style.width = `${clamped}%`;
      if (thumbRef.current) thumbRef.current.style.left = `${clamped}%`;
    }
  }, [volume]);

  // Throttled IPC dispatcher: at most 1 dispatch per 35ms (~28fps backend updates)
  const dispatchVolume = useCallback((val: number, immediate = false) => {
    pendingVolumeRef.current = val;

    if (immediate) {
      if (throttleTimerRef.current !== null) {
        window.clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      lastDispatchedVolumeRef.current = val;
      onVolumeChangeRef.current(val);
      return;
    }

    if (throttleTimerRef.current === null) {
      lastDispatchedVolumeRef.current = val;
      onVolumeChangeRef.current(val);

      throttleTimerRef.current = window.setTimeout(() => {
        throttleTimerRef.current = null;
        if (pendingVolumeRef.current !== null && pendingVolumeRef.current !== lastDispatchedVolumeRef.current) {
          lastDispatchedVolumeRef.current = pendingVolumeRef.current;
          onVolumeChangeRef.current(pendingVolumeRef.current);
        }
      }, 35);
    }
  }, []);

  const calculateVolumeFromX = useCallback((clientX: number): number => {
    if (!trackRef.current) return currentVolumeRef.current;
    const rect = trackRectRef.current || trackRef.current.getBoundingClientRect();
    if (!rect || rect.width <= 0) return currentVolumeRef.current;

    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }, []);

  const applyVolume = useCallback((val: number, immediate = false) => {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    currentVolumeRef.current = clamped;

    if (fillRef.current) {
      fillRef.current.style.width = `${clamped}%`;
    }
    if (thumbRef.current) {
      thumbRef.current.style.left = `${clamped}%`;
    }
    setLocalVolume(clamped);
    dispatchVolume(clamped, immediate);
  }, [dispatchVolume]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag on primary left mouse button
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    // Cache track dimensions at the start of drag
    if (trackRef.current) {
      trackRectRef.current = trackRef.current.getBoundingClientRect();
    }

    isDraggingRef.current = true;
    setIsDragging(true);
    onDragStateChangeRef.current?.(true);

    const target = e.currentTarget;
    const pointerId = e.pointerId;

    try {
      target.setPointerCapture(pointerId);
    } catch {}

    // Calculate initial click value and update immediately
    const startVal = calculateVolumeFromX(e.clientX);
    applyVolume(startVal, false);

    const onPointerMove = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return;
      ev.preventDefault();
      ev.stopPropagation();

      const nextVal = calculateVolumeFromX(ev.clientX);
      applyVolume(nextVal, false);
    };

    const onPointerEnd = (ev: PointerEvent) => {
      if (!isDraggingRef.current) return;
      ev.preventDefault();
      ev.stopPropagation();

      isDraggingRef.current = false;
      setIsDragging(false);
      onDragStateChangeRef.current?.(false);
      trackRectRef.current = null;

      try {
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
      } catch {}

      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerEnd);
      target.removeEventListener("pointercancel", onPointerEnd);
      target.removeEventListener("lostpointercapture", onPointerEnd);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);

      // Commit final volume immediately on release
      const finalVal = calculateVolumeFromX(ev.clientX);
      applyVolume(finalVal, true);
    };

    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerEnd);
    target.addEventListener("pointercancel", onPointerEnd);
    target.addEventListener("lostpointercapture", onPointerEnd);
    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onPointerEnd, { capture: true });
    window.addEventListener("pointercancel", onPointerEnd, { capture: true });
  };

  // Teardown ONLY on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current !== null) {
        window.clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        onDragStateChangeRef.current?.(false);
      }
    };
  }, []);

  return (
    <motion.div
      key="compact-volume-slider"
      className={`compact-volume-slider-bar ${isDragging ? "is-dragging" : ""}`}
      initial={{ opacity: 0, width: 0, scale: 0.94 }}
      animate={{ opacity: 1, width: 88, scale: 1 }}
      exit={{ opacity: 0, width: 0, scale: 0.94 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onPointerDown={handlePointerDown}
      title={`Volume: ${localVolume}%`}
    >
      <div
        className={`compact-volume-track ${isDragging ? "is-dragging" : ""}`}
        ref={trackRef}
      >
        <div
          ref={fillRef}
          className="compact-volume-fill"
          style={{ width: `${localVolume}%` }}
        />
        <div
          ref={thumbRef}
          className="compact-volume-thumb"
          style={{ left: `${localVolume}%` }}
        />
      </div>
    </motion.div>
  );
});

function SpotifyBadgeSvg({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#1db954" />
      <path
        d="M17.5 10.2c-2.8-1.7-7.4-1.8-10.1-1-.4.1-.9-.1-1-.6-.1-.4.1-.9.6-1 3.1-.9 8.2-.8 11.4 1.1.4.2.5.7.3 1.1-.2.4-.7.5-1.2.4zm-.2 2.7c-.3.4-.8.5-1.2.3-2.3-1.4-5.8-1.8-8.5-1-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.1-.9 7-.5 9.7 1.1.4.2.5.7.5 1.1zm-1.4 2.6c-.2.3-.6.4-.9.2-2-1.2-4.5-1.5-7.5-.8-.3.1-.7-.1-.8-.4-.1-.3.1-.7.4-.8 3.3-.8 6.1-.4 8.3.9.4.2.4.6.5.9z"
        fill="#000000"
      />
    </svg>
  );
}

function AppleMusicBadgeSvg({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#fa243c" />
      <path
        d="M16.5 7.5v6.2a2.3 2.3 0 1 1-1.5-2.2V9.3l-5 1.2v4.7a2.3 2.3 0 1 1-1.5-2.2V8.8a1 1 0 0 1 .8-1l6-1.5a1 1 0 0 1 1.2 1.2z"
        fill="#ffffff"
      />
    </svg>
  );
}

function YouTubeBadgeSvg({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#ff0000" />
      <polygon
        points="10,8 16,12 10,16"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GenericMusicBadgeSvg({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#0a84ff" />
      <path
        d="M12 4v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V8h4V4h-6z"
        fill="#ffffff"
      />
    </svg>
  );
}

function MediaSourceBadge({ source, size = 20 }: { source?: string; size?: number }) {
  const s = (source || "").toLowerCase();
  if (s.includes("spotify")) {
    return <SpotifyBadgeSvg size={size} />;
  }
  if (s.includes("apple")) {
    return <AppleMusicBadgeSvg size={size} />;
  }
  if (s.includes("youtube")) {
    return <YouTubeBadgeSvg size={size} />;
  }
  return <GenericMusicBadgeSvg size={size} />;
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

// Developer Coding Agent Icons & Status Glyphs
function AntigravityGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e07a5f" strokeWidth="2.4" strokeLinecap="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
    </svg>
  );
}

function ClaudeGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" fill="#d97706" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function CodexGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10a37f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 14a4 4 0 1 1 4-4 4 4 0 0 1-4 4z" />
    </svg>
  );
}

function AgentBrandIcon({ agentId, size = 18 }: { agentId?: string; size?: number }) {
  if (agentId === "claude") return <ClaudeGlyph size={size} />;
  if (agentId === "codex") return <CodexGlyph size={size} />;
  return <AntigravityGlyph size={size} />;
}

function AgentStatusGlyph({ status, size = 16 }: { status: AgentStatus; size?: number }) {
  if (status === "completed") {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" fill="rgba(52, 199, 89, 0.22)" stroke="#34c759" strokeWidth="1.8" />
        <path d="M6.5 10.2L8.8 12.5L13.5 7.8" stroke="#34c759" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "waiting") {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" fill="rgba(255, 189, 46, 0.22)" stroke="#ffbd2e" strokeWidth="1.8" />
        <circle cx="10" cy="10" r="2.5" fill="#ffbd2e" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" fill="rgba(255, 69, 58, 0.22)" stroke="#ff453a" strokeWidth="1.8" />
        <path d="M10 6v5M10 14h.01" stroke="#ff453a" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

function SwapArrowsIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

function formatElapsed(startedAt?: number): string {
  if (!startedAt) return "0:00";
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
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
      aria-label={label}
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
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

const formatTime = (ms?: number, forceHours = false) => {
  if (!ms || ms < 0 || isNaN(ms)) return forceHours ? "0:00:00" : "0:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (hours > 0 || forceHours) {
    return `${hours}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatPaddedTime = (ms?: number, forceHours = false) => {
  if (!ms || ms < 0 || isNaN(ms)) return forceHours ? "00:00:00" : "00:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (hours > 0 || forceHours) {
    return `${hours.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const formatRemainingTime = (posMs?: number, durMs?: number) => {
  if (!durMs || durMs <= 0 || isNaN(durMs)) return "-0:00";
  const validPos = Math.max(0, Math.min(durMs, posMs || 0));
  const remainingSec = Math.max(0, Math.floor((durMs - validPos) / 1000));
  const hours = Math.floor(remainingSec / 3600);
  const m = Math.floor((remainingSec % 3600) / 60);
  const s = remainingSec % 60;
  if (hours > 0 || durMs >= 3600000) {
    return `-${hours}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `-${m}:${s.toString().padStart(2, "0")}`;
};

// Universal Media Playback Clock (Spotify, YouTube, browser, VLC, generic)
function usePlaybackClock(media: MediaState | null) {
  const [currentPositionMs, setCurrentPositionMs] = useState<number>(0);
  const basePositionRef = useRef<number>(0);
  const baseTimestampRef = useRef<number>(0);
  const currentTrackKeyRef = useRef<string>("");
  const durationRef = useRef<number>(0);

  const isPlaying = media?.status === "playing";
  const durationMs = media?.durationMs || 0;
  durationRef.current = durationMs;

  const trackKey = media
    ? `${media.source}:::${media.title}:::${media.artist}:::${media.durationMs}`
    : "";

  // 1. Synchronize & reconcile on incoming media updates from system / media worker
  useEffect(() => {
    if (!media) {
      currentTrackKeyRef.current = "";
      basePositionRef.current = 0;
      baseTimestampRef.current = 0;
      setCurrentPositionMs(0);
      return;
    }

    const now = Date.now();
    const incomingPos = Math.max(0, media.positionMs || 0);

    // Track or source changed: immediate clean reset
    if (trackKey !== currentTrackKeyRef.current) {
      currentTrackKeyRef.current = trackKey;
      basePositionRef.current = incomingPos;
      baseTimestampRef.current = now;
      setCurrentPositionMs(incomingPos);
      return;
    }

    // Same track: reconcile
    if (!isPlaying) {
      // Paused: freeze at incoming position
      basePositionRef.current = incomingPos;
      baseTimestampRef.current = now;
      setCurrentPositionMs(incomingPos);
    } else {
      // Playing: compare estimated position with incoming position
      const elapsedSinceBase = now - baseTimestampRef.current;
      const estimatedPos = basePositionRef.current + elapsedSinceBase;
      const drift = Math.abs(incomingPos - estimatedPos);

      // If user sought in app or drift > 1.8s, immediately resync
      if (drift > 1800) {
        basePositionRef.current = incomingPos;
        baseTimestampRef.current = now;
        setCurrentPositionMs(incomingPos);
      } else if (drift > 300) {
        // Minor drift: smoothly reconcile base position
        basePositionRef.current = incomingPos;
        baseTimestampRef.current = now;
      }
    }
  }, [media, trackKey, isPlaying]);

  // 2. Playback ticker: updates elapsed time every second while playing
  useEffect(() => {
    if (!isPlaying || !media) return;

    // Do not run timer if position is unavailable (no duration and position is 0)
    if (media.durationMs <= 0 && media.positionMs <= 0) {
      setCurrentPositionMs(0);
      return;
    }

    const tick = () => {
      const now = Date.now();
      const elapsed = now - baseTimestampRef.current;
      const calculated = basePositionRef.current + elapsed;
      const maxDur = durationRef.current;

      const clamped = maxDur > 0 ? Math.min(maxDur, Math.max(0, calculated)) : Math.max(0, calculated);
      setCurrentPositionMs(Math.round(clamped));
    };

    tick();
    const interval = setInterval(tick, 500);

    return () => clearInterval(interval);
  }, [isPlaying, trackKey]);

  // Immediate seek synchronization
  const seekTo = useCallback((targetMs: number) => {
    const clamped = durationRef.current > 0
      ? Math.min(durationRef.current, Math.max(0, targetMs))
      : Math.max(0, targetMs);
    basePositionRef.current = clamped;
    baseTimestampRef.current = Date.now();
    setCurrentPositionMs(clamped);
  }, []);

  return { currentPositionMs, seekTo };
}

const TICK_SPACING = 14;
const MAX_MINUTES = 60;
const MIN_MINUTES = 1;
const centerOffset = 170;
const minX = centerOffset - MAX_MINUTES * TICK_SPACING; // -670
const maxX = centerOffset - MIN_MINUTES * TICK_SPACING; // 156

const TIMER_TICKS = Array.from({ length: 61 }, (_, m) => ({
  minute: m,
  isMajor: m % 5 === 0,
  label: m % 5 === 0 ? String(m) : null
}));

// Custom Timer Tape / Ruler Dial Component (Ultra-responsive, 120fps smooth scrolling)
function CustomTimerDial({
  selectedMinutes,
  onChange,
  onStart,
  onBackToTools,
  onClose
}: {
  selectedMinutes: number;
  onChange: (mins: number) => void;
  onStart: (mins: number) => void;
  onBackToTools: () => void;
  onClose: () => void;
}) {
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
        trackRef.current.style.transform = `translate3d(${snapX}px, 0, 0)`;
      }
      if (digitsRef.current) {
        digitsRef.current.textContent = `${selectedMinutes.toString().padStart(2, "0")}:00`;
      }
    }
  }, [selectedMinutes]);

  const updateDisplay = (x: number, notifyParent = false) => {
    const rawM = (centerOffset - x) / TICK_SPACING;
    const roundedM = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(rawM)));
    if (roundedM !== currentMinutesRef.current) {
      currentMinutesRef.current = roundedM;
      if (digitsRef.current) {
        digitsRef.current.textContent = `${roundedM.toString().padStart(2, "0")}:00`;
      }
    }
    if (notifyParent) {
      onChange(roundedM);
    }
  };

  // Continuous animation loop for physics lerping / wheel scrolling / snapping
  const animateToTarget = (onDone?: () => void) => {
    if (rafId.current !== null) cancelAnimationFrame(rafId.current);

    const step = () => {
      const diff = targetX.current - currentX.current;
      if (Math.abs(diff) < 0.2) {
        currentX.current = targetX.current;
        if (trackRef.current) {
          trackRef.current.style.transform = `translate3d(${currentX.current}px, 0, 0)`;
        }
        updateDisplay(currentX.current);
        rafId.current = null;
        if (onDone) onDone();
        return;
      }

      // Snappy, butter-smooth exponential lerp
      currentX.current += diff * 0.32;
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${currentX.current}px, 0, 0)`;
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
      trackRef.current.style.transform = `translate3d(${clampedX}px, 0, 0)`;
    }
    updateDisplay(clampedX, false);
  };

  const handlePointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    // Smooth magnetic snap to the nearest integer minute
    const nearestM = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round((centerOffset - currentX.current) / TICK_SPACING)));
    targetX.current = centerOffset - nearestM * TICK_SPACING;
    animateToTarget(() => {
      onChange(nearestM);
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (isDragging.current) return;

    // Support both trackpad smooth deltas and discrete mouse wheel notches
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 0.1) return;

    let step: number;
    if (Math.abs(delta) < 40) {
      // Smooth continuous scrolling (trackpad / precision wheel)
      step = -delta * 0.9;
    } else {
      // Discrete notches (mouse wheel)
      step = -Math.sign(delta) * (TICK_SPACING * 2);
    }

    const newTarget = Math.max(minX - 8, Math.min(maxX + 8, targetX.current + step));
    targetX.current = newTarget;

    animateToTarget();

    // Auto-snap to exact minute after wheel scrolling stops
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => {
      const nearestM = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round((centerOffset - targetX.current) / TICK_SPACING)));
      targetX.current = centerOffset - nearestM * TICK_SPACING;
      animateToTarget(() => {
        onChange(nearestM);
      });
    }, 110);
  };

  // Clean up RAF and timer on unmount
  useEffect(() => {
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, []);

  return (
    <motion.div
      className="custom-timer-setup-panel"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
    >
      {/* Top Header Row */}
      <div className="timer-setup-header" onPointerDown={(e) => e.stopPropagation()}>
        <button className="timer-nav-btn timer-back-btn" onClick={onBackToTools} title="Back to Quick Tools" aria-label="Back to Tools">
          <ToolsGridIcon />
          <span>Tools</span>
        </button>
        <span className="timer-setup-title">Set Timer</span>
        <button className="timer-min-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
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
            transform: `translate3d(${currentX.current}px, 0, 0)`
          }}
        >
          {TIMER_TICKS.map((t) => (
            <div
              key={t.minute}
              className={`timer-tick-wrap ${t.isMajor ? "is-major" : "is-minor"}`}
              style={{ left: `${t.minute * TICK_SPACING}px` }}
              onClick={(e) => {
                e.stopPropagation();
                if (t.minute >= 1) {
                  targetX.current = centerOffset - t.minute * TICK_SPACING;
                  animateToTarget(() => {
                    onChange(t.minute);
                  });
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
          onClick={() => onStart(currentMinutesRef.current)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
        >
          Start Timer
        </motion.button>

        <div ref={digitsRef} className="timer-display-digits-orange">
          {selectedMinutes.toString().padStart(2, "0")}:00
        </div>
      </div>
    </motion.div>
  );
}

function ScreenTimeRadarIcon() {
  return (
    <svg
      className="screentime-radar-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#30d158"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Radar beacon waves */}
      <circle cx="8" cy="7" r="2.2" fill="#30d158" stroke="none" />
      <path d="M4 12a7 7 0 0 1 8-8" strokeWidth="2.2" />
      <path d="M2 15a11 11 0 0 1 13-13" strokeWidth="2.2" />
      {/* Sleek Cursor Arrow */}
      <polygon
        points="9,8 9,19 12.5,15 17,15"
        fill="#30d158"
        stroke="#30d158"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const getInitialScreenTimeData = (): ScreenTimeData => {
  const now = new Date();
  const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const d2 = new Date(now);
  d2.setDate(now.getDate() - 2);
  const d1 = new Date(now);
  d1.setDate(now.getDate() - 1);

  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return {
    todayMinutes: 360,
    todayFormatted: "6h 00m",
    deltaMinutes: 0,
    deltaFormatted: "+0m",
    isAboveAverage: true,
    averageMinutes: 480,
    averageFormatted: "8H 00M",
    days: [
      {
        day: dayNames[d2.getDay()],
        date: formatDate(d2),
        minutes: 420,
        formattedTime: "7h 00m",
        isToday: false
      },
      {
        day: dayNames[d1.getDay()],
        date: formatDate(d1),
        minutes: 460,
        formattedTime: "7h 40m",
        isToday: false
      },
      {
        day: dayNames[now.getDay()],
        date: formatDate(now),
        minutes: 360,
        formattedTime: "6h 00m",
        isToday: true
      }
    ],
    maxScaleHours: 12,
    avgPercent: 66.6
  };
};

interface ScreenTimePanelProps {
  onBackToTools: () => void;
  onClose: () => void;
  onSwitchToMusic?: () => void;
  hasActiveMedia?: boolean;
  songTitle?: string;
  mediaSource?: string;
}

function ScreenTimePanel({ onBackToTools, onClose, onSwitchToMusic, hasActiveMedia, songTitle, mediaSource }: ScreenTimePanelProps) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [data, setData] = useState<ScreenTimeData>(getInitialScreenTimeData);

  useEffect(() => {
    let active = true;

    const fetchScreenTime = async () => {
      try {
        if (window.islet?.screentime?.get) {
          const res = await window.islet.screentime.get();
          if (active && res) {
            setData(res);
          }
        }
      } catch (err) {
        console.warn("[ScreenTime] Failed to fetch screen time:", err);
      }
    };

    fetchScreenTime();
    const timer = setInterval(fetchScreenTime, 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const maxScaleHours = data.maxScaleHours || 12;
  const totalScaleMinutes = maxScaleHours * 60;
  const avgPercent = data.avgPercent || ((data.averageMinutes / totalScaleMinutes) * 100);

  // Dynamic 4 scale ticks: 0, 1/4, 2/4, 3/4 of maxScaleHours (e.g. 0, 3, 6, 9 or 0, 4, 8, 12)
  const tickStep = Math.max(2, Math.round(maxScaleHours / 4));
  const tickValues = [0, tickStep, tickStep * 2, tickStep * 3];

  return (
    <motion.div
      key="expanded-screentime"
      className="expanded-screentime-panel"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
    >
      {/* Top Nav Row */}
      <div className="screentime-nav-row" onPointerDown={(e) => e.stopPropagation()}>
        <div className="screentime-nav-left">
          <button
            className="timer-nav-btn timer-back-btn"
            onClick={onBackToTools}
            title="Back to Quick Tools"
            aria-label="Back to Tools"
          >
            <ToolsGridIcon />
            <span>Tools</span>
          </button>
          {hasActiveMedia && onSwitchToMusic && (
            <button
              className="timer-nav-btn"
              onClick={onSwitchToMusic}
              title={`Switch to: ${songTitle || "Song"}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <MediaSourceBadge source={mediaSource} size={14} />
              <span>Song</span>
            </button>
          )}
        </div>

        {/* Minimize / Close */}
        <button
          className="timer-min-btn"
          onClick={onClose}
          title="Minimize to capsule (Esc)"
          aria-label="Minimize"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Screen Time Card Content */}
      <div className="screentime-card-content" onPointerDown={(e) => e.stopPropagation()}>
        {/* Header Row: [Radar Icon] [Real Today Time] [Real Delta] ... [AVG Real Average] */}
        <div className="screentime-header-row">
          <div className="screentime-header-left">
            <ScreenTimeRadarIcon />
            <span className="screentime-big-time">{data.todayFormatted}</span>
            <span
              className="screentime-delta-badge"
              style={
                !data.isAboveAverage
                  ? {
                      background: "rgba(48, 209, 88, 0.18)",
                      color: "#30d158",
                      boxShadow: "none"
                    }
                  : undefined
              }
            >
              {data.deltaFormatted}
            </span>
          </div>
          <div className="screentime-header-right">
            <span className="screentime-avg-label">
              AVG <span className="screentime-avg-val">{data.averageFormatted}</span>
            </span>
          </div>
        </div>

        {/* Chart Rows & Axis */}
        <div className="screentime-chart-container">
          <div className="screentime-rows-list">
            {data.days.map((d, index) => {
              const isToday = d.isToday;
              const isOvertime = d.minutes > data.averageMinutes;
              const dayPercent = Math.min(100, (d.minutes / totalScaleMinutes) * 100);

              const tooltip = isToday
                ? `${d.day} (Today): ${d.formattedTime} (${data.deltaFormatted} vs avg)`
                : `${d.day}: ${d.formattedTime}`;

              return (
                <div
                  key={d.day + d.date}
                  className={`screentime-bar-row ${hoveredDay === d.day ? "is-hovered" : ""}`}
                  onMouseEnter={() => setHoveredDay(d.day)}
                  onMouseLeave={() => setHoveredDay(null)}
                  title={tooltip}
                >
                  <span
                    className="screentime-day-label"
                    style={isToday ? { color: "#ffffff" } : undefined}
                  >
                    {d.day}
                  </span>
                  <div className="screentime-track-wrapper">
                    {tickValues.filter((t) => t > 0).map((t) => (
                      <div
                        key={t}
                        className="screentime-grid-line"
                        style={{ left: `${((t / maxScaleHours) * 100).toFixed(1)}%` }}
                      />
                    ))}
                    <div
                      className="screentime-overtime-zone"
                      style={{ left: `${avgPercent.toFixed(1)}%` }}
                    />
                    <div
                      className="screentime-avg-marker-line"
                      style={{ left: `${avgPercent.toFixed(1)}%` }}
                    />

                    {!isToday ? (
                      <motion.div
                        className="screentime-bar-gray"
                        initial={{ width: 0 }}
                        animate={{ width: `${dayPercent.toFixed(1)}%` }}
                        transition={{
                          duration: 0.45,
                          ease: [0.16, 1, 0.3, 1],
                          delay: 0.05 + index * 0.05
                        }}
                      />
                    ) : (
                      <div className="screentime-segmented-bar">
                        <motion.div
                          className="screentime-bar-white"
                          initial={{ width: 0 }}
                          animate={{
                            width: `${(isOvertime ? avgPercent : dayPercent).toFixed(1)}%`
                          }}
                          style={{
                            borderRadius: isOvertime && dayPercent > avgPercent ? "2px 0 0 2px" : "2px"
                          }}
                          transition={{
                            duration: 0.45,
                            ease: [0.16, 1, 0.3, 1],
                            delay: 0.15
                          }}
                        />
                        {isOvertime && (
                          <motion.div
                            className="screentime-bar-green"
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(100 - avgPercent, dayPercent - avgPercent).toFixed(1)}%`
                            }}
                            transition={{
                              duration: 0.45,
                              ease: [0.16, 1, 0.3, 1],
                              delay: 0.22
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dynamic Bottom Scale Axis: e.g. 0, 3, 6, 9 or 0, 4, 8, 12 */}
          <div className="screentime-axis-row">
            <div className="screentime-axis-spacer" />
            <div className="screentime-axis-ticks">
              {tickValues.map((t) => {
                const leftPct = (t / maxScaleHours) * 100;
                return (
                  <div key={t} className="screentime-tick" style={{ left: `${leftPct.toFixed(1)}%` }}>
                    <span className="tick-label">{t}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
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
  const [activeTab, setActiveTab] = useState<"music" | "shelf" | "tools" | "timer" | "screentime" | "agent">("tools");
  const [media, setMedia] = useState<MediaState | null>(null);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [, setAgentTicker] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);
  const { time, weather } = useLiveTimeAndWeather();
  const { currentPositionMs, seekTo } = usePlaybackClock(media);

  // Quick Action States
  const [customMinutes, setCustomMinutes] = useState(15);
  const [totalSeconds, setTotalSeconds] = useState(15 * 60);
  const [timerSeconds, setTimerSeconds] = useState(15 * 60);
  const [isTimerActiveSession, setIsTimerActiveSession] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFocusOn, setIsFocusOn] = useState(false);
  const timerProgress = totalSeconds > 0 ? Math.max(0, Math.min(1, timerSeconds / totalSeconds)) : 0;

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          setIsTimerActiveSession(false);
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

  // Compact Volume Slider state & interactions
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [activeVolume, setActiveVolume] = useState<number>(() => media?.volume ?? 50);
  const isAdjustingVolumeRef = useRef(false);
  const lastVolumeUserChangeTimeRef = useRef(0);

  const isExpanded = state === "expanded" || state === "expanding";
  const isCollapsing = state === "collapsing";

  // Active music detection: stays active while switching or while playing/paused
  const hasActiveMedia = Boolean(
    isSwitching || (media && (media.status === "playing" || (media.status === "paused" && media.title)))
  );

  // Active AI Developer Agent Detection
  const activeAgent = agentState?.activeAgent || null;
  const isAgentWorking = Boolean(
    activeAgent &&
    activeAgent.status !== "idle" &&
    activeAgent.status !== "unknown"
  );
  const isDualMode = Boolean(isAgentWorking && hasActiveMedia && media);
  const primaryMode = agentState?.primaryMode ?? "agent";

  // Real-time 1s ticker for elapsed agent duration
  useEffect(() => {
    if (!isAgentWorking) return;
    const tickerInterval = setInterval(() => {
      setAgentTicker((t) => t + 1);
    }, 1000);
    return () => clearInterval(tickerInterval);
  }, [isAgentWorking]);

  const handleSwapPrimary = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    window.islet?.agents?.swapPrimary?.().then((nextState) => {
      if (nextState) setAgentState(nextState);
    }).catch(console.error);
  }, []);

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
        setActiveTab((prev) => (prev === "shelf" || prev === "timer" || prev === "screentime" || prev === "tools" || prev === "agent" ? prev : "music"));
      } else {
        if (mediaClearTimer.current) {
          clearTimeout(mediaClearTimer.current);
          mediaClearTimer.current = null;
        }
        setMedia(null);
        setIsSwitching(false);
        setActiveTab((prev) => (prev === "shelf" || prev === "timer" || prev === "screentime" || prev === "agent" ? prev : "tools"));
      }
    });

    void api.agents?.getState?.().then((st) => {
      if (st) setAgentState(st);
    });

    const unsubscribeAgents = api.agents?.subscribe?.((nextState) => {
      if (nextState) setAgentState(nextState);
    });

    const removeExpanded = api.window.onExpanded(() => {
      setState("expanded");
    });

    const removeStartCollapse = api.window.onStartCollapse(() => {
      triggerCollapse();
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
      if (typeof unsubscribeAgents === "function") unsubscribeAgents();
      removeExpanded();
      removeStartCollapse();
      removeBlurred();
      window.removeEventListener("keydown", onKey);
      if (mediaClearTimer.current) clearTimeout(mediaClearTimer.current);
    };
  }, [isExpanded]);

  const switchTab = (tab: "music" | "shelf" | "tools" | "timer" | "screentime" | "agent") => {
    setActiveTab(tab);
    if (isExpanded) {
      const h =
        tab === "shelf"
          ? 176
          : tab === "timer"
          ? 118
          : tab === "screentime"
          ? 134
          : tab === "agent"
          ? (hasActiveMedia && media ? 204 : 160)
          : tab === "music"
          ? 152
          : 48;
      void window.islet.window.setExpanded(true, h);
    }
  };

  const collapseSafetyTimer = useRef<number | null>(null);

  const triggerExpand = useCallback((panelHeight?: number) => {
    if (stateRef.current === "expanded") return;
    if (collapseSafetyTimer.current) {
      clearTimeout(collapseSafetyTimer.current);
      collapseSafetyTimer.current = null;
    }
    setState("expanding");
    window.islet?.window?.setIgnoreMouseEvents?.(false);
    const h = panelHeight || (
      activeTab === "shelf" ? 176 :
        activeTab === "timer" ? 118 :
          activeTab === "screentime" ? 134 :
            activeTab === "agent" ? (hasActiveMedia && media ? 204 : 160) :
              activeTab === "music" && hasActiveMedia ? 152 :
                isAgentWorking && primaryMode === "agent" ? (hasActiveMedia && media ? 204 : 160) :
                  48
    );
    void window.islet.window.setExpanded(true, h).catch((err: unknown) => {
      console.error("Expand failed:", err);
      setState("collapsed");
      window.islet?.window?.setIgnoreMouseEvents?.(true, { forward: true });
    });
  }, [activeTab, hasActiveMedia]);

  // Synchronize activeVolume with external volume updates (ignoring stale backend responses during/after user interaction)
  useEffect(() => {
    if (typeof media?.volume === "number") {
      if (!isAdjustingVolumeRef.current && Date.now() - lastVolumeUserChangeTimeRef.current >= 1200) {
        setActiveVolume(media.volume);
      }
    }
  }, [media?.volume]);

  const handleVolumeChange = useCallback((newVol: number) => {
    lastVolumeUserChangeTimeRef.current = Date.now();
    setActiveVolume(newVol);
    void window.islet?.media?.setVolume?.(newVol);
  }, []);

  const handleDragStateChange = useCallback((dragging: boolean) => {
    isAdjustingVolumeRef.current = dragging;
  }, []);

  const triggerCollapse = useCallback(() => {
    if (stateRef.current === "collapsed" || stateRef.current === "collapsing") return;
    setState("collapsing");
    setIsVolumeOpen(false);
    isAdjustingVolumeRef.current = false;

    if (collapseSafetyTimer.current) clearTimeout(collapseSafetyTimer.current);
    collapseSafetyTimer.current = window.setTimeout(() => {
      collapseSafetyTimer.current = null;
      if (stateRef.current === "collapsing") {
        setState("collapsed");
        window.islet?.window?.setIgnoreMouseEvents?.(true, { forward: true });
        void window.islet?.window?.finishCollapse?.();
      }
    }, 480);

    void window.islet.window.collapse().catch((err: unknown) => {
      console.error("Collapse failed:", err);
      setState("collapsed");
      window.islet?.window?.setIgnoreMouseEvents?.(true, { forward: true });
    });
  }, []);

  const handleAnimationComplete = useCallback(() => {
    if (stateRef.current === "expanding") {
      setState("expanded");
    } else if (stateRef.current === "collapsing") {
      if (collapseSafetyTimer.current) {
        clearTimeout(collapseSafetyTimer.current);
        collapseSafetyTimer.current = null;
      }
      setState("collapsed");
      window.islet?.window?.setIgnoreMouseEvents?.(true, { forward: true });
      void window.islet.window.finishCollapse().catch((err: unknown) => {
        console.error("Finish collapse failed:", err);
      });
    }
  }, []);

  // =========================================================================
  // Hover to Expand & Smooth Collapse with Debounce & Grace Period
  // =========================================================================
  const hoverExpandTimer = useRef<number | null>(null);
  const hoverCollapseTimer = useRef<number | null>(null);
  const isHoveredSurfaceRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const isDraggingFileRef = useRef(isDraggingFile);
  isDraggingFileRef.current = isDraggingFile;

  const handleMouseEnter = useCallback(() => {
    isHoveredSurfaceRef.current = true;
    if (hoverCollapseTimer.current) {
      clearTimeout(hoverCollapseTimer.current);
      hoverCollapseTimer.current = null;
    }
    // Expand quickly on hover when collapsed or collapsing
    if (stateRef.current === "collapsed" || stateRef.current === "collapsing") {
      if (!hoverExpandTimer.current) {
        hoverExpandTimer.current = window.setTimeout(() => {
          hoverExpandTimer.current = null;
          if (isHoveredSurfaceRef.current) {
            triggerExpand();
          }
        }, 50);
      }
    }
  }, [triggerExpand]);

  const handleMouseLeave = useCallback(() => {
    isHoveredSurfaceRef.current = false;
    if (hoverExpandTimer.current) {
      clearTimeout(hoverExpandTimer.current);
      hoverExpandTimer.current = null;
    }
    // Prevent collapsing if user is adjusting volume or dragging a file
    if (isAdjustingVolumeRef.current || isDraggingFileRef.current) {
      return;
    }
    // Smooth hover-exit delay: 220ms gives natural grace without accidental collapse
    if (!hoverCollapseTimer.current) {
      hoverCollapseTimer.current = window.setTimeout(() => {
        hoverCollapseTimer.current = null;
        if (!isHoveredSurfaceRef.current && !isDraggingFileRef.current && !isAdjustingVolumeRef.current) {
          if (stateRef.current === "expanded" || stateRef.current === "expanding") {
            triggerCollapse();
          }
        }
      }, 220);
    }
  }, [triggerCollapse]);

  // Click-through pass-through & hover tracking:
  // Only the notch surface receives clicks & hover; transparent window background passes through clicks to underlying apps
  useEffect(() => {
    const api = window.islet;
    if (!api?.window?.setIgnoreMouseEvents) return;

    // Start with clicks ignored on transparent areas (forward mousemove so we still detect hovering over notch)
    api.window.setIgnoreMouseEvents(true, { forward: true });

    let isOverNotch = false;
    let scheduled = false;
    let latestE: MouseEvent | null = null;

    const checkHover = () => {
      scheduled = false;
      if (!latestE) return;

      const surface = document.querySelector(".islet-notch-surface");
      if (!surface) return;
      const rect = surface.getBoundingClientRect();
      const over = (
        latestE.clientX >= rect.left &&
        latestE.clientX <= rect.right &&
        latestE.clientY >= rect.top &&
        latestE.clientY <= rect.bottom
      );

      if (over !== isOverNotch) {
        isOverNotch = over;
        if (over) {
          api.window.setIgnoreMouseEvents(false);
          handleMouseEnter();
        } else {
          if (!isAdjustingVolumeRef.current && !isDraggingFileRef.current) {
            handleMouseLeave();
          }
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      latestE = e;
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(checkHover);
      }
    };

    const handleWindowLeave = () => {
      if (isOverNotch) {
        isOverNotch = false;
        handleMouseLeave();
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleWindowLeave);
    document.addEventListener("mouseleave", handleWindowLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleWindowLeave);
      document.removeEventListener("mouseleave", handleWindowLeave);
    };
  }, [handleMouseEnter, handleMouseLeave]);

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

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!media || !media.durationMs || media.durationMs <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMs = Math.round(ratio * media.durationMs);
    seekTo(targetMs);
    void window.islet.media.seek(targetMs).catch((err: unknown) => console.error("Media seek error:", err));
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
  const isLongMedia = Boolean(media && (media.durationMs >= 3600000 || currentPositionMs >= 3600000));
  const isYouTubeMedia = Boolean(
    media && (
      media.source === "youtube" ||
      media.title?.toLowerCase().includes("youtube") ||
      media.artist?.toLowerCase().includes("youtube")
    )
  );
  const progressPercent =
    media && media.durationMs > 0
      ? Math.min(100, Math.max(0, (currentPositionMs / media.durationMs) * 100))
      : 0;

  const isShelfActive = activeTab === "shelf" && storedImages.length > 0;
  const isTimerActive = activeTab === "timer";
  const isScreenTimeActive = activeTab === "screentime";
  const isAgentActive = Boolean(
    activeAgent && (
      activeTab === "agent" ||
      (isAgentWorking && primaryMode === "agent" && activeTab !== "shelf" && activeTab !== "tools" && activeTab !== "timer" && activeTab !== "screentime")
    )
  );
  const isMusicActive = Boolean(
    hasActiveMedia && media && !isAgentActive &&
    activeTab !== "shelf" && activeTab !== "tools" && activeTab !== "timer" && activeTab !== "screentime"
  );
  // Show collapsed timer capsule when timer is active (running or paused)
  const showCollapsedTimer = isTimerActiveSession;

  // Dynamic sleek proportions:
  let targetWidth = 250;
  let targetHeight = 42;
  let targetRadius = "21px";

  if (isExpanded && !isCollapsing) {
    if (isShelfActive) {
      targetWidth = 372;
      targetHeight = 176;
      targetRadius = "28px";
    } else if (isTimerActive) {
      targetWidth = 356;
      targetHeight = 118;
      targetRadius = "28px";
    } else if (isScreenTimeActive) {
      targetWidth = 356;
      targetHeight = 134;
      targetRadius = "28px";
    } else if (isAgentActive) {
      targetWidth = 372;
      targetHeight = hasActiveMedia && media ? 204 : 160;
      targetRadius = "28px";
    } else if (isMusicActive) {
      targetWidth = 368;
      targetHeight = 152;
      targetRadius = "28px";
    } else {
      // Short, sleek Quick Actions Bar — only 48px high!
      targetWidth = 356;
      targetHeight = 48;
      targetRadius = "24px"; // Perfectly continuous semicircle pill ends!
    }
  } else {
    if (isDualMode) {
      targetWidth = 364;
      targetHeight = 44;
      targetRadius = "22px";
    } else if (isAgentWorking) {
      targetWidth = 330;
      targetHeight = 42;
      targetRadius = "21px";
    } else if (showCollapsedTimer) {
      targetWidth = 200;
      targetHeight = 38;
      targetRadius = "19px";
    } else if (hasActiveMedia && media) {
      // Sleek music pill (356px x 44px with 22px continuous pill radius)
      targetWidth = 356;
      targetHeight = 44;
      targetRadius = "22px";
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
        className={`islet-notch-surface ${
          state === "expanded" || state === "expanding"
            ? "mode-expanded"
            : state === "collapsing"
            ? "mode-collapsing"
            : "mode-collapsed"
        } ${isDraggingFile ? "notch-drop-active" : ""}`}
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
        transition={
          isCollapsing
            ? {
                duration: 0.28,
                ease: [0.32, 0.72, 0, 1]
              }
            : {
                duration: 0.26,
                ease: [0.16, 1, 0.3, 1]
              }
        }
        onAnimationComplete={handleAnimationComplete}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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

        <AnimatePresence initial={false}>
          {isExpanded && !isCollapsing ? (
            isShelfActive ? (
              /* =================================================================
                 EXPANDED TEMPORARY IMAGE SHELF
                 ================================================================= */
              <motion.div
                key="expanded-shelf"
                className="expanded-shelf-panel"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              >
                {/* Header */}
                <div className="shelf-header">
                  <div className="shelf-title-wrap" onPointerDown={(e) => e.stopPropagation()}>
                    <span className="shelf-brand">Saved Files</span>
                    <span className="shelf-count-tag">
                      {storedImages.length} {storedImages.length === 1 ? "file" : "files"}
                    </span>
                  </div>

                  <div className="shelf-header-actions" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                      className="shelf-song-btn shelf-tools-btn"
                      onClick={() => switchTab("tools")}
                      title="Back to Tools"
                    >
                      <ToolsGridIcon />
                      <span>Tools</span>
                    </button>
                    {hasActiveMedia && media && (
                      <button
                        className="shelf-song-btn"
                        onClick={() => switchTab("music")}
                        title={`Back to: ${media.title}`}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                      >
                        <MediaSourceBadge source={media.source} size={15} />
                        <span className="shelf-song-title">Song</span>
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
                  <span>Drop your images</span>
                </div>
              </motion.div>
            ) : isTimerActive ? (
              !isTimerActiveSession ? (
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
                  onStart={(mins) => {
                    const m = mins ?? customMinutes;
                    setCustomMinutes(m);
                    setTotalSeconds(m * 60);
                    setTimerSeconds(m * 60);
                    setIsTimerActiveSession(true);
                    setIsTimerRunning(true);
                  }}
                  onBackToTools={() => switchTab("tools")}
                  onClose={triggerCollapse}
                />
              ) : (
                /* =================================================================
                   ACTIVE RUNNING TIMER PANEL (Screenshot 2 exact replica)
                   ================================================================= */
                <motion.div
                  key="expanded-timer-running"
                  className="expanded-timer-panel"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                >
                  {/* Dynamic Island Animated Perimeter Progress Contour (Screenshot 2 replica) */}
                  <svg
                    className="timer-perimeter-svg"
                    viewBox="0 0 356 118"
                    preserveAspectRatio="none"
                  >
                    {/* Background Subtle Amber Track with smooth rounded corners on all edges */}
                    <path
                      d="M 220 3.5 L 330.5 3.5 A 22 22 0 0 1 352.5 25.5 L 352.5 90 A 24.5 24.5 0 0 1 328 114.5 L 28 114.5 A 24.5 24.5 0 0 1 3.5 90 L 3.5 25.5 A 22 22 0 0 1 25.5 3.5 L 220 3.5"
                      fill="none"
                      stroke="rgba(255, 159, 10, 0.14)"
                      strokeWidth="1.8"
                    />
                    {/* Active Vivid Orange Running Progress Contour with clean 2.2px line width */}
                    <path
                      d="M 220 3.5 L 330.5 3.5 A 22 22 0 0 1 352.5 25.5 L 352.5 90 A 24.5 24.5 0 0 1 328 114.5 L 28 114.5 A 24.5 24.5 0 0 1 3.5 90 L 3.5 25.5 A 22 22 0 0 1 25.5 3.5 L 220 3.5"
                      fill="none"
                      stroke="#ff9f0a"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      pathLength={100}
                      strokeDasharray={`${Math.max(0.01, timerProgress * 100)} 100`}
                      strokeDashoffset={0}
                      style={{ transition: "stroke-dasharray 0.8s linear" }}
                    />
                  </svg>

                  {/* Top Header Row with Navigation & Close */}
                  <div className="timer-header-row" onPointerDown={(e) => e.stopPropagation()}>
                    <div className="timer-header-left">
                      <button
                        className="timer-nav-btn timer-back-btn"
                        onClick={() => switchTab("tools")}
                        title="Back to Quick Tools"
                        aria-label="Back to Tools"
                      >
                        <ToolsGridIcon />
                        <span>Tools</span>
                      </button>
                      {hasActiveMedia && media && (
                        <button
                          className="timer-nav-btn"
                          onClick={() => switchTab("music")}
                          title={`Switch to: ${media.title}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <MediaSourceBadge source={media.source} size={14} />
                          <span>Song</span>
                        </button>
                      )}
                    </div>

                    {/* Minimize / Close */}
                    <button
                      className="timer-min-btn"
                      onClick={triggerCollapse}
                      title="Minimize to capsule (Esc)"
                      aria-label="Minimize"
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  {/* Main Row: [Pause Circle Button] [Center: Bell + Big Digits + Timer] [Cancel Red Circle Button] */}
                  <div className="timer-main-row" onPointerDown={(e) => e.stopPropagation()}>
                    <motion.button
                      className={`timer-action-btn timer-pause-btn ${!isTimerRunning ? "is-paused" : ""}`}
                      onClick={() => setIsTimerRunning((prev) => !prev)}
                      title={isTimerRunning ? "Pause timer" : "Resume timer"}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.94 }}
                      transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                    >
                      {isTimerRunning ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                          <rect x="6" y="4" width="4.2" height="16" rx="2.1" />
                          <rect x="13.8" y="4" width="4.2" height="16" rx="2.1" />
                        </svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="white" style={{ marginLeft: "2px" }}>
                          <polygon points="7,4 20,12 7,20" />
                        </svg>
                      )}
                    </motion.button>

                    <div className="timer-center-display">
                      {/* Bell + Finish Time (Centered directly above countdown, Screenshot 2 replica) */}
                      <div className="timer-alarm-info" title="Estimated finish time">
                        <BellSvg />
                        <span>{getEndTime(timerSeconds)}</span>
                      </div>
                      <div className="timer-big-digits">{formatTimer(timerSeconds)}</div>
                      <div className="timer-sublabel">Timer</div>
                    </div>

                    <motion.button
                      className="timer-action-btn timer-cancel-btn"
                      onClick={() => {
                        setIsTimerRunning(false);
                        setIsTimerActiveSession(false);
                        setTimerSeconds(customMinutes * 60);
                        setTotalSeconds(customMinutes * 60);
                      }}
                      title="Cancel & Reset Timer"
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.94 }}
                      transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff453a" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="17" y1="7" x2="7" y2="17" />
                        <line x1="7" y1="7" x2="17" y2="17" />
                      </svg>
                    </motion.button>
                  </div>
                </motion.div>
              )
            ) : isScreenTimeActive ? (
              /* =================================================================
                 EXPANDED SCREEN TIME WIDGET (Exact User Screenshot Replica)
                 ================================================================= */
              <ScreenTimePanel
                key="expanded-screentime"
                onBackToTools={() => switchTab("tools")}
                onClose={triggerCollapse}
                onSwitchToMusic={() => switchTab("music")}
                hasActiveMedia={hasActiveMedia}
                songTitle={media?.title}
                mediaSource={media?.source}
              />
            ) : isAgentActive && activeAgent ? (
              /* =================================================================
                 EXPANDED DEVELOPER AGENT ACTIVITY PANEL
                 ================================================================= */
              <motion.div
                key="expanded-agent"
                className="expanded-agent-panel"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* Top Row: Brand & Name, Status Pill, and Actions */}
                <div className="agent-panel-header">
                  <div className="agent-panel-brand">
                    <AgentBrandIcon agentId={activeAgent.agentId} size={20} />
                    <span className="agent-panel-name">{activeAgent.agentName}</span>
                    <span className={`agent-status-pill is-${activeAgent.status}`}>
                      {activeAgent.statusText || activeAgent.status}
                    </span>
                  </div>

                  <div className="agent-panel-actions">
                    {hasActiveMedia && media && (
                      <button
                        className="agent-panel-swap-btn"
                        onClick={handleSwapPrimary}
                        title="Swap focus to Spotify"
                      >
                        <SwapArrowsIcon size={12} />
                        <span>Music</span>
                      </button>
                    )}
                    <button
                      className="music-tools-btn"
                      onClick={() => switchTab("tools")}
                      title="Open Tools"
                      aria-label="Tools"
                    >
                      <ToolsGridIcon />
                    </button>
                    <button
                      className="music-close-btn"
                      onClick={triggerCollapse}
                      title="Minimize to capsule (Esc)"
                      aria-label="Minimize"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>

                {/* Center Card: Active Task and Details */}
                <div className="agent-panel-card">
                  <div className="agent-task-title" title={activeAgent.taskTitle || "Agent Task"}>
                    {activeAgent.taskTitle || "Processing Assistant Instructions"}
                  </div>
                  <div className="agent-task-meta">
                    <div className="agent-active-action">
                      {activeAgent.status === "completed" ? (
                        <AgentStatusGlyph status="completed" size={14} />
                      ) : (
                        <span
                          className="agent-tool-dot"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: activeAgent.status === "waiting" ? "#ffbd2e" : activeAgent.status === "failed" ? "#ff453a" : "#ea580c",
                            boxShadow: "0 0 6px currentColor"
                          }}
                        />
                      )}
                      <span>{activeAgent.activeTool || (activeAgent.status === "completed" ? "Task Complete" : "Thinking...")}</span>
                    </div>
                    <span className="agent-duration">
                      {formatElapsed(activeAgent.startedAt)}
                    </span>
                  </div>
                </div>

                {/* Bottom: Spotify Playback Mini-Strip if active */}
                {hasActiveMedia && media && (
                  <div className="agent-spotify-strip" onClick={() => switchTab("music")} title="Click to open full player">
                    <div className="agent-spotify-left">
                      <MediaSourceBadge source={media.source} size={20} />
                      <div className="agent-spotify-text">
                        <span className="agent-spotify-title">{media.title}</span>
                        <span className="agent-spotify-artist">{media.artist || "Unknown Artist"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <MicroEq />
                      <button
                        className="agent-spotify-play-btn"
                        onClick={handlePlayPause}
                        title={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? <ApplePauseIcon /> : <ApplePlayIcon />}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : isMusicActive && media ? (
              /* =================================================================
                 EXPANDED MUSIC PLAYER (Screenshot 2 exact replica)
                 ================================================================= */
              <motion.div
                key="expanded-music"
                className="expanded-music-panel"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              >
                {/* Top Row: [52px Artwork] [Title & Artist] [SoundWave / Minimize] */}
                <div className="expanded-music-top-row">
                  <div className="expanded-music-art-wrap">
                    <AlbumArtwork
                      src={media.artworkUrl}
                      title={media.title}
                      artist={media.artist}
                      source={media.source}
                      className="expanded-music-art"
                      size={52}
                    />
                  </div>

                  <div className="expanded-music-info">
                    <span className="expanded-music-title" title={media.title}>
                      {isSwitching ? "" : media.title}
                    </span>
                    {media.artist &&
                    media.artist !== "Unknown Artist" &&
                    !media.artist.toLowerCase().includes("youtube") ? (
                      <span className="expanded-music-artist" title={media.artist}>
                        {isSwitching ? "" : media.artist}
                      </span>
                    ) : !isYouTubeMedia ? (
                      <span className="expanded-music-artist" title={media.artist}>
                        {isSwitching ? "" : media.artist || "Unknown Artist"}
                      </span>
                    ) : null}
                  </div>

                  <div className="expanded-music-top-right" onPointerDown={(e) => e.stopPropagation()}>
                    <AnimatePresence>
                      {isVolumeOpen && (
                        <CompactVolumeSlider
                          volume={activeVolume}
                          onVolumeChange={handleVolumeChange}
                          onDragStateChange={handleDragStateChange}
                        />
                      )}
                    </AnimatePresence>

                    {/* Agent Activity Shortcut (When Agent Active) */}
                    {isAgentWorking && (
                      <button
                        className="music-agent-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          switchTab("agent");
                        }}
                        title={`Agent active: ${activeAgent?.agentName} (${activeAgent?.status}) — View`}
                        aria-label="Agent"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "rgba(255, 255, 255, 0.08)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          color: "rgba(255, 255, 255, 0.72)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          padding: 0
                        }}
                      >
                        <AgentBrandIcon agentId={activeAgent?.agentId} size={14} />
                      </button>
                    )}

                    {/* Tools Navigation Button */}
                    <button
                      className="music-tools-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        switchTab("tools");
                      }}
                      title="Open Tools"
                      aria-label="Tools"
                    >
                      <ToolsGridIcon />
                    </button>

                    <button
                      className={`music-soundwave-btn ${isVolumeOpen ? "is-active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsVolumeOpen((prev) => !prev);
                      }}
                      title={isVolumeOpen ? "Hide Volume" : `Volume: ${Math.round(activeVolume)}%`}
                      aria-label="Volume"
                    >
                      <SoundWaveIcon />
                    </button>
                    <button
                      className="music-close-btn"
                      onClick={triggerCollapse}
                      title="Minimize to capsule (Esc)"
                      aria-label="Minimize"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>

                {/* Middle Row: [0:48] [Scrubber Track with Light Cyan Fill] [-2:08] */}
                <div className="expanded-music-scrubber-row" onPointerDown={(e) => e.stopPropagation()}>
                  <span className="scrubber-time-label">
                    {formatTime(currentPositionMs, isLongMedia)}
                  </span>

                  <div
                    className="expanded-scrubber-track"
                    onClick={handleSeek}
                    title="Click to seek"
                  >
                    <div
                      className="expanded-scrubber-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <span className="scrubber-time-label align-right">
                    {formatRemainingTime(currentPositionMs, media.durationMs)}
                  </span>
                </div>

                {/* Bottom Row: Centered Playback Controls [Previous  Play/Pause  Next] */}
                <div className="expanded-music-controls-row" onPointerDown={(e) => e.stopPropagation()}>
                  <div className="expanded-transport-center">
                    <motion.button
                      className="apple-transport-btn"
                      onClick={handlePrev}
                      title="Previous"
                      aria-label="Previous"
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.88 }}
                      transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                    >
                      <ApplePrevIcon />
                    </motion.button>

                    <motion.button
                      className="apple-transport-play-btn"
                      onClick={handlePlayPause}
                      title={isPlaying ? "Pause" : "Play"}
                      aria-label={isPlaying ? "Pause" : "Play"}
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.88 }}
                      transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                    >
                      {isPlaying ? <ApplePauseIcon /> : <ApplePlayIcon />}
                    </motion.button>

                    <motion.button
                      className="apple-transport-btn"
                      onClick={handleNext}
                      title="Next"
                      aria-label="Next"
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.88 }}
                      transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                    >
                      <AppleNextIcon />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* =================================================================
                 EXPANDED QUICK ACTIONS ISLAND (MacBook Style, Short & Compact)
                 ================================================================= */
              <motion.div
                key="expanded-quick-tools"
                className="expanded-quickbar-panel"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Brand Logo */}
                <div className="quickbar-brand" onPointerDown={(e) => e.stopPropagation()}>
                  <img src={appLogo} alt="Logo" className="quickbar-logo" />
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
                      switchTab("shelf");
                    }}
                  />

                  {/* Timer / Pomodoro with interactive countdown */}
                  <motion.button
                    id="qi-timer"
                    className={`quick-icon-btn ${isTimerActiveSession ? "active timer-running" : ""}`}
                    title={isTimerActiveSession ? `Timer: ${formatTimer(timerSeconds)} (${isTimerRunning ? "Running" : "Paused"})` : `Custom Timer`}
                    aria-label="Timer"
                    onClick={() => {
                      switchTab("timer");
                    }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                  >
                    <span className="quick-icon-svg"><TimerSvg /></span>
                    {isTimerActiveSession && (
                      <span className="quick-timer-label">{formatTimer(timerSeconds)}</span>
                    )}
                  </motion.button>

                  {/* Screen Time */}
                  <motion.button
                    id="qi-screentime"
                    className="quick-icon-btn"
                    title="Screen Time"
                    aria-label="Screen Time"
                    onClick={() => {
                      switchTab("screentime");
                    }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                  >
                    <span className="quick-icon-svg"><ScreenTimeSvg /></span>
                  </motion.button>

                  {/* Focus Mode */}
                  <motion.button
                    id="qi-focus"
                    className={`quick-icon-btn ${isFocusOn ? "active focus-active" : ""}`}
                    title={isFocusOn ? "Focus Mode: Active (Click to turn off)" : "Turn on Focus Mode"}
                    aria-label="Focus Mode"
                    onClick={() => setIsFocusOn((prev) => !prev)}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                  >
                    <span className="quick-icon-svg"><FocusSvg /></span>
                    {isFocusOn && <span className="focus-indicator-dot" />}
                  </motion.button>

                  {/* Agent Activity Indicator & Tab Switch */}
                  {isAgentWorking && (
                    <motion.button
                      id="qi-agent"
                      className="quick-icon-btn active"
                      title={`Agent: ${activeAgent?.agentName} (${activeAgent?.statusText || activeAgent?.status})`}
                      aria-label="Agent Activity"
                      onClick={() => switchTab("agent")}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                    >
                      <span className="quick-icon-svg">
                        <AgentBrandIcon agentId={activeAgent?.agentId} size={15} />
                      </span>
                      {activeAgent?.status === "completed" ? (
                        <span className="focus-indicator-dot" style={{ background: "#34c759" }} />
                      ) : (
                        <span className="focus-indicator-dot" style={{ background: "#ea580c" }} />
                      )}
                    </motion.button>
                  )}

                </div>

                {/* Right controls: Media Return Button (when music active) & Close Button */}
                <div className="quickbar-right-actions" onPointerDown={(e) => e.stopPropagation()}>
                  {hasActiveMedia && media && (
                    <motion.button
                      className="quickbar-media-return-btn"
                      onClick={() => switchTab("music")}
                      title={`Return to: ${media.title} (${media.source === "spotify" ? "Spotify" : media.source === "youtube" ? "YouTube" : media.source === "apple-music" ? "Apple Music" : "Music"})`}
                      aria-label="Return to Music Player"
                      whileHover={{ scale: 1.10 }}
                      whileTap={{ scale: 0.92 }}
                      transition={{ type: "spring", stiffness: 450, damping: 24, mass: 0.5 }}
                    >
                      <MediaSourceBadge source={media.source} size={20} />
                    </motion.button>
                  )}
                  <button
                    className="quickbar-close-btn"
                    onClick={triggerCollapse}
                    title="Close (Esc)"
                    aria-label="Close"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </motion.div>
            )
          ) : showCollapsedTimer ? (
            /* =================================================================
               COLLAPSED TIMER CAPSULE (Screenshot 3 Top: 200px x 38px)
               ================================================================= */
            <motion.div
              key="collapsed-timer"
              className="capsule-timer-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.06, delay: 0 } }}
              whileHover={{ scale: 1.02 }}
              transition={{
                opacity: { duration: 0.24, delay: 0.10, ease: [0.32, 0.72, 0, 1] }
              }}
              onClick={() => {
                setActiveTab("timer");
                triggerExpand(118);
              }}
              title="Timer active — Hover to expand"
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
          ) : isDualMode ? (
            /* =================================================================
               COLLAPSED DUAL ACTIVITY CAPSULE: [ Agent / Spotify ] [ ⇄ ] [ Secondary ]
               ================================================================= */
            <motion.div
              key="collapsed-dual"
              className="capsule-dual-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.06, delay: 0 } }}
              whileHover={{ scale: 1.015 }}
              transition={{
                opacity: { duration: 0.24, delay: 0.10, ease: [0.32, 0.72, 0, 1] }
              }}
              onClick={() => {
                setActiveTab(primaryMode === "agent" ? "agent" : "music");
                triggerExpand(primaryMode === "agent" ? 204 : 152);
              }}
              title={
                primaryMode === "agent"
                  ? `Agent primary: ${activeAgent?.activeTool || activeAgent?.agentName} • Click swap (⇄) for Spotify`
                  : `Spotify primary: ${media?.title} • Click swap (⇄) for Agent`
              }
            >
              {primaryMode === "agent" ? (
                <>
                  {/* Primary Zone: Agent Activity */}
                  <div className="dual-primary-zone">
                    <AgentBrandIcon agentId={activeAgent?.agentId} size={18} />
                    <span className={`dual-agent-text is-${activeAgent?.status}`} title={activeAgent?.activeTool || activeAgent?.agentName}>
                      {activeAgent?.activeTool || activeAgent?.statusText || activeAgent?.agentName}
                    </span>
                    <span className="dual-agent-timer">
                      {formatElapsed(activeAgent?.startedAt)}
                    </span>
                  </div>

                  {/* Swap Button (⇄): exchanges primary & secondary focus */}
                  <button
                    className="dual-swap-btn"
                    onClick={handleSwapPrimary}
                    title="Swap primary focus to Spotify (music continues uninterrupted)"
                    aria-label="Swap Primary Activity"
                  >
                    <SwapArrowsIcon size={12} />
                  </button>

                  {/* Secondary Zone: Spotify Micro Badge + Equalizer */}
                  <div
                    className="dual-secondary-zone"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab("music");
                      triggerExpand(152);
                    }}
                    title={`Playing: ${media?.title}`}
                  >
                    <div className="dual-secondary-spotify">
                      <MediaSourceBadge source={media?.source} size={16} />
                      <MicroEq />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Primary Zone: Spotify Track & Artist */}
                  <div className="dual-primary-zone">
                    <AlbumArtwork
                      src={media?.artworkUrl}
                      title={media?.title}
                      artist={media?.artist}
                      source={media?.source}
                      className="capsule-art"
                      size={28}
                    />
                    <div className="dual-media-info">
                      <span className="dual-media-title" title={media?.title}>
                        {isSwitching ? "" : media?.title}
                      </span>
                      <span className="dual-media-artist" title={media?.artist}>
                        {isSwitching ? "" : media?.artist || "Unknown Artist"}
                      </span>
                    </div>
                    <div style={{ marginLeft: 4, display: "flex", alignItems: "center" }}>
                      <MicroEq />
                    </div>
                  </div>

                  {/* Swap Button (⇄): exchanges primary & secondary focus */}
                  <button
                    className="dual-swap-btn"
                    onClick={handleSwapPrimary}
                    title="Swap primary focus to Agent Activity"
                    aria-label="Swap Primary Activity"
                  >
                    <SwapArrowsIcon size={12} />
                  </button>

                  {/* Secondary Zone: Agent Icon & Status */}
                  <div
                    className="dual-secondary-zone"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab("agent");
                      triggerExpand(204);
                    }}
                    title={`Agent: ${activeAgent?.agentName} (${activeAgent?.status})`}
                  >
                    <AgentBrandIcon agentId={activeAgent?.agentId} size={16} />
                    {activeAgent?.status === "completed" ? (
                      <AgentStatusGlyph status="completed" size={14} />
                    ) : activeAgent?.status === "waiting" ? (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ffbd2e" }} />
                    ) : (
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ea580c", boxShadow: "0 0 5px #ea580c" }} />
                    )}
                  </div>
                </>
              )}
            </motion.div>
          ) : isAgentWorking ? (
            /* =================================================================
               COLLAPSED AGENT CAPSULE (Single Activity, exact media_1792765016206 replica)
               ================================================================= */
            <motion.div
              key="collapsed-agent"
              className="capsule-agent-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.06, delay: 0 } }}
              whileHover={{ scale: 1.015 }}
              transition={{
                opacity: { duration: 0.24, delay: 0.10, ease: [0.32, 0.72, 0, 1] }
              }}
              onClick={() => {
                setActiveTab("agent");
                triggerExpand(160);
              }}
              title={`${activeAgent?.agentName}: ${activeAgent?.activeTool || activeAgent?.statusText} — Hover to expand`}
            >
              <div className="agent-bar-left">
                <AgentBrandIcon agentId={activeAgent?.agentId} size={18} />
                <span className={`agent-bar-text is-${activeAgent?.status}`} title={activeAgent?.activeTool || activeAgent?.agentName}>
                  {activeAgent?.activeTool || activeAgent?.statusText || "Agent Working"}
                </span>
              </div>

              <div className="agent-bar-right">
                {activeAgent?.status === "completed" ? (
                  <AgentStatusGlyph status="completed" size={16} />
                ) : activeAgent?.status === "waiting" ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#ffbd2e" }}>WAITING</span>
                ) : (
                  <span className="agent-bar-timer is-running">
                    {formatElapsed(activeAgent?.startedAt)}
                  </span>
                )}
              </div>
            </motion.div>
          ) : hasActiveMedia && media ? (
            /* =================================================================
               COLLAPSED MUSIC CAPSULE (Screenshot 1 replica)
               ================================================================= */
            <motion.div
              key="collapsed-music"
              className="capsule-music-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.06, delay: 0 } }}
              whileHover={{ scale: 1.015 }}
              transition={{
                opacity: { duration: 0.24, delay: 0.10, ease: [0.32, 0.72, 0, 1] }
              }}
              onClick={() => {
                setActiveTab("music");
                triggerExpand(152);
              }}
              title="Music playing — Hover to expand"
            >
              {/* Left: Square Album Artwork */}
              <div className="capsule-art-wrap">
                <AlbumArtwork
                  src={media.artworkUrl}
                  title={media.title}
                  artist={media.artist}
                  source={media.source}
                  className="capsule-art"
                  size={32}
                />
              </div>

              {/* Next: Green Equalizer Bars + Current Playback Time (e.g. 00:51) */}
              <div className="capsule-eq-group">
                <MicroEq />
                <span className="capsule-time-text">
                  {formatPaddedTime(currentPositionMs, isLongMedia)}
                </span>
              </div>

              {/* Center: Track Title & Artist (or Video Title only for YouTube) */}
              <div className="capsule-meta">
                <span className="capsule-title" title={media.title}>
                  {isSwitching ? "" : media.title}
                </span>
                {!isYouTubeMedia && (
                  <span className="capsule-artist" title={media.artist}>
                    {isSwitching ? "" : media.artist || "Unknown Artist"}
                  </span>
                )}
              </div>

              {/* Far Right: Circular App Source Badge (Spotify, Apple Music — omitted for YouTube) */}
              {!isYouTubeMedia && (
                <div
                  className="capsule-source-badge"
                  title={
                    media.source === "spotify"
                      ? "Spotify"
                      : media.source === "apple-music"
                      ? "Apple Music"
                      : "Media"
                  }
                >
                  <MediaSourceBadge source={media.source} size={24} />
                </div>
              )}
            </motion.div>
          ) : (
            /* =================================================================
               COLLAPSED IDLE CAPSULE — Time, Day & Live Weather (250px x 42px)
               ================================================================= */
            <motion.div
              key="collapsed-idle"
              className="capsule-idle-bar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.06, delay: 0 } }}
              whileHover={{ scale: 1.02 }}
              transition={{
                opacity: { duration: 0.20, delay: 0.05, ease: [0.32, 0.72, 0, 1] }
              }}
              onClick={() => {
                triggerExpand();
              }}
              title="Dynamic Island — Hover to expand"
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
                      switchTab("shelf");
                      triggerExpand(176);
                    }}
                    title="Open Stored Images"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1 2-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
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
