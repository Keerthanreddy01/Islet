import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { IsletApi, MediaState, Tab, WindowDragPoint } from "./ipc.js";

const api: IsletApi = {
  window: {
    setExpanded: (expanded: boolean, height?: number) => ipcRenderer.invoke("window:set-expanded", expanded, height),
    getState: () => ipcRenderer.invoke("window:get-state"),
    beginDrag: (point: WindowDragPoint) => ipcRenderer.invoke("window:begin-drag", point),
    moveDrag: (point: WindowDragPoint) => ipcRenderer.invoke("window:move-drag", point),
    endDrag: () => ipcRenderer.invoke("window:end-drag"),
    collapse: () => ipcRenderer.invoke("window:collapse"),
    finishCollapse: () => ipcRenderer.invoke("window:finish-collapse"),
    onExpanded: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("window:expanded", handler);
      return () => ipcRenderer.removeListener("window:expanded", handler);
    },
    onStartCollapse: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("window:start-collapse", handler);
      return () => ipcRenderer.removeListener("window:start-collapse", handler);
    },
    onBlurred: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("window:blurred", handler);
      return () => ipcRenderer.removeListener("window:blurred", handler);
    },
    onShown: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("window:shown", handler);
      return () => ipcRenderer.removeListener("window:shown", handler);
    },
    onHidden: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("window:hidden", handler);
      return () => ipcRenderer.removeListener("window:hidden", handler);
    },
    onRendererError: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
      ipcRenderer.on("renderer:error", handler);
      return () => ipcRenderer.removeListener("renderer:error", handler);
    },
    setActiveTab: (tab: Tab) => ipcRenderer.invoke("window:set-tab", tab),
    getSettings: () => ipcRenderer.invoke("settings:get"),
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => {
      ipcRenderer.send("window:set-ignore-mouse-events", ignore, options);
    }
  },
  media: {
    getState: () => ipcRenderer.invoke("media:get-state"),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: MediaState | null) => listener(state);
      ipcRenderer.on("media:changed", handler);
      return () => ipcRenderer.removeListener("media:changed", handler);
    },
    playPause: () => ipcRenderer.invoke("media:play-pause"),
    next: () => ipcRenderer.invoke("media:next"),
    previous: () => ipcRenderer.invoke("media:previous"),
    seek: (positionMs) => ipcRenderer.invoke("media:seek", positionMs)
  },
  tasks: {
    list: () => ipcRenderer.invoke("tasks:list"),
    create: (input) => ipcRenderer.invoke("tasks:create", input),
    complete: (id) => ipcRenderer.invoke("tasks:complete", id),
    remove: (id) => ipcRenderer.invoke("tasks:remove", id),
    captureFromClipboard: () => ipcRenderer.invoke("tasks:capture-from-clipboard")
  },
  clipboard: {
    list: (query) => ipcRenderer.invoke("clipboard:list", query),
    copy: (id) => ipcRenderer.invoke("clipboard:copy", id),
    pin: (id, pinned) => ipcRenderer.invoke("clipboard:pin", id, pinned),
    remove: (id) => ipcRenderer.invoke("clipboard:remove", id),
    clear: () => ipcRenderer.invoke("clipboard:clear"),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, item: Parameters<typeof listener>[0]) => listener(item);
      ipcRenderer.on("clipboard:changed", handler);
      return () => ipcRenderer.removeListener("clipboard:changed", handler);
    }
  },
  timers: {
    list: () => ipcRenderer.invoke("timers:list"),
    create: (input) => ipcRenderer.invoke("timers:create", input),
    pause: (id) => ipcRenderer.invoke("timers:pause", id),
    resume: (id) => ipcRenderer.invoke("timers:resume", id),
    cancel: (id) => ipcRenderer.invoke("timers:cancel", id),
    subscribe: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, timer: Parameters<typeof listener>[0]) => listener(timer);
      ipcRenderer.on("timers:changed", handler);
      return () => ipcRenderer.removeListener("timers:changed", handler);
    }
  },
  calendar: {
    getWeek: () => ipcRenderer.invoke("calendar:get-week"),
    refresh: () => ipcRenderer.invoke("calendar:refresh"),
    createEvent: (input) => ipcRenderer.invoke("calendar:create-event", input),
    removeEvent: (id) => ipcRenderer.invoke("calendar:remove-event", id)
  },
  settings: {
    update: (patch) => ipcRenderer.invoke("settings:update", patch),
    getStartupStatus: () => ipcRenderer.invoke("settings:get-startup-status")
  },
  shelf: {
    getPathForFile: (file: File) => {
      try {
        if (webUtils && typeof webUtils.getPathForFile === "function") {
          return webUtils.getPathForFile(file);
        }
      } catch {
        // ignore
      }
      return (file as any).path || "";
    },
    saveTempImage: (name: string, buffer: ArrayBuffer, originalPath?: string) =>
      ipcRenderer.invoke("shelf:save-image", { name, buffer, originalPath }),
    copyImage: (filePath?: string, dataUrl?: string) =>
      ipcRenderer.invoke("shelf:copy-image", { filePath, dataUrl }),
    startDrag: (filePath: string) => {
      ipcRenderer.send("shelf:start-drag", filePath);
    }
  }
};

contextBridge.exposeInMainWorld("islet", api);
