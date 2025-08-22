import { UIComponentDependencies } from "@/lib/components/ui";

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
    
    if (!(window as any)[GLOBAL_KEY]) {
      (window as any)[GLOBAL_KEY] = this.boundHandleKeyDown;
      document.addEventListener("keydown", (window as any)[GLOBAL_KEY]);
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
      // Currently paused -> play via space-bar
      audioPlayer
        .play()
        .then(() => {
          // Playback has effectively started - refresh UI once.
          startUpdateLoop();
          deps.updatePlayButton?.();
          deps.updateSeekBar?.();
        })
        .catch((error: any) => {
          console.error("Failed to play:", error);
        })
        .finally(() => {
          // Always release the debounce lock, even if play() fails
          setTimeout(() => {
            this.isTogglingPlayback = false;
          }, 100);
        });
    }
  };

  /**
   * Cleanup keyboard listener
   */
  cleanup(): void {
    const GLOBAL_KEY = "_waveRollSpaceHandler" as const;
    const handler = (window as any)[GLOBAL_KEY];
    if (handler && handler === this.boundHandleKeyDown) {
      document.removeEventListener("keydown", handler);
      delete (window as any)[GLOBAL_KEY];
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