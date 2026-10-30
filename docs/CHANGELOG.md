# Changelog

All notable changes to the **Islet** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Standardized open-source repository templates: Contributing guidelines, Code of Conduct, Security policy, Issue templates, and PR template.
- GitHub Actions CI workflow for automated TypeScript type checking, formatting validation, and production building.
- Dependabot configuration for automated dependency security monitoring.
- Environment variable template `.env.example`.

### Security
- Hardened `.gitignore` to prevent leakage of local secrets, build caches, and test artifacts.
- Removed hardcoded local developer machine paths from Electron asset resolver.

---

## [0.1.0] - 2026-10-24

### Added
- **Dynamic Island Architecture**: Fluid Windows top-anchored capsule with hover expansion, physics-based spring easing, and auto-centering.
- **Universal Media Hub**: Real-time media playback synchronization via native Windows Runtime `GSMTC` supporting Spotify, YouTube, Apple Music, VLC, Brave, and Chrome.
- **High-Resolution Artwork Resolver**: Dynamic album cover lookup with caching.
- **AI Developer Agent Monitor**: Real-time task tracking and live tool introspection for Google Antigravity, Claude Code, and OpenAI Codex.
- **Dual-Activity Multitasking**: Seamlessly swap primary and secondary widget focus between media and active AI agent sessions (`⇄`).
- **Apple-Inspired Timer Dial**: Precision rotary ruler dial for frictionless minute timer countdowns.
- **Windows Screen Time Radar**: Daily and weekly screen usage radar visualization and active uptime monitor.
- **Floating Shelf**: Fast scratchpad tray for stashing workflow clips and notes.
- **Global Hotkey Support**: Quick toggle via `Ctrl + Alt + Space`.
- **System Tray Integration**: Custom tray icon with quick settings, autostart toggle, and quit controls.
- **NSIS Windows Installer**: Custom packaged setup wizard with desktop and startup options.

[Unreleased]: https://github.com/Keerthanreddy01/Islet/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Keerthanreddy01/Islet/releases/tag/v0.1.0
