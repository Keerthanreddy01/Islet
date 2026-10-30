<p align="center">
  <img src="assets/logo.png" width="128" alt="Islet Logo" />
</p>

<h1 align="center">Islet</h1>

<p align="center">
  <b>A sleek, fluid Dynamic Island for Windows.</b><br />
  Keep your media, AI developer agent tasks, productivity tools, and system context right at your fingertips in one calm, compact surface.
</p>

<p align="center">
  <a href="https://github.com/Keerthanreddy01/Islet/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Keerthanreddy01/Islet/ci.yml?branch=main&style=flat-square&logo=github&label=CI" alt="CI Status" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue?style=flat-square&logo=windows" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-33-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License: MIT" /></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square" alt="PRs Welcome" /></a>
</p>

---

## 🌟 Overview

**Islet** brings the iconic **Dynamic Island** experience to Windows desktops. Sitting discreetly at the top center of your display, Islet seamlessly morphs between a minimalist notch capsule and an expanded control center using physics-based spring animations.

Whether you're listening to Spotify, monitoring a long-running coding task in Google Antigravity or Claude Code, setting a focus timer, or reviewing your screen time, Islet gives you ambient glanceability without interrupting your flow.

---

## ✨ Features

### 🎵 Dynamic Media Hub & Now-Playing
- **Universal Synchronization**: Real-time media detection via native Windows Media Session (`GSMTC`) supporting **Spotify**, **YouTube**, **Apple Music**, **Brave**, **Chrome**, **VLC**, and other players.
- **High-Res Artwork Resolver**: Automatic resolution of clean, high-resolution album artwork via Apple iTunes / Music APIs with smart local caching.
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
- **Windows 10 (version 1903+) or Windows 11** (64-bit)
- **Node.js** (v18.0.0 or higher recommended, LTS preferred)
- **npm** (v9 or higher)
- **PowerShell** 5.1+ (included by default in Windows 10 & 11)

### Installation & Development Setup

1. **Clone the repository:**
   ```powershell
   git clone https://github.com/Keerthanreddy01/Islet.git
   cd Islet
   ```

2. **Install dependencies:**
   ```powershell
   npm install
   ```

3. **Start in development mode:**
   ```powershell
   npm run dev
   ```
   *This starts the Vite development server and launches Electron with live hot-module replacement (HMR).*

4. **Verify TypeScript compilation & linting:**
   ```powershell
   npm run lint
   ```

5. **Build for production:**
   ```powershell
   npm run build
   ```

6. **Generate the Windows installer:**
   ```powershell
   npm run dist
   ```
   *The installer executable (`Islet Setup <version>.exe`) will be generated inside the `release/` directory.*

---

## ⌨️ Shortcuts & Interaction

| Action | Control |
|---|---|
| **Expand / Inspect** | Hover over the capsule or click |
| **Collapse / Dismiss** | Press `Esc` or move cursor away |
| **Toggle Island** | `Ctrl + Alt + Space` |
| **Swap Dual Activity** | Click the swap button `⇄` |
| **Switch Tabs** | Click Tools / Music icons in the header |
| **System Tray** | Right-click the Islet tray icon for quick controls, autostart toggle, and quit |

---

## 🛠️ Architecture & Tech Stack

```
Islet/
├── .github/
│   ├── ISSUE_TEMPLATE/      # Bug report and feature request forms
│   ├── workflows/ci.yml     # Automated GitHub Actions CI workflow
│   ├── dependabot.yml       # Automated dependency monitoring
│   └── PULL_REQUEST_TEMPLATE.md
├── assets/                  # Logos, icons, and artwork
├── build/                   # NSIS custom installer configuration & icons
├── docs/                    # Project documentation
│   ├── README.md            # Primary repository documentation
│   ├── CHANGELOG.md         # Release history and updates
│   ├── CODE_OF_CONDUCT.md   # Contributor Covenant Code of Conduct
│   ├── CONTRIBUTING.md      # Contribution guidelines & PR workflow
│   └── SECURITY.md          # Security and vulnerability disclosure policy
├── electron/
│   ├── main.ts              # Electron lifecycle, window creation & positioning
│   ├── media-service.ts     # Windows GSMTC media worker & session listener
│   ├── media-worker.ps1     # Native Windows Runtime media transport background bridge
│   ├── agent-service.ts     # Real-time Antigravity & Claude Code transcript adapter
│   ├── screentime-service.ts# Windows screen time statistics provider
│   ├── screentime-worker.ps1# Windows screen time worker
│   ├── preload.cts          # Secure IPC context bridge
│   └── ipc.ts               # Type-safe IPC interfaces and data models
├── resources/               # Installer images and resources
│   └── installerimage.png
├── scripts/                 # Build and utility scripts
│   ├── clean-binaries.cjs   # Distribution artifact optimizer
│   └── make-ico.ps1         # Windows multi-resolution icon generator
├── src/
│   ├── App.tsx              # Main Dynamic Island UI, state machines & tabs
│   ├── ErrorBoundary.tsx    # Crash resilience & fault recovery
│   ├── SettingsPanel.tsx    # Settings & configuration panel
│   ├── styles.css           # Curated dark-mode design system & animations
│   ├── vite-env.d.ts        # Vite environment types
│   └── main.tsx             # React entry point
├── .env.example             # Safe environment variable configuration template
├── .gitignore               # Git ignore rules
├── index.html               # Main HTML entry
├── LICENSE                  # MIT License
├── package.json             # Scripts and dependencies
├── package-lock.json        # Lockfile
├── postcss.config.js        # PostCSS configuration
├── tailwind.config.js       # Tailwind CSS configuration
├── tsconfig.electron.json   # TypeScript config for Electron process
├── tsconfig.json            # TypeScript config for React renderer
└── vite.config.ts           # Vite build configuration
```

- **Frontend**: [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Framer Motion](https://www.framer.com/motion/)
- **Desktop Engine**: [Electron 33](https://www.electronjs.org/), [Vite](https://vitejs.dev/)
- **Native Windows OS Bridge**: PowerShell background workers leveraging Windows Runtime `GlobalSystemMediaTransportControls` (`GSMTC`)

---

## 🗺️ Roadmap

- [x] **v0.1.0**: Core Dynamic Island capsule, hover expansion, GSMTC media sync, AI agent monitor, timer ruler dial, screen time widget, NSIS installer.
- [ ] **Custom Hotkey Rebinding**: Allow users to customize `Ctrl+Alt+Space` directly in the UI.
- [ ] **Multi-Monitor Display Selector**: Choose which monitor the island anchors to.
- [ ] **Additional AI Agent Adapters**: Support for additional local and remote developer tools.
- [ ] **Battery & Hardware Glance**: Ambient power, CPU/RAM glance for laptops.
- [ ] **Code Signing**: Windows Authenticode code-signing configuration for official releases.

---

## 🤝 Open Source & Contributing

Islet is **100% open-source**! We believe in building delightful, distraction-free desktop software, and community contributions are warmly welcomed.

Please review our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting pull requests.

### How You Can Help
- 🐛 **Report Bugs**: Encounter an issue? [Open a bug report](https://github.com/Keerthanreddy01/Islet/issues/new?template=bug_report.yml) with reproduction steps.
- 💡 **Suggest Features**: Have ideas for new tools or widget modules? [Open a feature request](https://github.com/Keerthanreddy01/Islet/issues/new?template=feature_request.yml).
- 🎨 **Improve Aesthetics**: Enhance micro-animations, layout responsiveness, and polish.
- 💻 **Submit Pull Requests**: Check out open issues, fork the repo, create a feature branch, and submit a PR!

---

## 🔒 Security

For details on reporting security vulnerabilities, please refer to our [Security Policy](SECURITY.md).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) © 2026 Keerthan Reddy.

<p align="center">
  Crafted with care by <a href="https://github.com/Keerthanreddy01">Keerthan Reddy</a> and contributors.
</p>


## Community & Security

- [Contributing guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
