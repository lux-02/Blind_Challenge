export type StorageKind = "session" | "local";

const EVT = "blindchallenge:storage_changed";

export function notifyStorageChanged(kind: StorageKind, key: string) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(EVT, { detail: { kind, key } as const }),
    );
  } catch {
    // ignore
  }
}

export function subscribeStorageChanged(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVT, handler);
  // Cross-tab updates (won't fire in the same tab).
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}

