import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { Settings, IslandTheme, CompletedIndicatorMode } from "../electron/ipc";

export interface ThemeConfig {
  id: IslandTheme;
  name: string;
  description: string;
  bg: string;
  bgCard: string;
  border: string;
  text: string;
  textSub: string;
  accent: string;
  isLight?: boolean;
}

// Retained for App.tsx theme resolution
export const THEMES: ThemeConfig[] = [
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep obsidian black with crisp contrast",
    bg: "#000000",
    bgCard: "#111111",
    border: "rgba(255, 255, 255, 0.08)",
    text: "#ffffff",
    textSub: "rgba(255, 255, 255, 0.45)",
    accent: "#3b82f6"
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Refined dark charcoal matte finish",
    bg: "#111215",
    bgCard: "#18191d",
    border: "rgba(255, 255, 255, 0.08)",
    text: "#f3f4f6",
    textSub: "rgba(243, 244, 246, 0.45)",
    accent: "#9ca3af"
  },
  {
    id: "ocean",
    name: "Ocean Blue",
    description: "Deep oceanic navy with cyan accents",
    bg: "#070f1e",
    bgCard: "#0d1b30",
    border: "rgba(56, 189, 248, 0.15)",
    text: "#f0f9ff",
    textSub: "rgba(186, 230, 253, 0.45)",
    accent: "#38bdf8"
  },
  {
    id: "emerald",
    name: "Emerald",
    description: "Lush evergreen with vivid emerald highlights",
    bg: "#06150e",
    bgCard: "#0b2419",
    border: "rgba(52, 211, 153, 0.15)",
    text: "#ecfdf5",
    textSub: "rgba(167, 243, 208, 0.45)",
    accent: "#10b981"
  },
  {
    id: "rose",
    name: "Rose Pink",
    description: "Velveteen dark berry with elegant pink",
    bg: "#180a12",
    bgCard: "#26101d",
    border: "rgba(251, 113, 133, 0.15)",
    text: "#fff1f2",
    textSub: "rgba(254, 205, 211, 0.45)",
    accent: "#fb7185"
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Mystic twilight violet with lilac accents",
    bg: "#100a1c",
    bgCard: "#1a112e",
    border: "rgba(167, 139, 250, 0.15)",
    text: "#f5f3ff",
    textSub: "rgba(221, 214, 254, 0.45)",
    accent: "#a78bfa"
  },
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm espresso glow with radiant amber",
    bg: "#180d06",
    bgCard: "#27160a",
    border: "rgba(251, 146, 60, 0.15)",
    text: "#fffbeb",
    textSub: "rgba(253, 230, 138, 0.45)",
    accent: "#f97316"
  },
  {
    id: "arctic",
    name: "Arctic Light",
    description: "Clean frosted light theme with dark typography",
    bg: "#f3f5f8",
    bgCard: "#e8ecf2",
    border: "rgba(0, 0, 0, 0.10)",
    text: "#0f172a",
    textSub: "rgba(51, 65, 85, 0.70)",
    accent: "#2563eb",
    isLight: true
  }
];

export type SettingsTab = "interaction" | "media" | "system";

export interface SettingsPanelProps {
  settings: Settings;
  onUpdateSettings: (patch: Partial<Settings>) => void;
  onBackToTools: () => void;
  onClose: () => void;
}

export function SettingsPanel({
  settings,
  onUpdateSettings,
  onBackToTools,
  onClose
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("interaction");

  // Shortcut Recorder State
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [recordedCombo, setRecordedCombo] = useState<string | null>(null);
  const [shortcutFeedback, setShortcutFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Two-step confirmation for factory reset
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!shortcutFeedback) return;
    const timer = setTimeout(() => setShortcutFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [shortcutFeedback]);

  useEffect(() => {
    if (!confirmingReset) return;
    const timer = setTimeout(() => setConfirmingReset(false), 3500);
    return () => clearTimeout(timer);
  }, [confirmingReset]);

  // Shortcut key recording listener
  useEffect(() => {
    if (!isRecordingShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setIsRecordingShortcut(false);
        setRecordedCombo(null);
        return;
      }

      const keys: string[] = [];
      if (e.ctrlKey) keys.push("Ctrl");
      if (e.altKey) keys.push("Alt");
      if (e.shiftKey) keys.push("Shift");
      if (e.metaKey) keys.push("Super");

      let keyName = e.key;
      if (["Control", "Alt", "Shift", "Meta"].includes(keyName)) {
        setRecordedCombo(keys.join("+"));
        return;
      }

      if (keyName === " ") keyName = "Space";
      else if (keyName.length === 1) keyName = keyName.toUpperCase();

      if (!keys.includes(keyName)) {
        keys.push(keyName);
      }

      setRecordedCombo(keys.join("+"));
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isRecordingShortcut]);

  const handleConfirmShortcut = async () => {
    if (!recordedCombo) return;
    const parts = recordedCombo.split("+");
    const modifiers = parts.filter((p) => ["Ctrl", "Alt", "Shift", "Super"].includes(p));
    const nonModifiers = parts.filter((p) => !["Ctrl", "Alt", "Shift", "Super"].includes(p));

    if (modifiers.length === 0 || nonModifiers.length === 0) {
      setShortcutFeedback({
        text: "Include a modifier (Ctrl/Alt/Shift) and key.",
        isError: true
      });
      return;
    }

    try {
      const res = await window.islet.settings.setHotkey(recordedCombo);
      if (res.success) {
        onUpdateSettings({ hotkey: res.hotkey });
        setIsRecordingShortcut(false);
        setRecordedCombo(null);
        setShortcutFeedback({
          text: `Shortcut set to ${res.hotkey}`,
          isError: false
        });
      } else {
        setShortcutFeedback({
          text: res.error || "Shortcut not supported.",
          isError: true
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setShortcutFeedback({
        text: `Error: ${msg}`,
        isError: true
      });
    }
  };

  const handleRestoreDefaultShortcut = async () => {
    try {
      const res = await window.islet.settings.setHotkey("Ctrl+Alt+Space");
      if (res.success) {
        onUpdateSettings({ hotkey: "Ctrl+Alt+Space" });
        setIsRecordingShortcut(false);
        setRecordedCombo(null);
        setShortcutFeedback({
          text: "Restored: Ctrl+Alt+Space",
          isError: false
        });
      }
    } catch {
      setShortcutFeedback({
        text: "Failed to reset shortcut.",
        isError: true
      });
    }
  };

  const handleRestoreAllDefaults = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }

    try {
      const reset = await window.islet.settings.restoreDefaults();
      onUpdateSettings(reset);
      setConfirmingReset(false);
      setShortcutFeedback({
        text: "Defaults restored successfully.",
        isError: false
      });
    } catch {
      setShortcutFeedback({
        text: "Failed to restore defaults.",
        isError: true
      });
    }
  };

  // ── Native Sleek Toggle Switch ──
  const Toggle = ({
    value,
    onChange
  }: {
    value: boolean;
    onChange: (val: boolean) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`island-switch ${value ? "is-active" : ""}`}
      style={{
        backgroundColor: value ? "var(--island-accent, #0a84ff)" : "rgba(255, 255, 255, 0.16)"
      }}
      data-no-drag
    >
      <span className="island-switch-knob" />
    </button>
  );

  return (
    <motion.div
      key="expanded-settings"
      className="island-settings-root"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.14, ease: "easeOut" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* ── Compact Header ── */}
      <div className="island-settings-header">
        <div className="island-settings-title-wrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="settings-gear-icon">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span className="island-settings-heading">Settings</span>
        </div>

        <div className="island-settings-actions">
          <button
            className="island-link-btn"
            onClick={onBackToTools}
            title="Back to Quick Tools"
            data-no-drag
          >
            ← Tools
          </button>
          <button
            className="island-close-btn"
            onClick={onClose}
            title="Close Settings"
            data-no-drag
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Seamless Segmented Pill Tabs ── */}
      <div className="island-tabs-track">
        {[
          ["interaction", "Interaction"],
          ["media", "Media & AI"],
          ["system", "System"]
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as SettingsTab)}
            className={`island-tab-pill ${activeTab === id ? "active" : ""}`}
            data-no-drag
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Status Feedback Banner ── */}
      {shortcutFeedback && (
        <div className={`island-toast ${shortcutFeedback.isError ? "error" : "success"}`}>
          {shortcutFeedback.isError ? "⚠️ " : "✓ "}
          {shortcutFeedback.text}
        </div>
      )}

      {/* ── Grouped Preference Container ── */}
      <div className="island-settings-body">
        {/* ===================================================================
            TAB 1: INTERACTION
            =================================================================== */}
        {activeTab === "interaction" && (
          <div className="island-pref-group">
            {/* Shortcut Row */}
            <div className="island-pref-row" style={{ alignItems: isRecordingShortcut ? "flex-start" : "center" }}>
              <div className="island-pref-meta">
                <span className="island-pref-title">Global Shortcut</span>
                <span className="island-pref-sub">Toggle Dynamic Island from anywhere</span>
              </div>

              {!isRecordingShortcut ? (
                <div className="island-shortcut-display">
                  <div className="island-keys-row">
                    {(settings.hotkey || "Ctrl+Alt+Space").split("+").map((key, i) => (
                      <React.Fragment key={key + i}>
                        {i > 0 && <span className="island-key-plus">+</span>}
                        <kbd className="island-kbd">{key}</kbd>
                      </React.Fragment>
                    ))}
                  </div>
                  <button
                    className="island-mini-btn"
                    onClick={() => {
                      setIsRecordingShortcut(true);
                      setRecordedCombo(null);
                    }}
                    data-no-drag
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="island-shortcut-recorder">
                  <span className="island-record-dot" />
                  <span className="island-record-keys">
                    {recordedCombo || "Press keys..."}
                  </span>
                  <div className="island-record-actions">
                    <button
                      className="island-save-btn"
                      disabled={!recordedCombo}
                      onClick={handleConfirmShortcut}
                      data-no-drag
                    >
                      Save
                    </button>
                    <button
                      className="island-cancel-btn"
                      onClick={() => {
                        setIsRecordingShortcut(false);
                        setRecordedCombo(null);
                      }}
                      data-no-drag
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Hover Expand */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">Hover to Expand</span>
                <span className="island-pref-sub">Expand island when mouse enters notch</span>
              </div>
              <Toggle
                value={settings.expandOnHover ?? false}
                onChange={(v) => onUpdateSettings({ expandOnHover: v })}
              />
            </div>

            {/* Click Outside */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">Close on Click Outside</span>
                <span className="island-pref-sub">Collapse when clicking another window</span>
              </div>
              <Toggle
                value={settings.closeOnBlur ?? true}
                onChange={(v) => onUpdateSettings({ closeOnBlur: v })}
              />
            </div>

            {/* Launch Minimized */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">Launch Minimized</span>
                <span className="island-pref-sub">Start hidden in system tray until summoned</span>
              </div>
              <Toggle
                value={settings.launchMinimized ?? false}
                onChange={(v) => onUpdateSettings({ launchMinimized: v })}
              />
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: MEDIA & AI
            =================================================================== */}
        {activeTab === "media" && (
          <div className="island-pref-group">
            {/* Spotify Activity */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">Spotify Compact Activity</span>
                <span className="island-pref-sub">Equalizer & art in collapsed pill</span>
              </div>
              <Toggle
                value={settings.showSpotifyIndicator ?? true}
                onChange={(v) => onUpdateSettings({ showSpotifyIndicator: v })}
              />
            </div>

            {/* AI Agent Monitoring */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">AI Agent Activity Indicator</span>
                <span className="island-pref-sub">Antigravity, Claude Code, and ChatGPT</span>
              </div>
              <Toggle
                value={settings.showAgentIndicators ?? true}
                onChange={(v) => onUpdateSettings({ showAgentIndicators: v })}
              />
            </div>

            {/* Tool / File Details */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">Command & File Details</span>
                <span className="island-pref-sub">Show active file in secondary capsule</span>
              </div>
              <Toggle
                value={settings.compactTaskDescription ?? true}
                onChange={(v) => onUpdateSettings({ compactTaskDescription: v })}
              />
            </div>

            {/* Completion Duration (Segmented Toggle) */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">Completion Badge</span>
                <span className="island-pref-sub">Green checkmark duration</span>
              </div>
              <div className="island-mini-segmented">
                <button
                  type="button"
                  className={`island-segment-btn ${(settings.completedIndicatorDuration || "brief") === "brief" ? "active" : ""}`}
                  onClick={() => onUpdateSettings({ completedIndicatorDuration: "brief" as CompletedIndicatorMode })}
                  data-no-drag
                >
                  5s
                </button>
                <button
                  type="button"
                  className={`island-segment-btn ${settings.completedIndicatorDuration === "persistent" ? "active" : ""}`}
                  onClick={() => onUpdateSettings({ completedIndicatorDuration: "persistent" as CompletedIndicatorMode })}
                  data-no-drag
                >
                  Persist
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: SYSTEM
            =================================================================== */}
        {activeTab === "system" && (
          <div className="island-pref-group">
            {/* Launch at Login */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">Start with Windows</span>
                <span className="island-pref-sub">Auto-launch Islet on PC startup</span>
              </div>
              <Toggle
                value={settings.startWithWindows ?? true}
                onChange={(v) => onUpdateSettings({ startWithWindows: v })}
              />
            </div>

            {/* Factory Reset */}
            <div className="island-pref-row">
              <div className="island-pref-meta">
                <span className="island-pref-title">Factory Reset</span>
                <span className="island-pref-sub">Restore all settings to original state</span>
              </div>
              <button
                type="button"
                onClick={handleRestoreAllDefaults}
                className={`island-danger-pill ${confirmingReset ? "is-confirming" : ""}`}
                data-no-drag
              >
                {confirmingReset ? "Confirm Reset?" : "Restore Defaults"}
              </button>
            </div>
          </div>
        )}

        {/* Minimal Footer */}
        <div className="island-settings-footer">
          <span>Islet Dynamic Island • open source</span>
        </div>
      </div>
    </motion.div>
  );
}
