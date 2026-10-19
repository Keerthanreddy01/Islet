import { contextBridge, ipcRenderer } from "electron";
import type { IsletApi, MediaState, Tab, WindowDragPoint } from "./ipc.js";

const api: IsletApi = {
  window: {
    setExpanded: (expanded) => ipcRenderer.invoke("window:set-expanded", expanded),
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
    setActiveTab: (tab: Tab) => ipcRenderer.invoke("window:set-tab", tab),
    getSettings: () => ipcRenderer.invoke("settings:get")
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
    update: (patch) => ipcRenderer.invoke("settings:update", patch)
  }
};

contextBridge.exposeInMainWorld("islet", api);
