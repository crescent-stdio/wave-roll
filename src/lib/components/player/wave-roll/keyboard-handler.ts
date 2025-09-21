import { UIComponentDependencies } from "@/lib/components/ui";
import { ensureAudioContextReady } from "@/lib/core/audio/utils/audio-context";

export class KeyboardHandler {
  private isTogglingPlayback = false;
  private boundHandleKeyDown: ((event: KeyboardEvent) => void) | null = null;

  /**
   * Setup keyboard listener
   */
  setupKeyboardListener(
    getDependencies: () => UIComponentDependencies,
    startUpdateLoop: () => void
  ): void {
    // Register global keyboard listener (Space -> Play/Pause) only once
    const GLOBAL_KEY = "_waveRollSpaceHandler" as const;
    
    this.boundHandleKeyDown = (event: KeyboardEvent) => 
      this.handleKeyDown(event, getDependencies, startUpdateLoop);
    
    const existing = Reflect.get(window, GLOBAL_KEY) as
      | ((e: KeyboardEvent) => void)
      | undefined;
    if (!existing && this.boundHandleKeyDown) {
      Reflect.set(window, GLOBAL_KEY, this.boundHandleKeyDown);
      document.addEventListener("keydown", this.boundHandleKeyDown);
    }
  }

  /**
   * Handle keyboard events
   */
  private handleKeyDown = (
    event: KeyboardEvent,
    getDependencies: () => UIComponentDependencies,
    startUpdateLoop: () => void
  ): void => {
    if (event.repeat) return; // Ignore auto-repeat

    // Skip if focus is on an interactive element
    const target = event.target as HTMLElement | null;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLAnchorElement ||
      target?.getAttribute("role") === "button" ||
      target?.isContentEditable
    ) {
      return;
    }

    // Handle Space key for play/pause
    if (!(event.code === "Space" || event.key === " ")) return;

    event.preventDefault();
    event.stopPropagation();

    // Debounce rapid toggling
    if (this.isTogglingPlayback) return;
    this.isTogglingPlayback = true;

    // Always work off the freshest UI dependencies
    const deps = getDependencies();
    const audioPlayer = deps.audioPlayer;

    // Safety check - if no audioPlayer is available, bail out gracefully
    if (!audioPlayer) {
      this.isTogglingPlayback = false;
      return;
    }

    const state = audioPlayer.getState();

    if (state?.isPlaying) {
      // Currently playing -> pause
      deps.audioPlayer?.pause();
      // Clear debounce shortly after pausing so we can resume quickly
      setTimeout(() => {
        this.isTogglingPlayback = false;
      }, 100);
    } else {
      // Check buffer status before attempting to play
      const wavPlayerManager = (audioPlayer as any).wavPlayerManager;
      if (wavPlayerManager && typeof wavPlayerManager.areAllBuffersReady === 'function') {
        const buffersReady = wavPlayerManager.areAllBuffersReady();
        if (!buffersReady) {
          // console.log("[KeyboardHandler] Audio buffers are not ready yet. Please wait...");
          // Optional: Show a toast or notification to user
          this.isTogglingPlayback = false;
          return;
        }
      }

      // Currently paused -> play via space-bar
      const waitUntil = async (pred: () => boolean, toMs = 2000, step = 50) => {
        const start = Date.now();
        while (!pred()) {
          if (Date.now() - start > toMs) break;
          await new Promise((r) => setTimeout(r, step));
        }
      };

      (async () => {
        try {
          // 1) Ensure AudioContext is started within this user gesture
          try { await ensureAudioContextReady(); } catch {}
          // 2) Wait until engine is initialized (piano-roll + audio player ready)
          await waitUntil(() => !!deps.audioPlayer?.isInitialized?.());
          // 3) Play
          await audioPlayer.play();
          // 4) Refresh UI
          startUpdateLoop();
          deps.updatePlayButton?.();
          deps.updateSeekBar?.();
        } catch (error) {
          console.error("Failed to play:", error);
        } finally {
          setTimeout(() => {
            this.isTogglingPlayback = false;
          }, 100);
        }
      })();
    }
  };

  /**
   * Cleanup keyboard listener
   */
  cleanup(): void {
    const GLOBAL_KEY = "_waveRollSpaceHandler" as const;
    const handler = Reflect.get(window, GLOBAL_KEY) as
      | ((e: KeyboardEvent) => void)
      | undefined;
    if (handler && handler === this.boundHandleKeyDown) {
      document.removeEventListener("keydown", handler);
      Reflect.deleteProperty(window, GLOBAL_KEY);
    }
  }

  /**
   * Reset toggling state
   */
  resetTogglingState(): void {
    setTimeout(() => {
      this.isTogglingPlayback = false;
    }, 100);
  }
}
