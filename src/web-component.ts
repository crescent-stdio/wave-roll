import { createWaveRollPlayer } from "./lib/components/player/wave-roll/player";

/**
 * WaveRoll Web Component
 * 
 * Usage:
 * <wave-roll 
 *   files='[{"path": "file.mid", "name": "File Name", "type": "midi"}]'
 *   style="width: 100%; height: 600px;"
 * ></wave-roll>
 */
class WaveRollElement extends HTMLElement {
  private player: any = null;
  private container: HTMLDivElement | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.initializePlayer();
  }

  disconnectedCallback() {
    if (this.player && typeof this.player.destroy === 'function') {
      this.player.destroy();
    }
  }

  static get observedAttributes() {
    return ['files'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'files' && oldValue !== newValue) {
      this.initializePlayer();
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    // Create styles
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .wave-roll-container {
        width: 100%;
        height: 100%;
        position: relative;
      }
    `;

    // Create container
    this.container = document.createElement('div');
    this.container.className = 'wave-roll-container';

    // Clear and append
    this.shadowRoot.innerHTML = '';
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(this.container);
  }

  private async initializePlayer() {
    if (!this.container) return;

    // Clean up existing player
    if (this.player) {
      if (typeof this.player.destroy === 'function') {
        this.player.destroy();
      }
      this.player = null;
    }

    // Parse files attribute
    const filesAttr = this.getAttribute('files');
    
    let files = [];
    if (filesAttr) {
      try {
        files = JSON.parse(filesAttr);
      } catch (e) {
        console.error('Invalid files attribute:', e);
        return;
      }
    }

    // Always create the player, even with no files (shows empty state)
    try {
      this.player = await createWaveRollPlayer(this.container, files);
      // Notify listeners the component has finished initialization
      this.dispatchEvent(new Event('load'));
    } catch (e) {
      console.error('Failed to initialize WaveRoll player:', e);
    }
  }

  // Expose minimal control API for tests/integration
  public async play(): Promise<void> {
    if (this.player?.play) {
      await this.player.play();
    }
  }

  public pause(): void {
    if (this.player?.pause) {
      this.player.pause();
    }
  }

  public get isPlaying(): boolean {
    return !!this.player?.isPlaying;
  }

  /**
   * Seek to a specific time (seconds).
   * Provided for E2E/manual testing via index.html.
   */
  public seek(time: number): void {
    try {
      // Prefer direct method on player if available
      if (typeof this.player?.seek === 'function') {
        this.player.seek(time);
        return;
      }
      // Fallback: try visualization engine behind the player
      (this.player as any)?.visualizationEngine?.seek?.(time, true);
    } catch (e) {
      console.error('WaveRollElement.seek failed:', e);
    }
  }

  /**
   * Return lightweight state for assertions in tests.
   */
  public getState(): any {
    try {
      if (typeof this.player?.getState === 'function') {
        return this.player.getState();
      }
      return (this.player as any)?.visualizationEngine?.getState?.();
    } catch (e) {
      console.error('WaveRollElement.getState failed:', e);
      return null;
    }
  }
}

// Register the custom element
if (!customElements.get('wave-roll')) {
  customElements.define('wave-roll', WaveRollElement);
}

export { WaveRollElement };
