/** Widget display modes and their window sizes (logical px). */
export type WidgetMode = "normal" | "expanded" | "ultra";

export const MODE_SIZE: Record<WidgetMode, { w: number; h: number }> = {
  normal: { w: 230, h: 120 },
  expanded: { w: 230, h: 260 },
  ultra: { w: 120, h: 50 },
};

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Resize the OS window to fit a mode. No-op in the browser preview. */
export async function applyWindowSize(mode: WidgetMode): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const { w, h } = MODE_SIZE[mode];
  await getCurrentWindow().setSize(new LogicalSize(w, h));
}

/**
 * Start an OS window drag once the pointer actually moves, so plain clicks
 * (mode toggles) and double-clicks still register. No-op in the browser and for
 * pointerdowns that begin on elements marked `data-no-drag`.
 */
export function beginDrag(e: { button: number; clientX: number; clientY: number; target: EventTarget | null }): void {
  if (e.button !== 0 || !isTauri()) return;
  if (e.target instanceof HTMLElement && e.target.closest("[data-no-drag]")) return;

  const startX = e.clientX;
  const startY = e.clientY;

  const cleanup = (): void => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", cleanup);
  };

  const onMove = (ev: MouseEvent): void => {
    if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) {
      cleanup();
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
        getCurrentWindow().startDragging(),
      );
    }
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", cleanup);
}
