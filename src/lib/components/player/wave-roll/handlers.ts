import { VisualizationEngine } from "@/core/visualization";
import { UIComponentDependencies } from "@/lib/components/ui";

/**
 * Register a global <Space> key listener that toggles playback.
 * Returns an unregister callback so the caller can dispose the side-effect.
 */
export function registerSpaceShortcut(
  engine: VisualizationEngine,
  depsGetter: () => UIComponentDependencies
): () => void {
  const handler = (event: KeyboardEvent): void => {
    if (event.repeat) return;

    if (event.code !== "Space" && event.key !== " ") return;

    // If focus is inside an interactive element, ignore.
    const t = event.target as HTMLElement | null;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      t instanceof HTMLAnchorElement ||
      t?.getAttribute("role") === "button" ||
      t?.isContentEditable
    )
      return;

    event.preventDefault();
    event.stopPropagation();

    const deps = depsGetter();
    const state = engine.getState();

    const finish = () => {
      deps.updatePlayButton?.();
      deps.updateSeekBar?.();
    };

    if (state?.isPlaying) {
      engine.pause();
      finish();
    } else {
      engine.play().catch(console.error).finally(finish);
    }
  };

  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}
