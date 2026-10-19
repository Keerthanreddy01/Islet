import type { IsletApi } from "../electron/ipc";

declare global {
  interface Window {
    islet: IsletApi;
  }
}

export {};
