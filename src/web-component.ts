import { createWaveRollPlayer } from "./lib/components/player/wave-roll/player";

/**
 * WaveRoll Web Component
 * 
 * Usage:
 * <wave-roll 
 *   files='[{"path": "file.mid", "name": "File Name"}]'
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
    if (!filesAttr) return;

    let files;
    try {
      files = JSON.parse(filesAttr);
    } catch (e) {
      console.error('Invalid files attribute:', e);
      return;
    }

    if (!Array.isArray(files) || files.length === 0) {
      console.warn('No files provided to wave-roll component');
      return;
    }

    // Create new player
    try {
      this.player = await createWaveRollPlayer(this.container, files);
    } catch (e) {
      console.error('Failed to initialize WaveRoll player:', e);
    }
  }
}

// Register the custom element
if (!customElements.get('wave-roll')) {
  customElements.define('wave-roll', WaveRollElement);
}

export { WaveRollElement };