/**
 * MIDI Player UI component using html-midi-player Web Components
 *
 * This module provides functionality to create interactive MIDI players
 * with piano-roll visualization and playback controls.
 */

import { MidiInput } from "@/types";

// Module-level cache for Blob URLs to prevent regeneration
const blobUrlCache = new Map<string, string>();

// Track created blob URLs for cleanup
const createdBlobUrls = new Set<string>();

/**
 * Configuration options for the MIDI player
 */
export interface MidiPlayerOptions {
  /** Whether to show the piano-roll visualizer */
  showVisualizer?: boolean;
  /** Whether to load a sound font for audio playback. Can be boolean or custom soundfont URL */
  soundFont?: boolean | string;
  /** Custom CSS class for styling */
  className?: string;
  /** Custom width for the player */
  width?: string;
  /** Custom height for the visualizer */
  height?: string;
}

/**
 * Validates that an ArrayBuffer contains valid MIDI data
 * @param arrayBuffer - The data to validate
 * @returns Boolean indicating if the data appears to be valid MIDI
 */
function validateMidiData(arrayBuffer: ArrayBuffer): boolean {
  if (arrayBuffer.byteLength < 14) return false; // Minimum MIDI file size

  const uint8Array = new Uint8Array(arrayBuffer);
  // MIDI files start with "MThd" header
  return (
    uint8Array[0] === 0x4d && // 'M'
    uint8Array[1] === 0x54 && // 'T'
    uint8Array[2] === 0x68 && // 'h'
    uint8Array[3] === 0x64
  ); // 'd'
}

/**
 * Converts an ArrayBuffer to a base64 data URL for MIDI data
 * @param arrayBuffer - The MIDI file data as ArrayBuffer
 * @returns Base64 encoded data URL suitable for html-midi-player
 *
 * @example
 * ```typescript
 * const midiData = await loadMidiFromUrl('song.mid');
 * const dataUrl = arrayBufferToDataUrl(midiData);
 * // Returns: "data:audio/midi;base64,TVRoZAAAAAY..."
 * ```
 */
export function arrayBufferToDataUrl(arrayBuffer: ArrayBuffer): string {
  // Validate MIDI data format
  if (!validateMidiData(arrayBuffer)) {
    console.warn("Warning: Data does not appear to be valid MIDI format");
  }

  const uint8Array = new Uint8Array(arrayBuffer);
  const binaryString = Array.from(uint8Array, (byte) =>
    String.fromCharCode(byte)
  ).join("");
  const base64String = btoa(binaryString);
  return `data:audio/midi;base64,${base64String}`;
}

/**
 * Converts an ArrayBuffer to a Blob URL for MIDI data
 * More efficient than base64 data URLs for large MIDI files
 * Uses caching to prevent redundant blob creation
 * @param arrayBuffer - The MIDI file data as ArrayBuffer
 * @returns Blob URL suitable for html-midi-player
 */
export function arrayBufferToBlobUrl(arrayBuffer: ArrayBuffer): string {
  // Validate MIDI data format
  if (!validateMidiData(arrayBuffer)) {
    console.warn("Warning: Data does not appear to be valid MIDI format");
  }

  // Create a hash key from the ArrayBuffer for caching
  const uint8Array = new Uint8Array(arrayBuffer);
  const hashKey = Array.from(uint8Array.slice(0, 32)).join(","); // Use first 32 bytes as hash

  // Check cache first
  if (blobUrlCache.has(hashKey)) {
    console.log("Reusing cached blob URL for MIDI data");
    return blobUrlCache.get(hashKey)!;
  }

  // Create new blob URL
  const blob = new Blob([arrayBuffer], { type: "audio/midi" });
  const blobUrl = URL.createObjectURL(blob);

  // Cache the blob URL
  blobUrlCache.set(hashKey, blobUrl);
  createdBlobUrls.add(blobUrl);

  console.log("Created new blob URL for MIDI data");
  return blobUrl;
}

/**
 * Loads MIDI data from various input sources
 * @param input - URL string or File object
 * @returns Promise that resolves to ArrayBuffer containing MIDI data
 */
async function loadMidiData(input: MidiInput): Promise<ArrayBuffer> {
  if (typeof input === "string") {
    // Load from URL
    try {
      const response = await fetch(input);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch MIDI file: ${response.status} ${response.statusText}`
        );
      }

      // Check if response is actually binary data
      const contentType = response.headers.get("content-type");
      if (
        contentType &&
        !contentType.includes("audio/midi") &&
        !contentType.includes("application/octet-stream")
      ) {
        console.warn(
          `Unexpected content type: ${contentType}. Proceeding anyway...`
        );
      }

      return response.arrayBuffer();
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message.includes("Failed to fetch")
      ) {
        throw new Error(
          `Network error: Could not fetch MIDI file from ${input}. Check if the URL is correct and accessible.`
        );
      }
      throw error;
    }
  } else {
    // Load from File object
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to read file as ArrayBuffer"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(input);
    });
  }
}

/**
 * Creates a MIDI player with piano-roll visualization
 *
 * This function creates the html-midi-player Web Components and injects them
 * into the specified container element. The player includes playback controls
 * and an optional piano-roll visualizer.
 *
 * @param container - The DOM element to inject the player into
 * @param input - MIDI data source (URL, File, or ArrayBuffer)
 * @param options - Configuration options for the player
 * @returns Promise that resolves when the player is ready
 *
 * @example
 * ```typescript
 * // Create player from URL
 * const container = document.getElementById('player-container');
 * await createMidiPlayer(container, 'https://example.com/song.mid', {
 *   showVisualizer: true,
 *   soundFont: true
 * });
 *
 * // Create player from File
 * const fileInput = document.querySelector('input[type="file"]');
 * const file = fileInput.files[0];
 * await createMidiPlayer(container, file, { showVisualizer: true });
 * ```
 */
export async function createMidiPlayer(
  container: HTMLElement,
  input: MidiInput | ArrayBuffer,
  options: MidiPlayerOptions = {}
): Promise<void> {
  // Default options
  const opts = {
    showVisualizer: true,
    soundFont: true,
    className: "wave-roll-player",
    width: "100%",
    height: "200px",
    ...options,
  };

  try {
    // Ensure components are loaded first
    if (!isPlayerAvailable()) {
      console.log("Loading MIDI player components...");
      await loadPlayerComponents();
    }

    // Load MIDI data if not already an ArrayBuffer
    let arrayBuffer: ArrayBuffer;
    if (input instanceof ArrayBuffer) {
      arrayBuffer = input;
    } else {
      arrayBuffer = await loadMidiData(input);
    }

    // Validate MIDI data
    if (!validateMidiData(arrayBuffer)) {
      throw new Error(
        "Invalid MIDI data format - file does not contain valid MIDI header"
      );
    }

    // Convert to Blob URL (more efficient than data URL)
    const blobUrl = arrayBufferToBlobUrl(arrayBuffer);
    console.log("Using Blob URL for MIDI player:", blobUrl);

    // Check if player already exists - REUSE instead of recreating
    let player = container.querySelector("midi-player") as any;
    let visualizer = container.querySelector("midi-visualizer") as any;

    if (player && visualizer) {
      console.log("Reusing existing player and visualizer elements");

      // Stop current playback before updating
      if (player.stop && typeof player.stop === "function") {
        player.stop();
      }

      // Update src attributes on existing elements (no soundfont re-download)
      player.setAttribute("src", blobUrl);
      visualizer.setAttribute("src", blobUrl);

      // Brief delay for data update
      await new Promise((resolve) => setTimeout(resolve, 200));

      console.log("Player and visualizer updated with new MIDI data");
      return;
    }

    // Only create new elements if they don't exist
    console.log("Creating new player and visualizer elements");

    // Clear container only if creating new elements
    container.innerHTML = "";

    // Generate unique IDs to avoid conflicts
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 9);
    const playerId = `midi-player-${timestamp}-${randomId}`;
    const visualizerId = `midi-visualizer-${timestamp}-${randomId}`;

    // Create player element
    player = document.createElement("midi-player");
    player.setAttribute("id", playerId);
    player.setAttribute("src", blobUrl);

    // Handle sound font attribute
    if (opts.soundFont && typeof opts.soundFont === "string") {
      player.setAttribute("sound-font", opts.soundFont);
    } else if (opts.soundFont === true) {
      // When soundFont is set to true, enable the default SoundFont shipped with
      // html-midi-player by adding an empty "sound-font" attribute. This turns
      // the plain oscillator synth into a full GM SoundFont (acoustic piano,
      // etc.) without forcing users to supply a custom URL.
      player.setAttribute("sound-font", "");
    }

    player.setAttribute("class", opts.className);
    player.style.width = opts.width;

    // Create visualizer element if requested
    if (opts.showVisualizer) {
      visualizer = document.createElement("midi-visualizer");
      visualizer.setAttribute("id", visualizerId);
      visualizer.setAttribute("src", blobUrl); // CRITICAL: visualizer needs its own src
      visualizer.setAttribute("type", "piano-roll");
      visualizer.setAttribute("class", `${opts.className}-visualizer`);

      // Enhanced CSS styling for visibility
      visualizer.style.cssText = `
        width: ${opts.width};
        height: ${opts.height};
        display: block;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        overflow: hidden;
        margin-top: 10px;
      `;
    }

    // Append elements to container FIRST
    container.appendChild(player);
    if (visualizer) {
      container.appendChild(visualizer);
    }

    // Wait for Web Components to be defined
    console.log("Waiting for Web Components to be defined...");
    await Promise.all([
      customElements.whenDefined("midi-player"),
      customElements.whenDefined("midi-visualizer"),
    ]);

    // NOW set the visualizer attribute after both elements are in DOM
    if (opts.showVisualizer && visualizer) {
      console.log(`Linking player to visualizer: #${visualizerId}`);
      player.setAttribute("visualizer", `#${visualizerId}`);
    }

    // Add longer delay for proper initialization
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify elements are properly connected
    if (opts.showVisualizer) {
      const playerElement = container.querySelector(`#${playerId}`) as any;
      const visualizerElement = container.querySelector(
        `#${visualizerId}`
      ) as any;

      console.log("Player element:", !!playerElement);
      console.log("Visualizer element:", !!visualizerElement);
      console.log(
        "Player visualizer attribute:",
        playerElement?.getAttribute("visualizer")
      );

      if (playerElement && visualizerElement) {
        console.log("Player and visualizer successfully created and linked");
      } else {
        console.warn("Player or visualizer element not found in DOM");
      }
    }
  } catch (error) {
    console.error("MIDI player creation error:", error);
    throw new Error(
      `Failed to create MIDI player: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Utility function to check if html-midi-player Web Components are available
 * @returns Boolean indicating if the components are loaded
 */
export function isPlayerAvailable(): boolean {
  return (
    typeof customElements !== "undefined" &&
    customElements.get("midi-player") !== undefined &&
    customElements.get("midi-visualizer") !== undefined
  );
}

/**
 * Debug function to check player and visualizer status
 * @param container - The container element to check
 * @returns Debug information about the player state
 */
export function debugPlayerState(container: HTMLElement): any {
  const playerElement = container.querySelector("midi-player") as any;
  const visualizerElement = container.querySelector("midi-visualizer") as any;

  return {
    containerExists: !!container,
    playerExists: !!playerElement,
    visualizerExists: !!visualizerElement,
    playerSrc: playerElement?.getAttribute("src")?.substring(0, 50) + "...",
    playerVisualizerAttr: playerElement?.getAttribute("visualizer"),
    visualizerId: visualizerElement?.getAttribute("id"),
    visualizerType: visualizerElement?.getAttribute("type"),
    componentsAvailable: isPlayerAvailable(),
    playerCustomElement: !!customElements.get("midi-player"),
    visualizerCustomElement: !!customElements.get("midi-visualizer"),
  };
}

/**
 * Cleans up cached blob URLs to prevent memory leaks
 * Should be called when the player is no longer needed
 */
export function cleanupBlobUrls(): void {
  for (const blobUrl of createdBlobUrls) {
    URL.revokeObjectURL(blobUrl);
  }
  createdBlobUrls.clear();
  blobUrlCache.clear();
  console.log("Cleaned up cached blob URLs");
}

/**
 * Loads the html-midi-player Web Components if not already loaded
 * This function dynamically imports the components to ensure they're available
 * @returns Promise that resolves when components are loaded
 */
export async function loadPlayerComponents(): Promise<void> {
  if (isPlayerAvailable()) {
    return; // Already loaded
  }

  try {
    // Import html-midi-player to register the Web Components
    console.log("Loading html-midi-player module...");
    await import("html-midi-player");
    console.log("html-midi-player module loaded successfully");

    // Wait for components to be defined
    await Promise.all([
      customElements.whenDefined("midi-player"),
      customElements.whenDefined("midi-visualizer"),
    ]);

    console.log("Web Components registered successfully");
  } catch (error) {
    console.error("Error loading MIDI player components:", error);
    throw new Error(
      `Failed to load MIDI player components: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
