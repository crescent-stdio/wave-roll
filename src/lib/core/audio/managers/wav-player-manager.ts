/**
 * WAV Player Manager
 * Handles external audio file (WAV/MP3) playback using Tone.js GrainPlayer
 */

import * as Tone from "tone";
import { AudioFileInfo, AUDIO_CONSTANTS } from "../player-types";

export interface AudioPlayerEntry {
  player: Tone.GrainPlayer;
  panner: Tone.Panner;
  url: string;
  muted?: boolean;
}

export class WavPlayerManager {
  /** Map of audioId -> { player, panner, url } for waveform playback */
  private audioPlayers: Map<string, AudioPlayerEntry> = new Map();
  /** Currently selected active audio id (from window._waveRollAudio) */
  private activeAudioId: string | null = null;
  
  /**
   * Build/refresh Tone.Player instances from global audio registry (window._waveRollAudio)
   * and select the first visible & unmuted item as the active audio source.
   */
  setupAudioPlayersFromRegistry(state: { volume?: number; playbackRate?: number }): void {
    try {
      const api = (window as any)._waveRollAudio;
      if (!api?.getFiles) return;

      const items = api.getFiles() as AudioFileInfo[];

      // Clean up players for removed items
      this.audioPlayers.forEach((entry, id) => {
        if (!items.find((it) => it.id === id)) {
          entry.player.dispose();
          entry.panner.dispose();
          this.audioPlayers.delete(id);
        }
      });

      // Create/refresh players
      for (const it of items) {
        if (!this.audioPlayers.has(it.id)) {
          try {
            const panner = new Tone.Panner(it.pan ?? 0).toDestination();

            // Create player with error handling
            const player = new Tone.GrainPlayer({
              url: it.url,
              onload: () => {
                console.debug(`Audio buffer loaded for ${it.id}`);
              },
              onerror: (error: Error) => {
                // Some audio formats may not be supported - this is not critical
                console.warn(
                  `Audio file could not be loaded for ${it.id}:`,
                  error.message
                );
                // Clean up on error
                setTimeout(() => {
                  if (this.audioPlayers.has(it.id)) {
                    const entry = this.audioPlayers.get(it.id);
                    if (entry) {
                      entry.player.dispose();
                      entry.panner.dispose();
                      this.audioPlayers.delete(it.id);
                    }
                  }
                }, 100);
              },
            }).connect(panner);

            player.grainSize = 0.1;
            player.overlap = 0.05;
            // Apply mute state to WAV player volume
            const volumeValue = it.isMuted
              ? 0
              : (state?.volume ?? AUDIO_CONSTANTS.DEFAULT_VOLUME);
            player.volume.value = Tone.gainToDb(volumeValue);
            // Apply current playback rate if set
            if (state?.playbackRate) {
              player.playbackRate = state.playbackRate / 100;
            }
            this.audioPlayers.set(it.id, { player, panner, url: it.url });
          } catch (error) {
            console.error(`Failed to create audio player for ${it.id}:`, error);
          }
        } else {
          const entry = this.audioPlayers.get(it.id)!;
          entry.panner.pan.value = Math.max(-1, Math.min(1, it.pan ?? 0));

          // Update volume based on mute state
          const volumeValue = it.isMuted
            ? 0
            : (state?.volume ?? AUDIO_CONSTANTS.DEFAULT_VOLUME);
          entry.player.volume.value = Tone.gainToDb(volumeValue);

          if (entry.url !== it.url) {
            entry.player.dispose();
            entry.url = it.url;
            entry.player = new Tone.GrainPlayer(it.url, () => {
              // Buffer loaded callback
            }).connect(entry.panner);
            entry.player.grainSize = 0.1;
            entry.player.overlap = 0.05;
            entry.player.volume.value = Tone.gainToDb(volumeValue);
            // Apply current playback rate if set
            if (state?.playbackRate) {
              entry.player.playbackRate = state.playbackRate / 100;
            }
          }
        }
      }

      // No longer select a single "active" audio - all unmuted audios will play
      const eligible = items.filter((i) => i.isVisible && !i.isMuted);
      this.activeAudioId = eligible.length > 0 ? eligible[0].id : null;
    } catch {
      // registry not present -> ignore
    }
  }

  /**
   * Check if any audio player is active
   */
  isAudioActive(): boolean {
    return (
      this.activeAudioId !== null && this.audioPlayers.has(this.activeAudioId)
    );
  }

  /**
   * Stop all audio players
   */
  stopAllAudioPlayers(): void {
    this.audioPlayers.forEach(({ player }) => {
      try {
        player.stop("+0");
      } catch {}
    });
  }

  /**
   * Start all unmuted WAV files at specified offset
   */
  startActiveAudioAt(offsetSeconds: number): void {
    // Start ALL unmuted WAV files, not just the "active" one
    const api = (window as any)._waveRollAudio;
    if (!api?.getFiles) return;

    const items = api.getFiles() as AudioFileInfo[];

    // Play all visible and unmuted audio files
    items.forEach((item) => {
      // Check both local mute state and API mute state
      const localEntry = this.audioPlayers.get(item.id);
      const isMuted = item.isMuted || localEntry?.muted;

      if (!item.isVisible || isMuted) return;

      const entry = this.audioPlayers.get(item.id);
      if (!entry) return;

      // If the underlying buffer is not yet loaded, defer start until it is.
      const buffer: any = (entry.player as any).buffer;
      console.log("[WM.start]", {
        id: item.id,
        offsetSeconds,
        muted: isMuted,
        bufferLoaded: !!buffer && buffer.loaded !== false,
      });
      if (!buffer || buffer.loaded === false) {
        try {
          const maybePromise = (entry.player as any).load?.(entry.url);
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise
              .then(() => {
                try {
                  entry.player.stop("+0");
                } catch {}
                try {
                  entry.player.start("+0", Math.max(0, offsetSeconds));
                  console.log("[WM.started-postload]", { id: item.id, offsetSeconds });
                } catch {}
              })
              .catch(() => {
                // Silently ignore; a subsequent play/loop will retry
              });
          }
        } catch {
          // Ignore; a later attempt will retry once buffer is ready
        }
        return;
      }

      try {
        entry.player.stop("+0");
      } catch {}
      try {
        entry.player.start("+0", Math.max(0, offsetSeconds));
        console.log("[WM.started]", { id: item.id, offsetSeconds });
      } catch {}
    });
  }

  /**
   * Set volume for all WAV players
   */
  setVolume(volume: number): void {
    const db = Tone.gainToDb(volume);
    this.audioPlayers.forEach(({ player }) => {
      player.volume.value = db;
    });
  }

  /**
   * Set pan for all WAV players
   */
  setPan(pan: number): void {
    const clamped = Math.max(-1, Math.min(1, pan));
    this.audioPlayers.forEach(({ panner }) => {
      panner.pan.value = clamped;
    });
  }

  /**
   * Set playback rate for all WAV players
   */
  setPlaybackRate(rate: number): void {
    const speedMultiplier = rate / 100;
    this.audioPlayers.forEach(({ player }) => {
      if (player) {
        player.playbackRate = speedMultiplier;
      }
    });
  }

  /**
   * Set volume for a specific WAV file
   */
  setWavVolume(
    fileId: string,
    volume: number,
    masterVolume: number,
    opts?: { isPlaying?: boolean; currentTime?: number }
  ): void {
    const entry = this.audioPlayers.get(fileId);
    if (!entry) {
      return;
    }

    // Apply volume to the player
    const clampedVolume = Math.max(0, Math.min(1, volume));
    const db = Tone.gainToDb(clampedVolume * masterVolume);
    const wasDb = entry.player.volume.value;
    entry.player.volume.value = db;
    console.log("[WM.setWavVolume]", {
      fileId,
      volume,
      masterVolume,
      wasDb,
      db,
      isPlaying: opts?.isPlaying,
      currentTime: opts?.currentTime,
    });

    // If unmuting this WAV while transport is playing, ensure it starts immediately
    const wasEffectivelyMuted = wasDb <= -80; // ~silent threshold in dB
    if (clampedVolume > 0 && wasEffectivelyMuted && opts?.isPlaying) {
      const offsetSeconds = Math.max(0, opts?.currentTime ?? 0);
      const buffer: any = (entry.player as any).buffer;
      try {
        if (!buffer || buffer.loaded === false) {
          const maybePromise = (entry.player as any).load?.(entry.url);
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise
              .then(() => {
                try {
                  entry.player.stop("+0");
                } catch {}
                try {
                  entry.player.start("+0", offsetSeconds);
                  console.log("[WM.unmute-started-postload]", { fileId, offsetSeconds });
                } catch {}
              })
              .catch(() => {
                // Ignore load failures here; a later action will retry
              });
          }
        } else {
          try {
            entry.player.stop("+0");
          } catch {}
          try {
            entry.player.start("+0", offsetSeconds);
            console.log("[WM.unmute-started]", { fileId, offsetSeconds });
          } catch {}
        }
      } catch {
        // Best-effort start; ignore errors to keep UI responsive
      }
    }

    // Update registry if available
    try {
      const api = (window as any)._waveRollAudio;
      if (api?.getFiles) {
        const files = api.getFiles();
        const file = files.find((f: any) => f.id === fileId);
        if (file) {
          // Store volume in metadata (not affecting mute flag)
          (file as any).volume = clampedVolume;
        }
      }
    } catch {
      // Registry not available
    }
  }

  /**
   * Check if all WAV players are muted
   */
  areAllPlayersMuted(): boolean {
    const SILENT_DB = AUDIO_CONSTANTS.SILENT_DB;
    
    if (this.audioPlayers.size === 0) {
      return true;
    }
    
    return !Array.from(this.audioPlayers.values()).some(
      ({ player }) => player.volume.value > SILENT_DB
    );
  }

  /**
   * If all WAV players are muted and at least one is visible, unmute visible players,
   * raise their volume to masterVolume and start them at the given offset.
   */
  unmuteAndStartVisibleIfAllMuted(
    offsetSeconds: number,
    masterVolume: number
  ): void {
    try {
      const api = (window as any)._waveRollAudio;
      if (!api?.getFiles) return;

      const items = api.getFiles() as AudioFileInfo[];
      const allMuted = this.areAllPlayersMuted();
      if (!allMuted) {
        return;
      }

      // Unmute visible items in registry
      items.forEach((it) => {
        if (it.isVisible && it.isMuted) {
          it.isMuted = false;
        }
      });

      // Lift player volumes and start
      const db = Tone.gainToDb(Math.max(0, Math.min(1, masterVolume)));
      this.audioPlayers.forEach(({ player }, id) => {
        try {
          player.volume.value = db;
        } catch {}
      });

      console.log("[WM.unmuteAndStartVisibleIfAllMuted]", {
        offsetSeconds,
        masterVolume,
      });
      this.startActiveAudioAt(offsetSeconds);
    } catch {
      // ignore
    }
  }

  /**
   * Get maximum duration from audio buffers
   */
  getMaxAudioDuration(): number {
    try {
      const api = (window as any)._waveRollAudio;
      if (!api?.getFiles) return 0;

      const items = api.getFiles() as AudioFileInfo[];
      const audioDurations = items
        .map((i) => i.audioBuffer?.duration || 0)
        .filter((d) => d > 0);
      
      return audioDurations.length > 0 ? Math.max(...audioDurations) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.audioPlayers.forEach(({ player, panner }) => {
      try {
        player.dispose();
      } catch {}
      try {
        panner.dispose();
      } catch {}
    });
    this.audioPlayers.clear();
  }

  /**
   * Refresh audio players and restart if playing
   */
  refreshAudioPlayers(state: { 
    isPlaying: boolean; 
    currentTime: number; 
    volume?: number; 
    playbackRate?: number 
  }): void {
    const wasPlaying = state.isPlaying;
    const currentTime = state.currentTime;

    this.setupAudioPlayersFromRegistry(state);

    // If we're currently playing, start any newly unmuted WAV files at the current position
    if (wasPlaying) {
      this.startActiveAudioAt(currentTime);
    }
  }
}
