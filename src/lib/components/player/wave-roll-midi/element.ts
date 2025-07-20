import { parseMidi } from "@/core/parsers/midi-parser";
import {
  createWaveRollMidiPlayer,
  WaveRollMidiPlayer,
} from "@/lib/components/player/wave-roll-midi/player";
import type { WaveRollMidiPlayerOptions } from "@/lib/components/player/wave-roll-midi/types";

/**
 * Web Component <wave-roll-midi>
 *
 * Usage:
 * ```html
 * <wave-roll-midi src="src/sample_midi/jazz.mid"></wave-roll-midi>
 * ```
 *
 * The element automatically parses the specified MIDI file
 * and renders a synchronized audio player + PixiJS piano-roll.
 */
class WaveRollMidiElement extends HTMLElement {
  /** Underlying PlayerDemo instance */
  private demo: WaveRollMidiPlayer | null = null;

  /** Keep track of the current src URL */
  private currentSrc: string | null = null;

  /** Observe the src attribute for runtime changes */
  static get observedAttributes(): string[] {
    return ["src"];
  }

  /** Handle attribute updates (e.g., when src changes) */
  public attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ): void {
    if (name === "src" && oldValue !== newValue) {
      this.currentSrc = newValue;
      this.initialize();
    }
  }

  /** Called when the element is inserted into the DOM */
  public connectedCallback(): void {
    // Apply some reasonable default styling so that the component occupies space
    this.style.display = "block";
    this.style.position = "relative";

    // Defer initialization until the next micro-task to ensure attributes are ready
    queueMicrotask(() => this.initialize());
  }

  /** Clean up when the element is removed from the DOM */
  public disconnectedCallback(): void {
    this.destroyDemo();
  }

  /** Replace the innerHTML with a simple status message */
  private setStatus(message: string, color = "#666"): void {
    this.innerHTML = `<div style="text-align:center;padding:12px;color:${color};font-size:14px;">${message}</div>`;
  }

  /** Initialize or re-initialize the player demo */
  private async initialize(): Promise<void> {
    const srcAttr = this.getAttribute("src") || this.currentSrc;
    if (!srcAttr) {
      this.setStatus("Missing 'src' attribute", "#e53e3e");
      return;
    }

    // If the same source is already loaded, do nothing
    if (this.demo && this.currentSrc === srcAttr) {
      return;
    }

    // Update current src and reset previous instance
    this.currentSrc = srcAttr;
    this.destroyDemo();

    try {
      this.setStatus("Loading MIDI…");

      // Parse the MIDI file
      const parsed = await parseMidi(srcAttr);

      // Optional: parse component-level options from data- attributes in the future
      const options: WaveRollMidiPlayerOptions = {
        // Sensible defaults - can be extended later via attributes
        player: {
          tempo:
            parsed.header.tempos?.[0]?.bpm ?? 120 /* fallback if no tempo */,
        },
      };

      // Render the synchronized audio player + piano roll into this element
      this.demo = await createWaveRollMidiPlayer(
        this,
        parsed.notes,
        parsed.controlChanges,
        options
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`Failed to load MIDI: ${msg}`, "#e53e3e");
      // Rethrow so that the error can surface in console for debugging
      console.error("<wave-roll-midi> error:", error);
    }
  }

  /** Dispose of the underlying PlayerDemo instance */
  private destroyDemo(): void {
    if (this.demo) {
      this.demo.destroy();
      this.demo = null;
    }
  }

  /* --------------------------------------------------------------
   * Debug helpers - surface internal state to outside callers.
   * -------------------------------------------------------------- */
  /**
   * Return the current audio + piano-roll state. Returns undefined if the
   * internal player has not finished initializing yet or has been destroyed.
   */
  public getState() {
    return this.demo?.getState();
  }

  /**
   * Return the underlying WaveRollMidiPlayer instance - useful for advanced
   * integrations where you need full programmatic control. May be `null` if
   * the player is still loading or has already been disposed.
   */
  public getPlayer(): WaveRollMidiPlayer | null {
    return this.demo;
  }
}

// Register the custom element exactly once
if (!customElements.get("wave-roll-midi")) {
  customElements.define("wave-roll-midi", WaveRollMidiElement);
}

export { WaveRollMidiElement };
