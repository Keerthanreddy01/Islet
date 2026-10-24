<p align="center">
  <img src="assets/logo.png" width="128" alt="Islet Logo" />
</p>

<h1 align="center">Islet</h1>

<p align="center">
  <b>A sleek, fluid Dynamic Island for Windows.</b><br />
  Keep your media, AI developer agent tasks, productivity tools, and system context right at your fingertips in one calm, compact surface.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue?style=flat-square&logo=windows" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
</p>

---

## 🌟 Overview

**Islet** brings the iconic **Dynamic Island** experience to Windows desktops. Sitting discreetly at the top center of your display, Islet seamlessly morphs between a minimalist notch capsule and an expanded control center using physics-based spring animations.

Whether you're listening to Spotify, monitoring a long-running coding task in Google Antigravity or Claude Code, setting a focus timer, or reviewing your screen time, Islet gives you ambient glanceability without interrupting your flow.

---

## ✨ Features

### 🎵 Dynamic Media Hub & Now-Playing
- **Universal Synchronization**: Real-time media detection via native Windows Media Session (`GSMTC`) supporting **Spotify**, **YouTube**, **Apple Music**, **Brave**, **Chrome**, **VLC**, and other players.
- **High-Res Artwork Resolver**: Automatic resolution of clean, high-resolution album artwork via Apple iTunes / Music APIs with smart caching.
- **Interactive Controls**: Play/pause, previous/next, live progress scrubbing, and volume adjustment.
- **Equalizer Animations**: Apple-inspired micro equalizer animations for active playback.

### 🤖 Developer AI Agent Activity Monitor
- **Real-Time Task Tracking**: Ambient status tracking for **Google Antigravity**, **Claude Code**, and **OpenAI Codex**.
- **Live Tool Introspection**: See whether your agent is `Editing App.tsx`, `Viewing styles.css`, `Running npm test`, or `Testing in browser`.
- **Clean Task Summaries**: Displays curated task titles and elapsed timers without exposing private prompts or raw code.
- **Status Lifecycle**: Visual states for running (pulsing orange indicator), completed (green glyph), waiting for input (yellow alert), and errors.

### ⇄ Dual-Activity Multitasking
- Play music while your AI agent codes in the background.
- Effortlessly swap primary and secondary focus with a single click (`⇄`) without interrupting playback.

### ⏱ Precision Haptic Timer Dial
- An Apple-inspired rotary ruler dial for friction-free minute adjustments and countdown timers.
- Smooth mouse drag and scroll wheel scrubbing with snappy easing.

### 📊 Screen Time & Productivity
- Daily and weekly device usage radar visualization.
- Glanceable breakdowns of active screen hours and averages.

### 📋 Floating Shelf
- Stash temporary clips, images, and notes on the top-level tray for fast access during workflow sessions.

---

## 🚀 Getting Started

### Prerequisites
- **Windows 10 or Windows 11** (64-bit)
- **Node.js** (v18.0.0 or higher recommended)
- **npm** (v9 or higher)

### Installation & Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Keerthanreddy01/Islet.git
   cd Islet
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start in development mode:**
   ```bash
   npm run dev
   ```
   *This starts the Vite development server and launches Electron with live hot-module replacement (HMR).*

4. **Build for production:**
   ```bash
   npm run build
   ```

5. **Generate the Windows installer:**
   ```bash
   npm run dist
   ```
   *The installer `.exe` will be generated inside the `dist/` directory.*

---

## ⌨️ Shortcuts & Interaction

| Action | Control |
|---|---|
| **Expand / Inspect** | Hover over the capsule or click |
| **Collapse / Dismiss** | Press `Esc` or move cursor away |
| **Toggle Island** | `Ctrl + Alt + Space` |
| **Swap Dual Activity** | Click the swap button `⇄` |
| **Switch Tabs** | Click Tools / Music icons in the header |

---

## 🛠️ Architecture & Tech Stack

```
Islet/
├── assets/                  # Logos, icons, and artwork
├── electron/
│   ├── main.ts              # Electron lifecycle, window creation & positioning
│   ├── media-service.ts     # Windows GSMTC media worker & session listener
│   ├── agent-service.ts     # Real-time Antigravity & Claude Code transcript adapter
│   ├── screentime-service.ts# Windows screen time statistics provider
│   └── ipc.ts               # Type-safe IPC interfaces and data models
├── src/
│   ├── App.tsx              # Main Dynamic Island UI, state machines & tabs
│   ├── ErrorBoundary.tsx    # Crash resilience & fault recovery
│   ├── styles.css           # Curated dark-mode design system & animations
│   └── main.tsx             # React entry point
└── package.json
```

- **Frontend**: [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Framer Motion](https://www.framer.com/motion/)
- **Desktop Engine**: [Electron](https://www.electronjs.org/), [Vite](https://vitejs.dev/)
- **Native OS Bridge**: PowerShell background workers leveraging Windows Runtime `GlobalSystemMediaTransportControls`

---

## 🤝 Open Source & Contributing

Islet is **100% open-source**! We believe in building delightful, distraction-free desktop software, and community contributions are warmly welcomed.

### How You Can Help
- 🐛 **Report Bugs**: Encounter an issue? [Open an issue](https://github.com/Keerthanreddy01/Islet/issues) with reproduction steps.
- 💡 **Suggest Features**: Have ideas for new tools, player integrations, or agent adapters? Let's discuss them!
- 🎨 **Improve Aesthetics**: Enhance animations, sound effects, or responsive adaptations.
- 💻 **Submit Pull Requests**:
  1. Fork the repository
  2. Create a feature branch (`git checkout -b feature/amazing-feature`)
  3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
  4. Push to your branch (`git push origin feature/amazing-feature`)
  5. Open a Pull Request

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).

<p align="center">
  Crafted with care by <a href="https://github.com/Keerthanreddy01">Keerthan Reddy</a> and contributors.
</p>
