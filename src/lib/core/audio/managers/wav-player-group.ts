import * as Tone from 'tone';
import type { PlayerGroup, SynchronizationInfo } from '../master-clock';

/**
 * AudioFileInfo type definition
 */
interface AudioFileInfo {
  id: string;
  isVisible: boolean;
  isMuted: boolean;
  url?: string;
  audioBuffer?: AudioBuffer;
  pan?: number;
  volume?: number;
}

/**
 * AudioPlayerEntry type definition
 */
interface AudioPlayerEntry {
  player: Tone.Player;
  pitchShift: Tone.PitchShift;
  gate: Tone.Gain;
  panner: Tone.Panner;
  /** Estimated latency introduced by the FX chain (seconds) */
  effectLatencySec: number;
  isStarted: boolean;
  muted: boolean;
  startToken: number;
  scheduledTimer?: NodeJS.Timeout | null;
  transportEventId?: string | number | null;
  
  // Individual player control state
  volume: number;
  pan: number;
}

/**
 * WAV Player Group - Synchronized with AudioMasterClock
 * 
 * User requirements: Individual control of volume, pan, mute for each WAV player
 */
export class WavPlayerGroup implements PlayerGroup {
  private audioPlayers = new Map<string, AudioPlayerEntry>();
  private bufferLoadPromise: Promise<void> | null = null;
  private notifyBufferReady: (() => void) | null = null;
  private activeAudioId: string | null = null;
  private lastStartGen: number | null = null;
  
  // Master volume (controlled from above)
  private masterVolume: number = 1.0;
  // WAV group mix gain to balance vs MIDI
  private mixGain: number = 0.8;
  private originalTempoBase: number = 120;
  
  constructor() {
    // Intentionally quiet to reduce console noise
  }
  
  /**
   * Set buffer ready state callback
   */
  setBufferReadyCallback(callback: () => void): void {
    this.notifyBufferReady = callback;
  }
  
  /**
   * Setup audio players
   */
  async setupAudioPlayersFromRegistry(options: any = {}): Promise<void> {
    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
    if (!api?.getFiles) {
      // console.log('[WavPlayerGroup] Audio API not available');
      return;
    }
    
    const items = api.getFiles() as AudioFileInfo[];
    // console.log('[WavPlayerGroup] Found', items.length, 'audio files in registry:', items.map(i => (i as any).displayName || i.id));
    // Prepare audio players for all registered files
    
    for (const item of items) {
      if (!this.audioPlayers.has(item.id)) {
        // console.log('[WavPlayerGroup] Creating player for:', (item as any).displayName || item.id);
        await this.createPlayerEntry(item);
      }
    }
    
    this.startBufferMonitoring();
  }
  
  /**
   * Create individual player
   */
  private async createPlayerEntry(item: AudioFileInfo): Promise<void> {
    try {
      // console.log('[WavPlayerGroup] Creating player for', item.id, 'URL:', item.url);
      
      // Create player and nodes (pitch-preserving time-stretch)
      const player = new Tone.Player({
        url: item.url,
        onload: () => {
          // console.log('[WavPlayerGroup] Buffer loaded for', item.id);
          if (this.notifyBufferReady) {
            this.notifyBufferReady();
          }
        },
        onerror: (error) => {
          console.error('[WavPlayerGroup] Buffer load failed for', item.id, ':', error);
        }
      });
      const pitchShift = new Tone.PitchShift({ pitch: 0 });
      // Reduce analysis window to minimize latency; typical trade-off quality vs latency
      try { (pitchShift as unknown as { windowSize?: number }).windowSize = 0.03; } catch {}
      
      const gate = new Tone.Gain(1);
      const panner = new Tone.Panner(item.pan ?? 0);
      
      // Connection: Player → PitchShift → Gate → Panner → Destination
      player.connect(pitchShift);
      pitchShift.connect(gate);
      gate.connect(panner);
      panner.toDestination();
      
      // Create entry
      const entry: AudioPlayerEntry = {
        player,
        pitchShift,
        gate,
        panner,
        effectLatencySec: 0.03,
        isStarted: false,
        muted: item.isMuted || false,
        startToken: 0,
        volume: 1.0,
        pan: item.pan ?? 0.0,
      };
      
      this.audioPlayers.set(item.id, entry);
      // Ensure initial pan is applied to the panner node
      try { entry.panner.pan.value = entry.pan; } catch {}
      
      // If registry already has a decoded AudioBuffer, use it
      if (item.audioBuffer && (Tone as any).ToneAudioBuffer) {
        try {
          entry.player.buffer = new (Tone as any).ToneAudioBuffer(item.audioBuffer);
          // console.log('[WavPlayerGroup] Used pre-decoded buffer for', item.id);
        } catch (error) {
          console.warn('[WavPlayerGroup] Failed to use pre-decoded buffer for', item.id, ':', error);
        }
      }
      
      // console.log('[WavPlayerGroup] Created player entry for', item.id);
      
    } catch (error) {
      console.error('[WavPlayerGroup] Failed to create player for', item.id, ':', error);
    }
  }
  
  /**
   * Start buffer monitoring
   */
  private startBufferMonitoring(): void {
    if (this.bufferLoadPromise) return;
    
    this.bufferLoadPromise = new Promise((resolve) => {
      const checkBuffers = () => {
        if (this.areAllBuffersReady()) {
          resolve();
          if (this.notifyBufferReady) {
            this.notifyBufferReady();
          }
        } else {
          setTimeout(checkBuffers, 100);
        }
      };
      checkBuffers();
    });
  }

  /**
   * Wait until all WAV buffers are ready (or resolve immediately if none).
   */
  async waitUntilReady(): Promise<void> {
    // Ensure monitoring is active
    this.startBufferMonitoring();
    if (!this.bufferLoadPromise) {
      return;
    }
    try {
      await this.bufferLoadPromise;
    } catch {
      // Swallow errors to avoid blocking playback forever; caller decides policy
    }
  }
  
  /**
   * Check if all buffers are ready
   */
  private areAllBuffersReady(): boolean {
    // Consider ready if either the player's buffer is loaded or the registry item has a decoded buffer
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
      const items = api?.getFiles?.() as AudioFileInfo[] | undefined;
      for (const [id, entry] of this.audioPlayers) {
        const reg = items?.find((it) => it.id === id);
        const hasDecoded = !!reg?.audioBuffer;
        const hasLoaded = !!entry.player.buffer && (entry.player as any).buffer?.loaded !== false;
        if (!hasDecoded && !hasLoaded) return false;
      }
      return true;
    } catch {
      // Fallback to player buffers only
      for (const [, entry] of this.audioPlayers) {
        if (!(entry.player as any).buffer || (entry.player as any).buffer?.loaded === false) {
          return false;
        }
      }
      return true;
    }
  }
  
  /**
   * PlayerGroup interface implementation: Synchronized start
   */
  async startSynchronized(syncInfo: SynchronizationInfo): Promise<void> {
    
    // Dedupe: ignore duplicate start requests for the same generation
    const currentGen = syncInfo.generation;
    if (typeof currentGen === 'number') {
      if (this.lastStartGen === currentGen) {
        return;
      }
      this.lastStartGen = currentGen;
    }
    
    // Setup audio players first
    try {
      await this.setupAudioPlayersFromRegistry({});
    } catch (error) {
      console.error('[WavPlayerGroup] Setup failed:', error);
      return;
    }
    
    // Re-check generation after await to prevent race condition
    if (typeof currentGen === 'number' && this.lastStartGen !== currentGen) {
      return;
    }
    
    // Wait for buffers to be ready
    if (this.bufferLoadPromise) {
      try {
        await this.bufferLoadPromise;
      } catch (error) {
        console.error('[WavPlayerGroup] Buffer loading failed:', error);
      }
    }
    
    // Re-check generation after buffer await
    if (typeof currentGen === 'number' && this.lastStartGen !== currentGen) {
      return;
    }
    
    // Check if audio API is available
    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
    if (!api?.getFiles) {
      console.warn('[WavPlayerGroup] Audio API not available');
      return;
    }
    
    const items = api.getFiles() as AudioFileInfo[];
    // console.log('[WavPlayerGroup] Found', items.length, 'audio files to process for sync start');
    
    let startedCount = 0;
    
    // Start synchronization for each audio file
    for (const item of items) {
      const entry = this.audioPlayers.get(item.id);
      
      if (!entry) {
        console.warn('[WavPlayerGroup] No player entry for', item.id);
        continue;
      }
      
      // Only skip if not visible - always start playback for timing synchronization
      if (!item.isVisible) {
        // console.log('[WavPlayerGroup] Skipping invisible item:', (item as any).displayName || item.id);
        continue;
      }
      
      // Prevent ghost audio with generation token
      entry.startToken = (entry.startToken || 0) + 1;
      const token = entry.startToken;
      
      // Clear existing schedule
      if (entry.scheduledTimer) {
        clearTimeout(entry.scheduledTimer);
        entry.scheduledTimer = null;
      }
      
      // Check buffer load status
      if (!entry.player.buffer?.loaded) {
        // console.warn('[WavPlayerGroup] Buffer not loaded for:', item.id);
        continue;
      }
      
      try {
        // Stop existing playback
        if (entry.isStarted) {
          entry.player.stop();
          entry.isStarted = false;
        }
        
        // Calculate volume respecting per-entry mute only (UI is source of truth)
        const isMuted = entry.muted;
        const finalVolume = this.masterVolume * this.mixGain * entry.volume * (isMuted ? 0 : 1);
        entry.gate.gain.value = finalVolume;
        
        // Compute safe offset within buffer duration (if known)
        const bufferDuration = (entry.player.buffer as any)?.duration ?? item.audioBuffer?.duration ?? 0;
        let offset = syncInfo.masterTime;
        if (bufferDuration && (offset < 0 || offset > bufferDuration - 0.001)) {
          offset = Math.max(0, Math.min(bufferDuration - 0.001, offset));
        }
        
        // Align with Transport and compensate FX latency: subtract latency from offset
        // so audio content aligns with masterTime. Clamp to [0, bufferDuration).
        const adjustedOffset = Math.max(0, Math.min(
          bufferDuration > 0 ? bufferDuration - 0.001 : Number.POSITIVE_INFINITY,
          offset
        ));
        
        entry.player.start(syncInfo.audioContextTime, adjustedOffset);
        entry.isStarted = true;
        startedCount++;
        
      } catch (error) {
        console.error('[WavPlayerGroup] Failed to start', item.id, ':', error);
      }
    }
    
    // console.log('[WavPlayerGroup] Successfully started', startedCount, 'of', items.length, 'audio files');
  }
  
  /**
   * PlayerGroup interface implementation: Synchronized stop
   */
  stopSynchronized(): void {
    // Stop all WAV players immediately
    
    for (const [id, entry] of this.audioPlayers) {
      try {
        if (entry.scheduledTimer) {
          clearTimeout(entry.scheduledTimer);
          entry.scheduledTimer = null;
        }
        
        if (entry.isStarted) {
          entry.player.stop();
          entry.isStarted = false;
        }
        
        entry.gate.gain.value = 0;
      } catch (error) {
        console.error('[WavPlayerGroup] Failed to stop', id, ':', error);
      }
    }
  }
  
  /**
   * PlayerGroup interface implementation: Seek to time
   */
  seekTo(time: number): void {
    // For atomic seek restart, stop and allow Unified controller to reschedule at exact anchor
    this.stopSynchronized();
  }
  
  /**
   * PlayerGroup interface implementation: Set tempo
   */
  setTempo(bpm: number): void {
    // WAV players handle tempo change with playbackRate (no immediate restart here)
    const base = this.originalTempoBase || 120;
    const rate = bpm / base;
    const safeRate = Math.max(1e-6, rate);
    const semitones = 12 * Math.log2(safeRate);
    
    for (const [id, entry] of this.audioPlayers) {
      try {
        entry.player.playbackRate = safeRate;
        // Counter pitch-shift to preserve original pitch while changing speed
        entry.pitchShift.pitch = -semitones;
        // Reset and re-apply processing latency hint for stable sync after rate change
        entry.effectLatencySec = 0.03;
      } catch (error) {
        console.error('[WavPlayerGroup] Failed to set tempo for', id, ':', error);
      }
    }
  }

  /** Set baseline tempo used to compute playbackRate. */
  setOriginalTempoBase(bpm: number): void {
    if (Number.isFinite(bpm) && bpm > 0) {
      this.originalTempoBase = bpm;
    }
  }
  
  /**
   * PlayerGroup interface implementation: Set master volume
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = volume;
    
    // Apply to all players
    for (const [id, entry] of this.audioPlayers) {
      try {
        entry.gate.gain.value = this.masterVolume * this.mixGain * entry.volume * (entry.muted ? 0 : 1);
      } catch (error) {
        console.error('[WavPlayerGroup] Failed to set master volume for', id, ':', error);
      }
    }
  }
  
  /**
   * PlayerGroup interface implementation: Set loop
   */
  setLoop(mode: 'off' | 'repeat' | 'ab', markerA: number | null, markerB: number | null): void {
    // WAV player loops are handled by upper controller
  }
  
  // === Individual player control methods (user requirements) ===
  
  /**
   * Set individual WAV player volume
   */
  setPlayerVolume(playerId: string, volume: number): void {
    const entry = this.audioPlayers.get(playerId);
    if (!entry) {
      console.warn('[WavPlayerGroup] Player not found:', playerId, '→ attempting setup and retry');
      try {
        this.setupAudioPlayersFromRegistry({}).then(() => {
          const e2 = this.audioPlayers.get(playerId);
          if (!e2) return;
          e2.volume = Math.max(0, Math.min(1, volume));
          e2.gate.gain.value = this.masterVolume * this.mixGain * e2.volume * (e2.muted ? 0 : 1);
        }).catch(() => {});
      } catch {}
      return;
    }
    
    entry.volume = Math.max(0, Math.min(1, volume));
    entry.gate.gain.value = this.masterVolume * this.mixGain * entry.volume * (entry.muted ? 0 : 1);
    
    // no-op log
  }
  
  /**
   * Set individual WAV player pan
   */
  setPlayerPan(playerId: string, pan: number): void {
    const entry = this.audioPlayers.get(playerId);
    if (!entry) {
      console.warn('[WavPlayerGroup] Player not found:', playerId, '→ attempting setup and retry');
      try {
        this.setupAudioPlayersFromRegistry({}).then(() => {
          const e2 = this.audioPlayers.get(playerId);
          if (!e2) return;
          e2.pan = Math.max(-1, Math.min(1, pan));
          try { e2.panner.pan.value = e2.pan; } catch {}
        }).catch(() => {});
      } catch {}
      return;
    }
    
    entry.pan = Math.max(-1, Math.min(1, pan));
    try {
      entry.panner.pan.value = entry.pan;
    } catch {}
    
    // no-op log
  }
  
  /**
   * Set individual WAV player mute
   */
  setPlayerMute(playerId: string, muted: boolean): void {
    const entry = this.audioPlayers.get(playerId);
    if (!entry) {
      console.warn('[WavPlayerGroup] Player not found:', playerId, '→ attempting setup and retry');
      try {
        this.setupAudioPlayersFromRegistry({}).then(() => {
          const e2 = this.audioPlayers.get(playerId);
          if (!e2) return;
          e2.muted = muted;
          e2.gate.gain.value = this.masterVolume * this.mixGain * e2.volume * (e2.muted ? 0 : 1);
        }).catch(() => {});
      } catch {}
      return;
    }
    
    entry.muted = muted;
    entry.gate.gain.value = this.masterVolume * this.mixGain * entry.volume * (entry.muted ? 0 : 1);
    
    // no-op log
  }

  /**
   * Adjust WAV group mix gain (0-1) to balance against MIDI group
   */
  setGroupMixGain(gain: number): void {
    this.mixGain = Math.max(0, Math.min(1, gain));
    for (const [, entry] of this.audioPlayers) {
      entry.gate.gain.value = this.masterVolume * this.mixGain * entry.volume * (entry.muted ? 0 : 1);
    }
  }

  /**
   * Ensure a specific WAV player is started and aligned to the given master time.
   * Used when a track is unmuted or made visible during ongoing playback.
   */
  syncStartIfNeeded(playerId: string, masterTime: number, lookahead: number = 0.03): void {
    const entry = this.audioPlayers.get(playerId);
    if (!entry) return;

    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
      const item = api?.getFiles?.()?.find((f) => f.id === playerId);
      if (!item) return;

      const shouldPlay = !!item.isVisible && !entry.muted;
      if (!shouldPlay) return;
      if (!entry.player.buffer?.loaded) return;

      if (!entry.isStarted) {
        const startAt = Tone.now() + lookahead;
        // Volume gate respects masterVolume * entry.volume (mute already applied)
        const finalVolume = this.masterVolume * entry.volume;
        entry.gate.gain.value = finalVolume;
        entry.player.start(startAt, masterTime);
        entry.isStarted = true;
        // Debug log
        // console.log('[WavPlayerGroup] syncStartIfNeeded: started', playerId, 'at', startAt, 'offset', masterTime);
      }
    } catch {}
  }

  /**
   * Iterate over all players and start any pending unmuted+visible players at the current master time.
   * Lightweight O(N) check, safe to call from a visual update loop.
   */
  syncPendingPlayers(masterTime: number, lookahead: number = 0.03): void {
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
      const items = api?.getFiles?.() || [];
      for (const [id, entry] of this.audioPlayers) {
        const item = items.find((f) => f.id === id);
        if (!item) continue;
      const shouldPlay = !!item.isVisible && !entry.muted;
        if (!shouldPlay) continue;
        if (entry.isStarted) continue;
        if (!entry.player.buffer?.loaded) continue;

        const startAt = Tone.now() + lookahead;
        const finalVolume = this.masterVolume * entry.volume;
        entry.gate.gain.value = finalVolume;
        entry.player.start(startAt, masterTime);
        entry.isStarted = true;
      }
    } catch {}
  }
  
  /**
   * Get individual player states
   */
  getPlayerStates(): Record<string, { volume: number; pan: number; muted: boolean }> {
    const states: Record<string, { volume: number; pan: number; muted: boolean }> = {};
    
    for (const [id, entry] of this.audioPlayers) {
      states[id] = {
        volume: entry.volume,
        pan: entry.pan,
        muted: entry.muted
      };
    }
    
    return states;
  }
  
  /**
   * Resource cleanup
   */
  destroy(): void {
    // Intentionally quiet
    
    this.stopSynchronized();
    
    for (const [id, entry] of this.audioPlayers) {
      try {
        entry.player.dispose();
        try { entry.pitchShift.dispose(); } catch {}
        entry.gate.dispose();
      } catch (error) {
        console.error('[WavPlayerGroup] Failed to dispose', id, ':', error);
      }
    }
    
    this.audioPlayers.clear();
  }
}
