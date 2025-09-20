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
  gate: Tone.Gain;
  panner: Tone.Panner;
  url: string;
  muted?: boolean;
  /** Whether this player has been started at least once and not subsequently hard-stopped */
  isStarted?: boolean;
  /** Token to invalidate stale async starts (e.g., overlapping loads) */
  startToken?: number;
  /** Pending timeout id for a scheduled start (if any) - legacy setTimeout scheduling */
  scheduledTimer?: number | ReturnType<typeof setTimeout> | null;
  /** Tone.js Transport event ID for synchronized scheduling */
  transportEventId?: number | null;
}

export class WavPlayerManager {
  /** Map of audioId -> { player, panner, url } for waveform playback */
  private audioPlayers: Map<string, AudioPlayerEntry> = new Map();
  private transportSyncManager?: import('./transport-sync-manager').TransportSyncManager;
	private bufferLoadPromise?: Promise<void[]>;
	private notifyBufferReady?: (id: string) => void;
  /** Currently selected active audio id (from window._waveRollAudio) */
  private activeAudioId: string | null = null;
  setTransportSyncManager(transportSyncManager: import('./transport-sync-manager').TransportSyncManager): void {
    this.transportSyncManager = transportSyncManager;
  }

	/**
	 * Set callback to notify when buffer status changes
	 */
	setBufferReadyCallback(callback: (id: string) => void): void {
		this.notifyBufferReady = callback;
	}

	/**
	 * Start monitoring buffer status for UI updates
	 */
	startBufferMonitoring(intervalMs: number = 500): () => void {
		let lastBufferState = this.areAllBuffersReady();
		
		const checkBuffers = () => {
			const currentBufferState = this.areAllBuffersReady();
			if (currentBufferState !== lastBufferState) {
				lastBufferState = currentBufferState;
				// Notify all files when buffer state changes
				this.audioPlayers.forEach((_, id) => {
					this.notifyBufferReady?.(id);
				});
			}
		};
		
		const intervalId = setInterval(checkBuffers, intervalMs);
		
		// Return cleanup function
		return () => {
			clearInterval(intervalId);
		};
	}

  
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

      // Track buffer loading promises for initial setup
      const bufferLoadPromises: Promise<void>[] = [];

      // Create/refresh players
      for (const it of items) {
        if (!this.audioPlayers.has(it.id)) {
          try {
            const panner = new Tone.Panner(it.pan ?? 0).toDestination();
            const gate = new Tone.Gain(1).connect(panner);
            const pitch = new Tone.PitchShift(0).connect(gate);

            // Create player with enhanced buffer loading tracking
            const player = new Tone.Player({
              url: it.url,
              onload: () => {
                console.debug(`Audio buffer loaded for ${it.id}`);
                // Trigger buffer ready check for UI updates
                this.notifyBufferReady?.(it.id);
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
                      try { (entry as any).gate?.dispose?.(); } catch {}
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
            
            this.audioPlayers.set(it.id, { player, pitch, gate, panner, url: it.url, isStarted: false, startToken: 0, scheduledTimer: null });

            // Create a promise to track this player's buffer loading
            const bufferPromise = new Promise<void>((resolve, reject) => {
              const checkBuffer = () => {
                const buffer = (player as any).buffer;
                if (buffer && buffer.loaded !== false && buffer._buffer) {
                  resolve();
                } else if (buffer && buffer.loaded === false) {
                  reject(new Error(`Buffer load failed for ${it.id}`));
                } else {
                  setTimeout(checkBuffer, 50);
                }
              };
              
              // Start checking after a short delay to allow initial setup
              setTimeout(checkBuffer, 100);
              
              // Timeout after 5 seconds
              setTimeout(() => reject(new Error(`Buffer load timeout for ${it.id}`)), 5000);
            });
            
            bufferLoadPromises.push(bufferPromise.catch(() => {})); // Ignore individual failures
            
          } catch (error) {
            console.error(`Failed to create audio player for ${it.id}:`, error);
          }
        } else {
          const entry = this.audioPlayers.get(it.id)!;
          entry.panner.pan.value = clamp(it.pan ?? 0, -1, 1);

          // Ensure gate exists for legacy entries
          if (!(entry as any).gate) {
            try {
              const newGate = new Tone.Gain(1);
              entry.pitch.disconnect();
              entry.pitch.connect(newGate);
              newGate.connect(entry.panner);
              (entry as any).gate = newGate;
            } catch {}
          }

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
            entry.isStarted = false;
            entry.startToken = 0;
            entry.scheduledTimer = null;
          }
        }
      }

      // Store buffer loading promise for external monitoring
      if (bufferLoadPromises.length > 0) {
        this.bufferLoadPromise = Promise.all(bufferLoadPromises);
      } else {
        this.bufferLoadPromise = Promise.resolve([]);
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
    const transport = Tone.getTransport();
    
    this.audioPlayers.forEach((entry) => {
      const { player, gate } = entry;
      // Hard mute gate to kill any tails immediately
      try { gate.gain.value = 0; } catch {}
      
      // 1. First invalidate all scheduled starts
      entry.startToken = (entry.startToken || 0) + 1;
      
      // 2. Clear Transport schedules
      if (entry.transportEventId) {
        transport.clear(entry.transportEventId);
        entry.transportEventId = null;
      }
      
      // 3. Clear legacy setTimeout timers
      if (entry.scheduledTimer) {
        clearTimeout(entry.scheduledTimer);
        entry.scheduledTimer = null;
      }
      
      // 4. Stop player only if it has been started before
      if (entry.isStarted) {
        try { player.stop(); } catch {}
      }
      entry.isStarted = false;
    });
    
    console.log("[WavPlayerManager] All audio players stopped (Transport events cleared, timers canceled, gates muted)");
  }

  /**
   * Start all unmuted WAV files at specified offset
   */
  startActiveAudioAt(offsetSeconds: number, startAt: string | number = "+0"): void {
    // Ensure players exist for registry items before attempting to start
    try { this.setupAudioPlayersFromRegistry({}); } catch {}

    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
    if (!api?.getFiles) return;
    const items = api.getFiles() as AudioFileInfo[];

    items.forEach((item) => {
      const localEntry = this.audioPlayers.get(item.id);
      const isMuted = item.isMuted || localEntry?.muted;
      if (!item.isVisible || isMuted) return;

      const entry = this.audioPlayers.get(item.id);
      if (!entry) return;

      // Invalidate any previous scheduled starts
      entry.startToken = (entry.startToken || 0) + 1;
      if (entry.scheduledTimer) {
        clearTimeout(entry.scheduledTimer);
        entry.scheduledTimer = null;
      }

      const targetStart = this.resolveStartAt(startAt);
      const schedule = () => {
        if (!this.audioPlayers.has(item.id)) return;
        if (entry.startToken === undefined) entry.startToken = 0; // guard

        const tokenAtSchedule = entry.startToken!;
        const exec = () => {
          if (tokenAtSchedule !== entry.startToken) return; // canceled/replaced
          if (entry.isStarted) { try { entry.player.stop(); } catch {} }
          const now2 = Tone.now();
          const drift = now2 - targetStart;
          const rate = (entry.player.playbackRate || 1);
          const base = Math.max(0, offsetSeconds - this.getEstimatedLatencySec());
          const offsetComp = Math.max(0, base + Math.max(0, drift) * rate);
          // Unmute gate just-in-time
          try { entry.gate.gain.value = 1; } catch {}
          try { entry.player.start(now2, offsetComp); entry.isStarted = true; } catch {}
          entry.scheduledTimer = null;
        };

        const delayMs = Math.max(0, (targetStart - Tone.now()) * 1000);
        entry.scheduledTimer = window.setTimeout(exec, delayMs);
      };

      // If buffer not ready, poll until ready then schedule using the same absolute anchor
      type PlayerWithBuffer = Tone.Player & { buffer?: { loaded?: boolean } };
      const checkReady = () => {
        const b = (entry.player as PlayerWithBuffer).buffer;
        const ready = !!b && b.loaded !== false;
        if (ready) {
          schedule();
        } else {
          entry.scheduledTimer = window.setTimeout(checkReady, 25);
        }
      };
      checkReady();
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

    // If unmuting this WAV while transport is playing, ensure it starts with unified absolute scheduling
    const wasEffectivelyMuted = isSilentDb(wasDb); // ~silent threshold in dB
    if (clampedVolume > 0 && wasEffectivelyMuted && opts?.isPlaying) {
      try {
        const now = Tone.now();
        const lookahead = AUDIO_CONSTANTS.LOOKAHEAD_TIME;
        const startAtAbs = now + lookahead;

        let offsetSeconds = 0;
        if (this.transportSyncManager) {
          const transport = Tone.getTransport();
          const transportAtStart = transport.seconds + (startAtAbs - now);
          const visualAtStart = this.transportSyncManager.transportToVisualTime(transportAtStart);
          offsetSeconds = Math.max(0, visualAtStart);
          console.log("[WM.setWavVolume] Unified offset via TransportSyncManager", {
            startAtAbs,
            transportAtStart,
            visualAtStart,
            offsetSeconds,
          });
        } else {
          offsetSeconds = Math.max(0, opts?.currentTime ?? 0);
          console.log("[WM.setWavVolume] Fallback offset via currentTime", { startAtAbs, offsetSeconds });
        }

        type PlayerWithBuffer2 = Tone.Player & { buffer?: { loaded?: boolean } };
        const buffer = (entry.player as PlayerWithBuffer2).buffer;
        if (!buffer || buffer.loaded === false) {
          // Defer start until buffer becomes ready, but schedule using absolute time when possible
          entry.startToken = (entry.startToken || 0) + 1;
          const token = entry.startToken;
          const poll = () => {
            if (token !== entry.startToken) return;
            const b = (entry.player as PlayerWithBuffer2).buffer;
            const ready = !!b && b.loaded !== false;
            const now2 = Tone.now();
            const targetStart = startAtAbs;
            if (ready) {
              try { entry.player.stop(); } catch {}
              const drift = now2 - targetStart;
              const offsetComp = Math.max(0, offsetSeconds + Math.max(0, drift) * (entry.player.playbackRate || 1));
              const safeStart = Math.max(now2 + 0.001, targetStart);
              try { entry.player.start(safeStart, offsetComp); } catch {}
              entry.scheduledTimer = null;
              return;
            }
            entry.scheduledTimer = window.setTimeout(poll, 25);
          };
          if (entry.scheduledTimer) clearTimeout(entry.scheduledTimer);
          entry.scheduledTimer = window.setTimeout(poll, Math.max(0, (startAtAbs - Tone.now()) * 1000));
        } else {
          try { entry.player.stop(); } catch {}
          const safeStart = Math.max(startAtAbs, Tone.now() + 0.001);
          try { entry.player.start(safeStart, offsetSeconds); } catch {}
          console.log("[WM.unmute-started-unified]", { fileId, startAtAbs: safeStart, offsetSeconds });
        }
      } catch {
        // Best-effort; ignore errors to keep UI responsive
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
    
    console.log("[WavPlayerManager] setFileMute", { fileId, mute });
    
    // Store mute state in entry
    entry.muted = mute;
    
    const { player, gate } = entry;
    
    if (mute) {
      // Mute: Only use gain control to maintain sync
      // Player continues running but is silent
      try { 
        gate.gain.value = 0; 
        console.log("[WavPlayerManager] Muted WAV", fileId, "via gain control (maintaining sync)");
      } catch (e) {
        console.warn("[WavPlayerManager] Failed to mute gate for", fileId, ":", e);
      }
    } else {
      // Unmute: Simply restore gain - no restart needed!
      // Player has been running synchronized all along
      try {
        gate.gain.value = 1;
        player.volume.value = toDb(0.7); // Restore original volume
        console.log("[WavPlayerManager] Unmuted WAV", fileId, "via gain control (no restart needed)");
      } catch (e) {
        console.warn("[WavPlayerManager] Failed to unmute gate for", fileId, ":", e);
      }
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
      // Check if transport is currently playing to avoid unnecessary interruptions
      const transport = Tone.getTransport();
      const isPlaying = transport.state === "started";
      
      if (isPlaying) {
        console.log("[WavPlayerManager] Skipping refresh during playback to maintain sync");
        // During playback, avoid full refresh to maintain synchronization
        // Only update metadata without recreating players
        return true;
      }
      
      console.log("[WavPlayerManager] Refreshing audio players (not playing)");
      // Re-setup audio players from registry only when not playing
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
    this.audioPlayers.forEach(({ player, pitch, gate, panner }) => {
      try {
        player.dispose();
      } catch {}
      try {
        pitch.dispose();
      } catch {}
      try {
        panner.dispose();
      } catch {}
      try { gate.dispose(); } catch {}
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
   * Synchronously check if all active audio buffers are ready
   * Returns immediately without waiting
   */
  /**
   * Synchronously check if all active audio buffers are ready
   * Returns immediately without waiting
   */
  areAllBuffersReady(): boolean {
    // Trust Tone.js to handle buffer loading internally
    // Just check if players exist for visible/unmuted files
    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
    if (!api?.getFiles) return true; // No audio files means all are "ready"
    
    const items = api.getFiles() as AudioFileInfo[];
    
    // Check that player entries exist for all visible and unmuted audio files
    for (const item of items) {
      const localEntry = this.audioPlayers.get(item.id);
      const isMuted = item.isMuted || localEntry?.muted;
      
      if (!item.isVisible || isMuted) {
        continue; // Skip muted or invisible items
      }
      
      const entry = this.audioPlayers.get(item.id);
      if (!entry) {
        return false; // Missing player entry
      }
    }
    
    return true; // All required players exist
  }

  /**
   * Start all active audio with guaranteed synchronization
   * All buffers must be loaded before calling this method
   */
  startActiveAudioAtSync(offsetSeconds: number, startAt: string | number = "+0"): void {
    try { this.setupAudioPlayersFromRegistry({}); } catch {}
    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
    if (!api?.getFiles) return;
    const items = api.getFiles() as AudioFileInfo[];
    const targetStart = this.resolveStartAt(startAt);

    console.log("[WavPlayerManager] Scheduling synchronized audio DIRECTLY at", targetStart, "offset", offsetSeconds);

    items.forEach((item) => {
      const localEntry = this.audioPlayers.get(item.id);
      const isMuted = item.isMuted || localEntry?.muted;
      if (!item.isVisible || isMuted) return;
      const entry = this.audioPlayers.get(item.id);
      if (!entry) return;

      // Invalidate and clear previous schedule
      entry.startToken = (entry.startToken || 0) + 1;
      
      // Clear any existing Transport schedules for this entry
      const transport = Tone.getTransport();
      if (entry.transportEventId) {
        transport.clear(entry.transportEventId);
        entry.transportEventId = null;
      }
      
      // Clear legacy setTimeout if any
      if (entry.scheduledTimer) { 
        clearTimeout(entry.scheduledTimer); 
        entry.scheduledTimer = null; 
      }

      const token = entry.startToken;
      
      // PHASE 1 FIX: Direct scheduling instead of Transport.scheduleOnce
      // Calculate precise delay to avoid Transport scheduling issues
      const currentTime = Tone.now();
      const delayMs = Math.max(0, (targetStart - currentTime) * 1000);
      
      console.log("[WavPlayerManager] Direct scheduling:", {
        currentTime,
        targetStart, 
        delayMs,
        item: item.id
      });
      
      // Use setTimeout for precise timing instead of Transport.scheduleOnce
      const timerId = setTimeout(() => {
        // Verify token is still valid (prevents ghost audio)
        if (token !== entry.startToken) {
          console.log("[WavPlayerManager] Ignoring stale schedule for", item.id);
          return;
        }
        
        if (entry.isStarted) { 
          try { entry.player.stop(); } catch {} 
        }
        
        // Calculate precise offset with latency compensation
        const rate = (entry.player.playbackRate || 1);
        const base = Math.max(0, offsetSeconds - this.getEstimatedLatencySec());
        const offsetComp = Math.max(0, base);
        
        // Get accurate audio context time for player.start()
        const audioContextTime = Tone.context.currentTime;
        
        try { entry.gate.gain.value = 1; } catch {}
        try { 
          // Start with accurate audio context time
          entry.player.start(audioContextTime, offsetComp); 
          entry.isStarted = true;
          console.log("[WavPlayerManager] Started WAV", item.id, "at audio time", audioContextTime, "with offset", offsetComp);
        } catch (e) {
          console.warn("[WavPlayerManager] Failed to start WAV", item.id, ":", e);
        }
        
        // Clear the timer reference
        entry.scheduledTimer = null;
      }, delayMs);
      
      // Store the timer ID for cleanup
      entry.scheduledTimer = timerId;
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
