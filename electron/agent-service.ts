import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentActivityItem, AgentId, AgentState, AgentStatus } from "./ipc.js";

export type AgentServiceListener = (state: AgentState) => void;
export type Logger = (message: string, error?: unknown) => void;

interface AgentAdapter {
  id: AgentId;
  name: string;
  checkAvailable(): boolean;
  scan(): Promise<AgentActivityItem | null>;
}

const DONE_VISIBLE_MS = 10_000; // 10 seconds green checkmark visibility
const RECENT_ACTIVE_MS = 30 * 60_000; // 30 minutes recent threshold

export class AgentService {
  private log: Logger;
  private listeners: Set<AgentServiceListener> = new Set();
  private scanTimer: NodeJS.Timeout | null = null;
  private isScanning = false;
  private primaryMode: "agent" | "spotify" = "agent";

  private adapters: AgentAdapter[] = [];
  private lastKnownAgents: Map<string, AgentActivityItem> = new Map();
  private currentState: AgentState = {
    agents: [],
    activeAgent: null,
    primaryMode: "agent"
  };

  constructor(logger?: Logger) {
    this.log = logger || ((msg) => console.log(`[AgentService] ${msg}`));
    this.setupAdapters();
  }

  private setupAdapters() {
    this.adapters = [
      new AntigravityAdapter(this.log),
      new ClaudeCodeAdapter(this.log),
      new CodexAdapter(this.log)
    ];
  }

  public start() {
    if (this.scanTimer) return;
    this.log("Starting developer agent monitoring service");

    // Immediate initial scan
    void this.scanAll();

    // Poll every 1500ms
    this.scanTimer = setInterval(() => {
      void this.scanAll();
    }, 1500);
  }

  public stop() {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  public subscribe(listener: AgentServiceListener): () => void {
    this.listeners.add(listener);
    // Emit immediate current state
    try {
      listener(this.getState());
    } catch {}
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): AgentState {
    return this.currentState;
  }

  public setPrimaryMode(mode: "agent" | "spotify"): void {
    if (this.primaryMode !== mode) {
      this.primaryMode = mode;
      this.currentState = {
        ...this.currentState,
        primaryMode: this.primaryMode
      };
      this.emitState();
    }
  }

  public swapPrimary(): void {
    this.setPrimaryMode(this.primaryMode === "agent" ? "spotify" : "agent");
  }

  private emitState() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentState);
      } catch (err) {
        this.log("Error in agent listener", err);
      }
    }
  }

  private async scanAll() {
    if (this.isScanning) return;
    this.isScanning = true;

    try {
      const now = Date.now();
      const detectedItems: AgentActivityItem[] = [];

      for (const adapter of this.adapters) {
        if (!adapter.checkAvailable()) continue;
        try {
          const item = await adapter.scan();
          if (item) {
            detectedItems.push(item);
          }
        } catch (err) {
          // ignore scan error per adapter
        }
      }

      // Check for completion grace periods
      for (const item of detectedItems) {
        const prev = this.lastKnownAgents.get(item.id);
        if (prev) {
          // If it was recently completed and now idle, preserve completed state for DONE_VISIBLE_MS
          if (
            prev.status === "completed" &&
            item.status === "idle" &&
            prev.completedAt &&
            now - prev.completedAt < DONE_VISIBLE_MS
          ) {
            item.status = "completed";
            item.completedAt = prev.completedAt;
          }
        }
        this.lastKnownAgents.set(item.id, item);
      }

      // Priority ranking: waiting (0) > running (1) > completed (2) > failed (3) > idle (4)
      const rank = (status: AgentStatus): number => {
        switch (status) {
          case "waiting": return 0;
          case "running": return 1;
          case "completed": return 2;
          case "failed": return 3;
          case "cancelled": return 4;
          case "unknown": return 5;
          default: return 6;
        }
      };

      const sorted = [...detectedItems].sort((a, b) => {
        const rA = rank(a.status);
        const rB = rank(b.status);
        if (rA !== rB) return rA - rB;
        return (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0);
      });

      const active = sorted.length > 0 ? sorted[0] : null;

      // Auto-focus agent mode if an agent starts running or waiting
      if (active && (active.status === "running" || active.status === "waiting")) {
        const prevActive = this.currentState.activeAgent;
        if (!prevActive || prevActive.status === "idle" || prevActive.status === "completed") {
          // Task just became active
          this.primaryMode = "agent";
        }
      }

      const newState: AgentState = {
        agents: sorted,
        activeAgent: active,
        primaryMode: this.primaryMode
      };

      // Check if state meaningfully changed
      const prevJson = JSON.stringify(this.currentState);
      const nextJson = JSON.stringify(newState);
      if (prevJson !== nextJson) {
        this.currentState = newState;
        this.emitState();
      }
    } finally {
      this.isScanning = false;
    }
  }
}

/**
 * Google Antigravity Adapter
 * Inspects Antigravity IDE transcripts and workspace logs
 */
class AntigravityAdapter implements AgentAdapter {
  id: AgentId = "antigravity";
  name = "Google Antigravity";
  private baseDir: string;
  private log: Logger;

  constructor(logger: Logger) {
    this.log = logger;
    this.baseDir = path.join(os.homedir(), ".gemini", "antigravity-ide");
  }

  checkAvailable(): boolean {
    return fs.existsSync(this.baseDir);
  }

  async scan(): Promise<AgentActivityItem | null> {
    const brainDir = path.join(this.baseDir, "brain");
    if (!fs.existsSync(brainDir)) return null;

    try {
      // Find latest conversation directory in brain
      const entries = fs.readdirSync(brainDir, { withFileTypes: true });
      let newestTranscript = "";
      let newestMtime = 0;

      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const logFile = path.join(brainDir, ent.name, ".system_generated", "logs", "transcript.jsonl");
        if (fs.existsSync(logFile)) {
          try {
            const stat = fs.statSync(logFile);
            if (stat.mtimeMs > newestMtime) {
              newestMtime = stat.mtimeMs;
              newestTranscript = logFile;
            }
          } catch {}
        }
      }

      if (!newestTranscript) return null;

      // Only consider if updated within recent window
      const now = Date.now();
      if (now - newestMtime > RECENT_ACTIVE_MS) {
        return {
          id: "antigravity",
          agentId: "antigravity",
          agentName: "Google Antigravity",
          taskTitle: "Workspace Idle",
          status: "idle",
          activityText: "Ready",
          lastUpdatedAt: newestMtime,
          confidence: 0.9,
          source: "antigravity"
        };
      }

      // Read tail of transcript file (up to 256KB to reliably reach user input)
      const tailLines = readTailLines(newestTranscript, 256 * 1024);
      if (tailLines.length === 0) return null;

      let startedAt: number | undefined;
      let completedAt: number | undefined;
      let status: AgentStatus = "idle";
      let activityText = "Working";
      let explicitTitle: string | null = null;
      let lastEditedFile: string | null = null;
      let lastViewedFile: string | null = null;
      let lastToolSummary: string | null = null;
      let activeDoc: string | null = null;
      let latestToolFound = false;

      const cleanArg = (v: unknown): string => {
        if (typeof v !== "string") return "";
        return v.replace(/^["']|["']$/g, "").trim();
      };

      // Scan from bottom up to find the active or last state
      for (let i = tailLines.length - 1; i >= 0; i--) {
        const line = tailLines[i].trim();
        if (!line) continue;
        try {
          const entry = JSON.parse(line);
          const time = entry.created_at ? new Date(entry.created_at).getTime() : newestMtime;

          if (entry.type === "USER_INPUT") {
            startedAt = time;
            const text = typeof entry.content === "string" ? entry.content : "";
            
            // Extract clean markdown title if present (e.g. "## Islet — Fix AI Agent Activity Display")
            const userReqMatch = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
            const reqBody = userReqMatch ? userReqMatch[1] : text;
            const headingMatch = reqBody.match(/^\s*#+\s+([^\r\n]+)/m);
            if (headingMatch && headingMatch[1]) {
              let cleanH = headingMatch[1].replace(/[*_`#]/g, "").trim();
              cleanH = cleanH.replace(/^Islet\s*[\u2014\u2013\-:]\s*/i, "").trim();
              if (cleanH.length > 2 && cleanH.length <= 80 && !cleanH.includes("<")) {
                explicitTitle = cleanH;
              }
            }

            // Extract active document from metadata if present
            const docMatch = text.match(/Active Document:\s*([^\r\n]+)/i);
            if (docMatch && docMatch[1]) {
              const cleanDoc = docMatch[1].trim().split(" ")[0];
              if (cleanDoc) activeDoc = path.basename(cleanDoc);
            }

            if (status === "idle") {
              status = "running";
              activityText = "Working";
            }
            break;
          }

          if (entry.type === "PLANNER_RESPONSE") {
            const toolCalls = entry.tool_calls || [];
            
            // Collect file references across tool calls
            for (const tc of toolCalls) {
              const tName = tc.name;
              const tArgs = tc.args || {};
              if (tName === "replace_file_content" || tName === "write_to_file" || tName === "multi_replace_file_content") {
                const target = cleanArg(tArgs.TargetFile);
                if (target && !lastEditedFile) lastEditedFile = path.basename(target);
              } else if (tName === "view_file") {
                const target = cleanArg(tArgs.AbsolutePath);
                if (target && !lastViewedFile) lastViewedFile = path.basename(target);
              }
              if (tc.toolSummary && !lastToolSummary) {
                lastToolSummary = cleanArg(tc.toolSummary);
              } else if (tc.toolAction && !lastToolSummary) {
                lastToolSummary = cleanArg(tc.toolAction);
              }
            }

            if (!latestToolFound) {
              latestToolFound = true;
              if (toolCalls.length > 0) {
                const lastTool = toolCalls[toolCalls.length - 1];
                const name = lastTool.name;
                const rawArgs = lastTool.args || {};

                if (name === "ask_question") {
                  status = "waiting";
                  activityText = "Waiting for input";
                } else if (name === "replace_file_content" || name === "write_to_file" || name === "multi_replace_file_content") {
                  status = "running";
                  const target = cleanArg(rawArgs.TargetFile);
                  const fName = target ? path.basename(target) : "file";
                  activityText = `Editing ${fName}`;
                  if (!lastEditedFile) lastEditedFile = fName;
                } else if (name === "view_file") {
                  status = "running";
                  const target = cleanArg(rawArgs.AbsolutePath);
                  const fName = target ? path.basename(target) : "file";
                  activityText = `Viewing ${fName}`;
                  if (!lastViewedFile) lastViewedFile = fName;
                } else if (name === "run_command") {
                  status = "running";
                  const cmd = cleanArg(rawArgs.CommandLine).split(" ")[0];
                  activityText = `Running ${cmd ? path.basename(cmd) : "command"}`;
                } else if (name === "browser_subagent") {
                  status = "running";
                  activityText = "Testing in browser";
                } else {
                  status = "running";
                  activityText = lastTool.toolSummary ? cleanArg(lastTool.toolSummary) : `Working`;
                }
              } else if (entry.status === "DONE") {
                status = "completed";
                completedAt = time;
                activityText = "Task Complete";
              } else {
                status = "running";
                activityText = "Working";
              }
            }
          } else if (entry.status === "ERROR" && !latestToolFound) {
            latestToolFound = true;
            status = "failed";
            activityText = "Error encountered";
          }
        } catch {}
      }

      // Determine clean, high-confidence task title without exposing user prompts or private code
      let taskTitle = "Google Antigravity is working";
      if (explicitTitle) {
        taskTitle = explicitTitle;
      } else if (lastEditedFile) {
        taskTitle = `Editing ${lastEditedFile}`;
      } else if (lastViewedFile) {
        taskTitle = `Working on ${lastViewedFile}`;
      } else if (activeDoc) {
        taskTitle = `Editing ${activeDoc}`;
      } else if (lastToolSummary) {
        taskTitle = lastToolSummary;
      }

      // Ensure startedAt is populated when running/waiting
      if (!startedAt && (status === "running" || status === "waiting")) {
        startedAt = newestMtime - 5000;
      }

      // If active turn hasn't finished for more than 10 minutes and no updates, consider idle
      if (status === "running" && now - newestMtime > 10 * 60_000) {
        status = "idle";
        activityText = "Idle";
      }

      return {
        id: "antigravity",
        agentId: "antigravity",
        agentName: "Google Antigravity",
        taskTitle,
        status,
        activeTool: activityText,
        statusText: status === "completed" ? "Completed" : status === "waiting" ? "Waiting for Input" : activityText,
        activityText,
        startedAt,
        completedAt,
        lastUpdatedAt: newestMtime,
        confidence: 0.95,
        source: "transcript"
      };
    } catch (err) {
      this.log("Antigravity scan failed", err);
      return null;
    }
  }
}

/**
 * Claude Code Adapter
 * Inspects Claude Code CLI transcripts in ~/.claude/projects/
 */
class ClaudeCodeAdapter implements AgentAdapter {
  id: AgentId = "claude";
  name = "Claude Code";
  private baseDir: string;
  private log: Logger;

  constructor(logger: Logger) {
    this.log = logger;
    this.baseDir = path.join(os.homedir(), ".claude");
  }

  checkAvailable(): boolean {
    return fs.existsSync(this.baseDir);
  }

  async scan(): Promise<AgentActivityItem | null> {
    const projectsDir = path.join(this.baseDir, "projects");
    if (!fs.existsSync(projectsDir)) return null;

    try {
      // Find latest jsonl transcript in projects
      let newestFile = "";
      let newestMtime = 0;

      const walk = (dir: string, depth = 0) => {
        if (depth > 3) return;
        try {
          const files = fs.readdirSync(dir, { withFileTypes: true });
          for (const f of files) {
            const full = path.join(dir, f.name);
            if (f.isDirectory() && f.name !== "subagents") {
              walk(full, depth + 1);
            } else if (f.isFile() && f.name.endsWith(".jsonl")) {
              const stat = fs.statSync(full);
              if (stat.mtimeMs > newestMtime) {
                newestMtime = stat.mtimeMs;
                newestFile = full;
              }
            }
          }
        } catch {}
      };

      walk(projectsDir);
      if (!newestFile) return null;

      const now = Date.now();
      if (now - newestMtime > RECENT_ACTIVE_MS) {
        return {
          id: "claude",
          agentId: "claude",
          agentName: "Claude Code",
          taskTitle: "Claude Idle",
          status: "idle",
          activityText: "Ready",
          lastUpdatedAt: newestMtime,
          confidence: 0.85,
          source: "claude"
        };
      }

      const tailLines = readTailLines(newestFile, 48 * 1024);
      if (tailLines.length === 0) return null;

      let startedAt: number | undefined;
      let completedAt: number | undefined;
      let status: AgentStatus = "idle";
      let activityText = "Working";
      let explicitTitle: string | null = null;
      let lastEditedFile: string | null = null;
      let cwd: string | undefined;

      for (let i = tailLines.length - 1; i >= 0; i--) {
        const line = tailLines[i].trim();
        if (!line) continue;
        try {
          const v = JSON.parse(line);
          const time = v.timestamp ? new Date(v.timestamp).getTime() : newestMtime;
          if (v.cwd) cwd = v.cwd;

          if (v.type === "user") {
            startedAt = time;
            const content = v.message?.content;
            let userText = "";
            if (Array.isArray(content)) {
              const textBlock = content.find((b: any) => b.type === "text");
              if (textBlock?.text) userText = textBlock.text;
            } else if (typeof content === "string") {
              userText = content;
            }

            const headerMatch = userText.match(/^\s*#+\s+([^\r\n]+)/m);
            if (headerMatch && headerMatch[1]) {
              let cleanH = headerMatch[1].replace(/[*_`#]/g, "").trim();
              cleanH = cleanH.replace(/^Islet\s*[\u2014\u2013\-:]\s*/i, "").trim();
              if (cleanH.length > 2 && cleanH.length <= 80 && !cleanH.includes("<")) {
                explicitTitle = cleanH;
              }
            }

            if (status === "idle") {
              status = "running";
              activityText = "Working";
            }
            break;
          }

          if (v.type === "assistant") {
            const msg = v.message || {};
            const stopReason = msg.stop_reason;

            if (stopReason === "end_turn" || stopReason === "stop_sequence") {
              if (status === "idle") {
                status = "completed";
                completedAt = time;
                activityText = "Completed";
              }
            } else {
              // Check tool uses
              const blocks = Array.isArray(msg.content) ? msg.content : [];
              const toolUse = blocks.slice().reverse().find((b: any) => b.type === "tool_use");
              if (toolUse) {
                status = "running";
                const tName = toolUse.name;
                const input = toolUse.input || {};
                if (tName === "Edit" || tName === "Write" || tName === "Replace") {
                  const fPath = input.file_path ? path.basename(input.file_path) : "file";
                  activityText = `Editing ${fPath}`;
                  if (!lastEditedFile) lastEditedFile = fPath;
                } else if (tName === "Bash") {
                  activityText = "Running command";
                } else if (tName === "Glob" || tName === "Grep") {
                  activityText = "Searching files";
                } else {
                  activityText = `Using ${tName}`;
                }
              } else if (status === "idle") {
                status = "running";
                activityText = "Working";
              }
            }
          }
        } catch {}
      }

      let taskTitle = "Claude Code is working";
      if (explicitTitle) {
        taskTitle = explicitTitle;
      } else if (lastEditedFile) {
        taskTitle = `Editing ${lastEditedFile}`;
      } else if (cwd) {
        taskTitle = `Working in ${path.basename(cwd)}`;
      }

      return {
        id: "claude",
        agentId: "claude",
        agentName: "Claude Code",
        taskTitle,
        status,
        activeTool: activityText,
        statusText: status === "completed" ? "Completed" : activityText,
        activityText,
        startedAt,
        completedAt,
        lastUpdatedAt: newestMtime,
        confidence: 0.9,
        source: "transcript",
        cwd
      };
    } catch (err) {
      this.log("Claude Code scan failed", err);
      return null;
    }
  }
}

/**
 * OpenAI Codex / ChatGPT Adapter
 */
class CodexAdapter implements AgentAdapter {
  id: AgentId = "codex";
  name = "OpenAI Codex";
  private baseDir: string;
  private log: Logger;

  constructor(logger: Logger) {
    this.log = logger;
    this.baseDir = path.join(os.homedir(), ".codex");
  }

  checkAvailable(): boolean {
    return fs.existsSync(this.baseDir);
  }

  async scan(): Promise<AgentActivityItem | null> {
    const globalState = path.join(this.baseDir, ".codex-global-state.json");
    if (!fs.existsSync(globalState)) return null;

    try {
      const stat = fs.statSync(globalState);
      const now = Date.now();
      if (now - stat.mtimeMs > RECENT_ACTIVE_MS) {
        return null;
      }

      return {
        id: "codex",
        agentId: "codex",
        agentName: "OpenAI Codex",
        taskTitle: "Codex Session",
        status: "idle",
        activeTool: "Ready",
        statusText: "Ready",
        activityText: "Ready",
        lastUpdatedAt: stat.mtimeMs,
        confidence: 0.75,
        source: "codex"
      };
    } catch {
      return null;
    }
  }
}

/**
 * Utility: Read last N bytes of a file and return split lines
 */
function readTailLines(filePath: string, maxBytes: number): string[] {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return [];

    const readSize = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, stat.size - readSize);
    fs.closeSync(fd);

    const text = buffer.toString("utf8");
    return text.split("\n");
  } catch {
    return [];
  }
}
