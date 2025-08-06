import { WaveRollPlayer } from "./player";

/**
 * Web Component <wave-roll>
 *
 * Accepts a `files` attribute containing either:
 * 1. A JSON array of objects: [{ "path": "./music.mid", "displayName": "My Song" }, ...]
 * 2. A comma-separated list where each entry is "path|displayName".
 *    Example: "./a.mid|Track A, ./b.mid|Track B" (displayName is optional).
 *
 * The component initialises a full-featured multi-track player + piano-roll
 * once the MIDI data has been parsed.
 */
class WaveRollElement extends HTMLElement {
  /** Underlying demo instance */
  private demo: WaveRollPlayer | null = null;

  /** Cache last parsed files attribute so we can detect changes */
  private lastFilesAttr: string | null = null;

  static get observedAttributes(): string[] {
    return ["files"];
  }

  public attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ): void {
    if (name === "files" && oldValue !== newValue) {
      this.lastFilesAttr = newValue;
      this.initialise();
    }
  }

  public connectedCallback(): void {
    // Reasonable default styles so the element occupies space
    this.style.display = "block";
    this.style.position = "relative";

    queueMicrotask(() => this.initialise());
  }

  public disconnectedCallback(): void {
    this.destroyDemo();
  }

  /** Replace innerHTML with status message */
  private setStatus(message: string, color = "#666"): void {
    this.innerHTML = `<div style="text-align:center;padding:12px;color:${color};font-size:14px;">${message}</div>`;
  }

  /** Parse the `files` attribute into an array */
  private parseFilesAttribute(attr: string | null): Array<{
    path: string;
    displayName?: string;
  }> {
    if (!attr) return [];

    // Attempt JSON first
    try {
      const parsed = JSON.parse(attr.trim());
      if (Array.isArray(parsed)) {
        return parsed.filter((it) => typeof it === "object" && it.path);
      }
    } catch {
      /* fallthrough - not JSON */
    }

    // Fallback: comma-separated list "path|name,path2|name2"
    return attr.split(",").map((part) => {
      const [p, n] = part.split("|");
      return { path: p.trim(), displayName: n ? n.trim() : undefined };
    });
  }

  /** (Re)initialise demo */
  private async initialise(): Promise<void> {
    const filesAttr = this.getAttribute("files") ?? this.lastFilesAttr;
    // Persist for change detection
    this.lastFilesAttr = filesAttr;
    const files = this.parseFilesAttribute(filesAttr);

    if (files.length === 0) {
      this.setStatus("Missing or empty 'files' attribute", "#e53e3e");
      return;
    }

    // If demo already initialised with same file list - skip reinit
    if (this.demo && filesAttr === this.lastFilesAttr) {
      return;
    }

    // Destroy previous instance before re-creating
    this.destroyDemo();

    try {
      this.setStatus("Loading MIDI files…");
      this.demo = await createWaveRollPlayer(this, files);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus(`Failed to load MIDI files: ${msg}`, "#e53e3e");
      console.error("<wave-roll> error:", error);
    }
  }

  /** Dispose of demo instance */
  private destroyDemo(): void {
    if (this.demo) {
      this.demo.dispose();
      this.demo = null;
    }
  }
}

// Register element once
if (!customElements.get("wave-roll")) {
  customElements.define("wave-roll", WaveRollElement);
}

export { WaveRollElement };

export async function createWaveRollPlayer(
  container: HTMLElement,
  files: Array<{ path: string; displayName?: string }>
): Promise<WaveRollPlayer> {
  const player = new WaveRollPlayer(container, files);
  await player.initialize();
  return player;
}
