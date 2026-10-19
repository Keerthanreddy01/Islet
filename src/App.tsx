import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { CalendarWeek, MediaState, Tab, Task } from "../electron/ipc";

const mediaArt = "islet-art://placeholder.svg";

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function Nook({ media, calendar }: { media: MediaState; calendar: CalendarWeek }) {
  return (
    <div className="nook-grid">
      <section className="media-section">
        <div className="media-main">
          <div className="album-wrap">
            <img className="album-art" src={mediaArt} alt="" />
            <span className="source-badge">♫</span>
          </div>
          <div className="track-copy">
            <h1>{media.title}</h1>
            <h2>{media.album}</h2>
            <p>{media.artist}</p>
            <div className="transport">
              <button aria-label="Previous">◀</button>
              <button className="play" aria-label="Play">Ⅱ</button>
              <button aria-label="Next">▶</button>
            </div>
          </div>
        </div>
        <div className="progress-row"><span>0:48</span><div className="progress"><div /></div><span>4:22</span></div>
      </section>
      <section className="calendar-section">
        <div className="calendar-head">
          <strong>{calendar.month}</strong>
          <div className="days">{calendar.days.map((day) => (
            <div className={`day ${day.isToday ? "today" : ""}`} key={`${day.weekday}${day.date}`}>
              <span>{day.weekday}</span><b>{day.date}</b>{day.hasEvent && <i />}
            </div>
          ))}</div>
        </div>
        <div className="empty-calendar"><span className="calendar-icon">▣</span><span>Nothing for today</span></div>
      </section>
    </div>
  );
}

function Tray({ tasks, onCapture }: { tasks: Task[]; onCapture: () => void }) {
  return (
    <div className="tray-content">
      <div className="task-row">
        {tasks.map((task) => (
          <article className="task-card" key={task.id}>
            <div className="task-top"><span className="task-thumb">▦</span><div><button>✓</button><button>♜</button></div></div>
            <h2>{task.title}</h2><p>till {task.dueAt} · today · <a href="#link">{task.link}</a></p>
          </article>
        ))}
        <button className="capture" onClick={onCapture} aria-label="Capture clipboard"><span>⌗</span></button>
      </div>
      <div className="segmented"><button className="selected">Tasks</button><button>Clipboard</button></div>
    </div>
  );
}

type DragState = { active: boolean; moved: boolean; pointerId: number; frame: number | null };

export function App() {
  const [expanded, setExpanded] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const [tab, setTab] = useState<Tab>("nook");
  const [media, setMedia] = useState<MediaState | null>(null);
  const [calendar, setCalendar] = useState<CalendarWeek | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const drag = useRef<DragState>({ active: false, moved: false, pointerId: -1, frame: null });
  const latestPoint = useRef({ screenX: 0, screenY: 0 });

  useEffect(() => {
    void Promise.all([window.islet.media.getState(), window.islet.calendar.getWeek(), window.islet.tasks.list()])
      .then(([nextMedia, nextCalendar, nextTasks]) => { setMedia(nextMedia); setCalendar(nextCalendar); setTasks(nextTasks); });
    const removeExpanded = window.islet.window.onExpanded(() => { setCollapsing(false); setExpanded(true); });
    const removeStartCollapse = window.islet.window.onStartCollapse(() => {
      setCollapsing(true);
      window.setTimeout(() => {
        setExpanded(false);
        setCollapsing(false);
        void window.islet.window.finishCollapse();
      }, 240);
    });
    const removeBlurred = window.islet.window.onBlurred(() => void window.islet.window.collapse());
    const removeShown = window.islet.window.onShown(() => {
      setCollapsing(false);
      setExpanded(false);
    });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") void window.islet.window.collapse(); };
    window.addEventListener("keydown", onKey);
    return () => {
      removeExpanded();
      removeStartCollapse();
      removeBlurred();
      removeShown();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggle = () => {
    if (expanded) void window.islet.window.collapse();
    else {
      setExpanded(true);
      void window.islet.window.setExpanded(true);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { active: true, moved: false, pointerId: event.pointerId, frame: null };
    latestPoint.current = { screenX: event.screenX, screenY: event.screenY };
    void window.islet.window.beginDrag(latestPoint.current);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current.active || drag.current.pointerId !== event.pointerId) return;
    if (Math.hypot(event.movementX, event.movementY) > 0) drag.current.moved = true;
    latestPoint.current = { screenX: event.screenX, screenY: event.screenY };
    if (drag.current.frame === null) {
      drag.current.frame = requestAnimationFrame(() => {
        drag.current.frame = null;
        void window.islet.window.moveDrag(latestPoint.current);
      });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!drag.current.active || drag.current.pointerId !== event.pointerId) return;
    if (drag.current.frame !== null) cancelAnimationFrame(drag.current.frame);
    drag.current.active = false;
    void window.islet.window.endDrag();
    if (!drag.current.moved) toggle();
  };

  const capture = () => { void window.islet.tasks.captureFromClipboard().then((task) => setTasks((items) => [...items, task])); };

  return (
    <motion.main
      className={`islet ${expanded ? "expanded" : "collapsed"} ${collapsing ? "collapsing" : ""}`}
      animate={{
        width: expanded ? 680 : 64,
        height: expanded ? 300 : 64,
        borderRadius: expanded ? 36 : 32
      }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <header className="topbar drag-handle" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {!expanded ? <div className="islet-glyph">◒</div> : (
          <>
            <nav>
              <button className={`tab ${tab === "nook" ? "active" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setTab("nook")}><Icon>⚒</Icon><span>Nook</span></button>
              <button className={`tab ${tab === "tray" ? "active" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => setTab("tray")}><Icon>▱</Icon><span>Tray</span></button>
            </nav>
            <button className="settings" onPointerDown={(event) => event.stopPropagation()} aria-label="Settings">⚙</button>
          </>
        )}
      </header>
      <AnimatePresence mode="wait">
        {expanded && !collapsing && media && calendar && (
          <motion.div className="content" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.16 }}>
            {tab === "nook" ? <Nook media={media} calendar={calendar} /> : <Tray tasks={tasks} onCapture={capture} />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
