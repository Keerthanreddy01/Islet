import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
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
        <div className="progress-row">
          <span>0:48</span><div className="progress"><div /></div><span>4:22</span>
        </div>
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
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>("nook");
  const [expanded, setExpanded] = useState(true);
  const [media, setMedia] = useState<MediaState | null>(null);
  const [calendar, setCalendar] = useState<CalendarWeek | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    void Promise.all([window.islet.media.getState(), window.islet.calendar.getWeek(), window.islet.tasks.list()])
      .then(([nextMedia, nextCalendar, nextTasks]) => { setMedia(nextMedia); setCalendar(nextCalendar); setTasks(nextTasks); });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleExpanded = () => { setExpanded((value) => !value); };
  const changeTab = (nextTab: Tab) => { setTab(nextTab); void window.islet.window.setActiveTab(nextTab); };
  const capture = () => { void window.islet.tasks.captureFromClipboard().then((task) => setTasks((items) => [...items, task])); };

  return (
    <motion.main className={`islet ${expanded ? "is-expanded" : "is-collapsed"}`} layout transition={{ type: "spring", stiffness: 300, damping: 28 }} onMouseLeave={() => expanded && setExpanded(false)}>
      <header className="topbar" onClick={toggleExpanded}>
        <nav>
          <button className={`tab ${tab === "nook" ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); changeTab("nook"); }}><Icon>⚒</Icon><span>Nook</span></button>
          <button className={`tab ${tab === "tray" ? "active" : ""}`} onClick={(event) => { event.stopPropagation(); changeTab("tray"); }}><Icon>▱</Icon><span>Tray</span></button>
        </nav>
        <button className="settings" aria-label="Settings">⚙</button>
      </header>
      <AnimatePresence mode="wait">
        {expanded && media && calendar && (
          <motion.div className="content" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {tab === "nook" ? <Nook media={media} calendar={calendar} /> : <Tray tasks={tasks} onCapture={capture} />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
