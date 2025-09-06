/**
 * WAV Player Manager
 * Handles external audio file (WAV/MP3) playback using Tone.Player + PitchShift
 * to preserve pitch while changing playback rate.
 */

import * as Tone from "tone";
import { AudioFileInfo, AUDIO_CONSTANTS } from "../player-types";
import { clamp } from "../../utils";
import { toDb, fromDb, isSilentDb, clamp01, effectiveVolume, mixLinear } from "../utils";

export interface AudioPlayerEntry {
  player: Tone.Player;
  pitch: Tone.PitchShift;
  panner: Tone.Panner;
  url: string;
  muted?: boolean;
  /** Token to invalidate stale async starts (e.g., overlapping loads) */
  startToken?: number;
  /** Pending timeout id for a scheduled start (if any) */
  scheduledTimer?: number | null;
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
  setupAudioPlayersFromRegistry(state: { volume?: number; playbackRate?: number; isPlaying?: boolean; currentTime?: number }): void {
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
      if (!api?.getFiles) return;

      const items = api.getFiles() as AudioFileInfo[];

      // Clean up players for removed items
      this.audioPlayers.forEach((entry, id) => {
        if (!items.find((it) => it.id === id)) {
          try {
            // Invalidate pending starts and clear timers
            entry.startToken = (entry.startToken || 0) + 1;
            if (entry.scheduledTimer) {
              clearTimeout(entry.scheduledTimer);
              entry.scheduledTimer = null;
            }
          } catch {}
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
            const pitch = new Tone.PitchShift(0).connect(panner);

            // Create player with error handling
            const player = new Tone.Player({
              url: it.url,
              onload: () => {
                console.debug(`Audio buffer loaded for ${it.id}`);
              },
              onerror: (error: Error) => {
                console.warn(
                  `Audio file could not be loaded for ${it.id}:`,
                  (error as Error).message
                );
                // Clean up on error
                setTimeout(() => {
                  if (this.audioPlayers.has(it.id)) {
                    const entry = this.audioPlayers.get(it.id);
                    if (entry) {
                      try {
                        entry.startToken = (entry.startToken || 0) + 1;
                        if (entry.scheduledTimer) {
                          clearTimeout(entry.scheduledTimer);
                          entry.scheduledTimer = null;
                        }
                      } catch {}
                      try { entry.player.dispose(); } catch {}
                      try { entry.pitch.dispose(); } catch {}
                      try { entry.panner.dispose(); } catch {}
                      this.audioPlayers.delete(it.id);
                    }
                  }
                }, 100);
              },
            }).connect(pitch);

            player.loop = false; // No looping at player level
            // Apply mute state to WAV player volume
            const volumeValue = effectiveVolume(
              state?.volume ?? AUDIO_CONSTANTS.DEFAULT_VOLUME,
              it.isMuted
            );
            player.volume.value = toDb(volumeValue);
            // Apply current playback rate + pitch compensation
            const ratePct = state?.playbackRate ?? AUDIO_CONSTANTS.DEFAULT_PLAYBACK_RATE;
            const speed = Math.max(0.1, ratePct / 100);
            player.playbackRate = speed;
            try {
              const semitones = -12 * Math.log2(speed);
              pitch.pitch = isFinite(semitones) ? semitones : 0;
              (pitch as any).windowSize = (pitch as any).windowSize ?? 0.06;
            } catch {}
            this.audioPlayers.set(it.id, { player, pitch, panner, url: it.url, startToken: 0, scheduledTimer: null });
          } catch (error) {
            console.error(`Failed to create audio player for ${it.id}:`, error);
          }
        } else {
          const entry = this.audioPlayers.get(it.id)!;
          entry.panner.pan.value = clamp(it.pan ?? 0, -1, 1);

          // Update volume based on mute state
          const volumeValue = effectiveVolume(
            state?.volume ?? AUDIO_CONSTANTS.DEFAULT_VOLUME,
            it.isMuted
          );
          entry.player.volume.value = toDb(volumeValue);

          if (entry.url !== it.url) {
            try { entry.player.dispose(); } catch {}
            entry.url = it.url;
            entry.player = new Tone.Player(it.url).connect(entry.pitch);
            entry.player.volume.value = toDb(volumeValue);
            const ratePct = state?.playbackRate ?? AUDIO_CONSTANTS.DEFAULT_PLAYBACK_RATE;
            const speed = Math.max(0.1, ratePct / 100);
            entry.player.playbackRate = speed;
            try {
              const semitones = -12 * Math.log2(speed);
              entry.pitch.pitch = isFinite(semitones) ? semitones : 0;
            } catch {}
            entry.startToken = 0;
            entry.scheduledTimer = null;
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
    // Prefer registry truth: any visible and unmuted item means audio should be active
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
      const items = api?.getFiles?.() as AudioFileInfo[] | undefined;
      if (items && items.some((i) => i.isVisible && !i.isMuted)) {
        return true;
      }
    } catch {}
    // Fallback to local players map
    return this.audioPlayers.size > 0;
  }

  /**
   * Stop all audio players
   */
  stopAllAudioPlayers(): void {
    this.audioPlayers.forEach((entry) => {
      const { player } = entry;
      // Invalidate any pending scheduled start and clear timer
      try {
        entry.startToken = (entry.startToken || 0) + 1;
        if (entry.scheduledTimer) {
          clearTimeout(entry.scheduledTimer);
          entry.scheduledTimer = null;
        }
      } catch {}
      // Stop current playback immediately
      try {
        player.stop("+0");
      } catch {}
    });
  }

  /**
   * Start all unmuted WAV files at specified offset
   */
  startActiveAudioAt(offsetSeconds: number, startAt: string | number = "+0"): void {
    // Ensure players exist for registry items before attempting to start
    try {
      this.setupAudioPlayersFromRegistry({});
    } catch {}
    // Start ALL unmuted WAV files, not just the "active" one
    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
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
      type PlayerWithBuffer = Tone.Player & { buffer?: { loaded?: boolean } };
      type LoadablePlayer = Tone.Player & { load?: (url: string) => Promise<unknown> };
      const buffer = (entry.player as PlayerWithBuffer).buffer;
      // Debug info suppressed in production
      if (!buffer || buffer.loaded === false) {
        // No reliable load() promise on GrainPlayer; poll until buffer is ready
        entry.startToken = (entry.startToken || 0) + 1;
        const token = entry.startToken;
        const targetStart = this.resolveStartAt(startAt);
        const poll = () => {
          if (token !== entry.startToken) return;
          const b = (entry.player as PlayerWithBuffer).buffer;
          const ready = !!b && b.loaded !== false;
          const now = Tone.now();
          if (ready) {
            try { entry.player.stop("+0"); } catch {}
            const drift = now - targetStart;
            if (drift <= 0) {
              // Still before target start: schedule directly at absolute context time
              try { entry.player.start(targetStart, Math.max(0, offsetSeconds)); } catch {}
            } else {
              // Target start already passed: compensate by advancing offset
              const rate = (entry.player.playbackRate || 1);
              const offsetComp = Math.max(0, offsetSeconds + drift * rate);
              try { entry.player.start("+0", offsetComp); } catch {}
            }
            entry.scheduledTimer = null;
            return;
          }
          // Poll again shortly, or wait until target start time
          entry.scheduledTimer = window.setTimeout(
            poll,
            Math.max(10, Math.min(50, (targetStart - now) * 1000))
          );
        };
        const initialDelay = Math.max(0, (targetStart - Tone.now()) * 1000);
        if (entry.scheduledTimer) clearTimeout(entry.scheduledTimer);
        entry.scheduledTimer = window.setTimeout(poll, initialDelay);
        return;
      }

      try { entry.player.stop("+0"); } catch {}
      // Bump token to indicate a new start request and invalidate prior async starts
      entry.startToken = (entry.startToken || 0) + 1;
      if (entry.scheduledTimer) {
        clearTimeout(entry.scheduledTimer);
        entry.scheduledTimer = null;
      }
      // Schedule directly at absolute AudioContext time to minimize jitter
      const targetStart2 = this.resolveStartAt(startAt);
      try {
        // Ensure we don't schedule in the past
        const safeStart = Math.max(targetStart2, Tone.now() + 0.001);
        entry.player.start(safeStart, Math.max(0, offsetSeconds));
      } catch {}
    });
  }

  /**
   * Convert a startAt parameter (e.g., "+0.01" or absolute number) to an absolute AudioContext time.
   */
  private resolveStartAt(startAt: string | number): number {
    if (typeof startAt === "number") return startAt;
    const s = String(startAt).trim();
    if (s.startsWith("+")) {
      const rel = parseFloat(s.slice(1)) || 0;
      return Tone.now() + rel;
    }
    const abs = parseFloat(s);
    return isFinite(abs) ? abs : Tone.now();
  }

  /**
   * Set volume for all WAV players
   */
  setVolume(volume: number): void {
    const db = toDb(volume);
    this.audioPlayers.forEach(({ player }) => {
      player.volume.value = db;
    });
  }

  /**
   * Set pan for all WAV players
   */
  setPan(pan: number): void {
    const clamped = clamp(pan, -1, 1);
    this.audioPlayers.forEach(({ panner }) => {
      panner.pan.value = clamped;
    });
  }

  /**
   * Set playback rate for all WAV players
   */
  setPlaybackRate(rate: number): void {
    const speed = Math.max(0.1, rate / 100);
    this.audioPlayers.forEach(({ player, pitch }) => {
      try { player.playbackRate = speed; } catch {}
      try {
        const semitones = -12 * Math.log2(speed);
        pitch.pitch = isFinite(semitones) ? semitones : 0;
      } catch {}
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
    const clampedVolume = clamp01(volume);
    const db = toDb(mixLinear(masterVolume, clampedVolume));
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
    const wasEffectivelyMuted = isSilentDb(wasDb); // ~silent threshold in dB
    if (clampedVolume > 0 && wasEffectivelyMuted && opts?.isPlaying) {
      const offsetSeconds = Math.max(0, opts?.currentTime ?? 0);
      type PlayerWithBuffer2 = Tone.Player & { buffer?: { loaded?: boolean } };
      const buffer = (entry.player as PlayerWithBuffer2).buffer;
      try {
        if (!buffer || buffer.loaded === false) {
          type LoadablePlayer = Tone.Player & { load?: (url: string) => Promise<unknown> };
          const maybePromise = (entry.player as LoadablePlayer).load?.(entry.url);
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
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ id: string; volume?: number }> } })._waveRollAudio;
      if (api?.getFiles) {
        const files = api.getFiles();
        const file = files.find((f) => f.id === fileId);
        if (file) {
          // Store volume in metadata (not affecting mute flag)
          (file as { volume?: number }).volume = clampedVolume;
        }
      }
    } catch {
      // Registry not available
    }
  }

  /**
   * Get file mute states
   */
  getFileMuteStates(): Map<string, boolean> {
    const states = new Map<string, boolean>();
    const SILENT_DB = AUDIO_CONSTANTS.SILENT_DB;
    this.audioPlayers.forEach(({ player }, fileId) => {
      states.set(fileId, player.volume.value <= SILENT_DB);
    });
    return states;
  }

  /**
   * Get file volume states
   */
  getFileVolumeStates(): Map<string, number> {
    const states = new Map<string, number>();
    this.audioPlayers.forEach(({ player }, fileId) => {
      const linearVolume = fromDb(player.volume.value);
      states.set(fileId, linearVolume);
    });
    return states;
  }

  /**
   * Set file mute state
   */
  setFileMute(fileId: string, mute: boolean): boolean {
    const entry = this.audioPlayers.get(fileId);
    if (!entry) return false;
    
    const { player } = entry;
    const SILENT_DB = AUDIO_CONSTANTS.SILENT_DB;
    
    if (mute) {
      player.volume.value = SILENT_DB;
    } else {
      // Unmute to default volume
      player.volume.value = toDb(0.7);
    }
    
    return true;
  }

  /**
   * Set file volume
   */
  setFileVolume(fileId: string, volume: number): boolean {
    const entry = this.audioPlayers.get(fileId);
    if (!entry) return false;
    
    const { player } = entry;
    const clamped = clamp01(volume);
    player.volume.value = toDb(clamped);
    
    return true;
  }

  /**
   * Check if all players have zero volume
   */
  areAllPlayersZeroVolume(): boolean {
    const SILENT_DB = AUDIO_CONSTANTS.SILENT_DB;
    if (this.audioPlayers.size === 0) return true;
    
    return !Array.from(this.audioPlayers.values()).some(
      ({ player }) => player.volume.value > SILENT_DB
    );
  }

  /**
   * Refresh from MIDI manager
   */
  refreshFromMidiManager(midiManager: any): boolean {
    if (!midiManager) return false;
    
    try {
      // Re-setup audio players from registry
      this.setupAudioPlayersFromRegistry({});
      return true;
    } catch (error) {
      console.error("[WavPlayerManager] Failed to refresh:", error);
      return false;
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
      const api = (globalThis as unknown as {
        _waveRollAudio?: { getFiles?: () => Array<{ id: string; isVisible: boolean; isMuted: boolean }> };
      })._waveRollAudio;
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
      const db = toDb(clamp01(masterVolume));
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
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
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
   * Restart at position
   */
  restartAtPosition(position: number, startAt?: string | number): void {
    this.stopAllAudioPlayers();
    this.startActiveAudioAt(position, startAt ?? "+0");
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.audioPlayers.forEach(({ player, pitch, panner }) => {
      try {
        player.dispose();
      } catch {}
      try {
        pitch.dispose();
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
    // Note: Do NOT auto-restart here.
    // - Unmuted files are started immediately in setWavVolume() at current position
    // - Explicit calls from seek()/play()/loop will start via startActiveAudioAt()
    // This method only syncs the registry and builds/refreshes players.
  }

  // Grain parameters removed; using Tone.PitchShift for pitch preservation.

  /**
   * Check if there are any visible & unmuted WAV players whose buffers are not yet loaded.
   * Useful to decide whether to delay a synchronized start a bit longer.
   */
  hasActiveUnloadedPlayers(): boolean {
    try {
      // Ensure players reflect current registry
      this.setupAudioPlayersFromRegistry({});

      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
      const items = api?.getFiles?.() as AudioFileInfo[] | undefined;
      if (!items || items.length === 0) return false;

      // Iterate active (visible & unmuted) items
      for (const it of items) {
        if (!it.isVisible || it.isMuted) continue;
        const entry = this.audioPlayers.get(it.id);
        if (!entry) return true; // not built yet => effectively unloaded
        const buffer = (entry.player as unknown as { buffer?: { loaded?: boolean } }).buffer;
        if (!buffer || buffer.loaded === false) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Wait until all active (visible & unmuted) WAV buffers are ready or timeout.
   * Returns true if ready within the timeout, false otherwise.
   */
  async waitUntilActiveReady(timeoutMs: number = 800, pollMs: number = 25): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!this.hasActiveUnloadedPlayers()) return true;
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return !this.hasActiveUnloadedPlayers();
  }

  /**
   * Wait for all active WAV buffers to be fully loaded before playback
   * Returns a promise that resolves when all buffers are ready
   */
  async waitForAllBuffersReady(): Promise<void> {
    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
    if (!api?.getFiles) return;
    
    const items = api.getFiles() as AudioFileInfo[];
    const promises: Promise<void>[] = [];
    
    // Check all visible and unmuted audio files
    items.forEach((item) => {
      const localEntry = this.audioPlayers.get(item.id);
      const isMuted = item.isMuted || localEntry?.muted;
      
      if (!item.isVisible || isMuted) return;
      
      const entry = this.audioPlayers.get(item.id);
      if (!entry) return;
      
      // Create promise for each buffer that needs loading
      type PlayerWithBuffer = Tone.Player & { buffer?: { loaded?: boolean } };
      const buffer = (entry.player as PlayerWithBuffer).buffer;
      
      if (!buffer || buffer.loaded === false) {
        promises.push(new Promise<void>((resolve) => {
          const checkBuffer = () => {
            const b = (entry.player as PlayerWithBuffer).buffer;
            if (b && b.loaded !== false) {
              resolve();
            } else {
              setTimeout(checkBuffer, 10);
            }
          };
          checkBuffer();
        }));
      }
    });
    
    // Wait for all buffers to be ready
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  /**
   * Start all active audio with guaranteed synchronization
   * All buffers must be loaded before calling this method
   */
  startActiveAudioAtSync(offsetSeconds: number, startAt: string | number = "+0"): void {
    // Ensure players exist for registry items before attempting to start
    try {
      this.setupAudioPlayersFromRegistry({});
    } catch {}
    
    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
    if (!api?.getFiles) return;
    
    const items = api.getFiles() as AudioFileInfo[];
    const targetStart = this.resolveStartAt(startAt);
    
    // Start ALL unmuted WAV files at exactly the same time
    items.forEach((item) => {
      const localEntry = this.audioPlayers.get(item.id);
      const isMuted = item.isMuted || localEntry?.muted;
      
      if (!item.isVisible || isMuted) return;
      
      const entry = this.audioPlayers.get(item.id);
      if (!entry) return;
      
      // Stop any existing playback
      try { entry.player.stop("+0"); } catch {}
      
      // Clear any existing timers
      if (entry.scheduledTimer) {
        clearTimeout(entry.scheduledTimer);
        entry.scheduledTimer = null;
      }
      
      // Start at exact target time with offset
      try {
        const safeStart = Math.max(targetStart, Tone.now() + 0.001);
        entry.player.start(safeStart, Math.max(0, offsetSeconds));
      } catch (e) {
        console.error("[WavPlayerManager] Failed to start player:", e);
      }
    });
  }

  /**
   * Estimate processing latency introduced by PitchShift (in seconds).
   * Uses windowSize if available; falls back to 0.06s.
   */
  getEstimatedLatencySec(): number {
    let maxWin = 0;
    try {
      this.audioPlayers.forEach(({ pitch }) => {
        try {
          const ws = (pitch as unknown as { windowSize?: number }).windowSize;
          if (typeof ws === 'number' && isFinite(ws)) {
            maxWin = Math.max(maxWin, ws);
          }
        } catch {}
      });
    } catch {}
    // Empirically, PitchShift audible latency is closer to ~windowSize/2
    const win = maxWin > 0 ? maxWin : 0.06;
    return win * 0.5;
  }
}
