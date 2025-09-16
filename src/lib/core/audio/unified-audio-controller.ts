import * as Tone from 'tone';
import { AudioMasterClock } from './master-clock';
import { WavPlayerGroup } from './managers/wav-player-group';
import { MidiPlayerGroup } from './managers/midi-player-group';

/**
 * Unified Audio Controller
 * 
 * Fully implements user requirements:
 * - Upper-level object: unified management of nowTime, isPlaying, tempo, masterVolume, loopMode, markerA/B
 * - Lower-level groups: per-player control of volume, pan, and mute
 * 
 * This class synchronizes WAV and MIDI player groups perfectly via AudioMasterClock.
 */
export class UnifiedAudioController {
  // Master clock (single time source)
  private masterClock: AudioMasterClock;
  
  // Player groups
  private wavPlayerGroup: WavPlayerGroup;
  private midiPlayerGroup: MidiPlayerGroup;
  
  // Initialization state
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  
  // Visual update handling
  private visualUpdateCallback?: (time: number) => void;
  private visualUpdateLoop?: number;
  private _prevTime: number = 0;
  private _lastLoopJumpAtGen: number = -1;
  private _lastRepeatWrapAtGen: number = -1;
  private lastJoinRequestTs = new Map<string, number>();
  private handleWavVisibilityChange = (e: Event) => {
    const detail = (e as CustomEvent<{ id: string; isVisible: boolean }>).detail;
    if (!detail) return;
    if (detail.isVisible) {
      this.alignWavJoin(detail.id);
    }
  };
  private handleWavMuteChange = (e: Event) => {
    const detail = (e as CustomEvent<{ id: string; isMuted: boolean }>).detail;
    if (!detail) return;
    try {
      // Keep engine's mute state in sync with UI/registry
      this.setWavPlayerMute(detail.id, detail.isMuted);
      // If unmuted during playback, ensure immediate join
      if (!detail.isMuted && this.masterClock.state.isPlaying) {
        this.alignWavJoin(detail.id);
      }
    } catch {}
  };
  
  constructor() {
    // console.log('[UnifiedAudioController] Initializing');
    
    // Create master clock
    this.masterClock = new AudioMasterClock();
    
    // Create player groups
    this.wavPlayerGroup = new WavPlayerGroup();
    this.midiPlayerGroup = new MidiPlayerGroup();
    
    // Register player groups to master clock
    this.masterClock.registerPlayerGroup(this.wavPlayerGroup);
    this.masterClock.registerPlayerGroup(this.midiPlayerGroup);
    
    // console.log('[UnifiedAudioController] Created with master clock and player groups');

    // Event-based WAV join alignment (avoid RAF-based rescheduling)
    if (typeof window !== 'undefined') {
      window.addEventListener('wr-wav-visibility-changed', this.handleWavVisibilityChange as EventListener);
      window.addEventListener('wr-wav-mute-changed', this.handleWavMuteChange as EventListener);
    }
  }
  
  /**
   * Compute effective total duration considering both MIDI and audible WAV sources.
   * Falls back to master clock's totalTime when registry is unavailable.
   */
  private getEffectiveTotalTime(): number {
    let duration = this.masterClock.state.totalTime || 0;
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ isVisible?: boolean; isMuted?: boolean; volume?: number; audioBuffer?: { duration?: number } }> } })._waveRollAudio;
      const items = api?.getFiles?.();
      if (items && Array.isArray(items)) {
        const audioDurations = items
          .filter((i) => i && (i.isVisible !== false) && (i.isMuted !== true) && (i.volume === undefined || i.volume > 0))
          .map((i) => (i?.audioBuffer?.duration ?? 0))
          .filter((d) => typeof d === 'number' && d > 0);
        if (audioDurations.length > 0) {
          duration = Math.max(duration, ...audioDurations);
        }
      }
    } catch {}
    return duration;
  }

  /**
   * Initialize (async)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = this.performInitialization();
    await this.initPromise;
  }
  
  private async performInitialization(): Promise<void> {
    try {
      console.log('[UnifiedAudioController] Starting initialization');
      
      // Ensure Tone.js context is running
      if ((Tone as any).context && (Tone as any).context.state !== 'running') {
        console.log('[UnifiedAudioController] AudioContext state:', Tone.context.state);
        await Tone.start();
        console.log('[UnifiedAudioController] Tone.js context started, new state:', Tone.context.state);
        
        // Additional verification that context is truly running
        if (Tone.context.state !== 'running') {
          console.warn('[UnifiedAudioController] AudioContext still not running after Tone.start()');
          // Try direct resume as fallback
          if ((Tone.context as any).resume) {
            await Tone.context.resume();
            console.log('[UnifiedAudioController] Direct context.resume() called, state:', Tone.context.state);
          }
        }
      }
      
      // Check WAV audio registry before initialization
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => any[] } })._waveRollAudio;
      if (api?.getFiles) {
        const files = api.getFiles();
        console.log('[UnifiedAudioController] WAV registry found:', files.length, 'files:', files.map(f => f.displayName || f.id));
      } else {
        console.log('[UnifiedAudioController] WAV registry not available');
      }
      
      // Initialize both player groups
      await this.midiPlayerGroup.initialize();
      await this.wavPlayerGroup.setupAudioPlayersFromRegistry();
      
      this.isInitialized = true;
      console.log('[UnifiedAudioController] Initialization completed, AudioContext state:', Tone.context.state);
      
    } catch (error) {
      console.error('[UnifiedAudioController] Initialization failed:', error);
      throw error;
    }
  }
  
  // === Upper-level unified control methods (user requirements) ===
  
  /**
   * Start unified playback
   */
  async play(): Promise<void> {
    await this.initialize();
    
    // console.log('[UnifiedAudioController] Starting unified playback');
    
    try {
      // Gate: ensure all audio backends are ready before first playback
      await this.midiPlayerGroup.waitUntilReady();
      await this.wavPlayerGroup.waitUntilReady();

      // If the anchor is too close, refresh nowTime and let master clock compute a fresh anchor
      const now = Tone.now();
      const lastAnchor = (this as any)._lastPlayAnchor as number | undefined;
      if (lastAnchor && now > lastAnchor - 0.01) {
        this.masterClock.state.nowTime = this.masterClock.getCurrentTime();
      }
      
      // Perfectly synchronized playback via the master clock
      await this.masterClock.startPlayback(this.masterClock.state.nowTime, 0.1);
      (this as any)._lastPlayAnchor = Tone.now() + 0.1;
      
      // Start visual update loop
      this.startVisualUpdateLoop();
      
      // console.log('[UnifiedAudioController] Unified playback started successfully');
    } catch (error) {
      console.error('[UnifiedAudioController] Failed to start playback:', error);
      throw error;
    }
  }
  
  /**
   * Pause unified playback
   */
  pause(): void {
    this.masterClock.pausePlayback(); // Use pausePlayback instead of stopPlayback
    this.stopVisualUpdateLoop();
  }
  
  /**
   * Stop unified playback (rewind to start)
   */
  stop(): void {
    this.masterClock.stopPlayback();
    this.stopVisualUpdateLoop();
  }
  
  /**
   * Seek to a specific time
   */
  seek(time: number): void {
    // console.log('[UnifiedAudioController] seek called with', time);
    this.masterClock.seekTo(time);
    try {
      const tr = Tone.getTransport();
      console.info('[SeekTrace][UAC] post-seek summary', {
        requested: time,
        transportSeconds: tr.seconds,
        transportState: tr.state,
        masterNow: this.masterClock.getCurrentTime(),
      });
    } catch {}
  }
  
  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    return this.masterClock.getCurrentTime();
  }
  
  /**
   * Check playing state
   */
  get isPlaying(): boolean {
    return this.masterClock.state.isPlaying;
  }
  
  /**
   * Current nowTime (user requirements)
   */
  get nowTime(): number {
    return this.masterClock.state.nowTime;
  }
  
  set nowTime(time: number) {
    this.masterClock.seekTo(time);
  }
  
  /**
   * Set/get total time
   */
  get totalTime(): number {
    return this.masterClock.state.totalTime;
  }
  
  set totalTime(time: number) {
    this.masterClock.state.totalTime = time;
  }
  
  /**
   * Set/get tempo (user requirements)
   */
  get tempo(): number {
    return this.masterClock.state.tempo;
  }
  
  set tempo(bpm: number) {
    this.masterClock.setTempo(bpm);
    // Propagate to groups for audio-rate changes
    try { this.wavPlayerGroup.setTempo(bpm); } catch {}
    try { this.midiPlayerGroup.setTempo(bpm); } catch {}
    // If playing, perform atomic short restart at same visual position to re-schedule MIDI with new scale
    try {
      if (this.masterClock.state.isPlaying) {
        const t = this.masterClock.getCurrentTime();
        // Seek using atomic restart path to avoid layering and reschedule Part/WAV to new tempo
        this.seek(t);
      }
    } catch {}
  }

  /**
   * Update baseline/original tempo (used as 100%).
   */
  setOriginalTempo(bpm: number): void {
    this.masterClock.setOriginalTempo(bpm);
    // Propagate baseline to groups that need it (e.g., WAV/MIDI scaling)
    this.wavPlayerGroup.setOriginalTempoBase(bpm);
    this.midiPlayerGroup.setOriginalTempoBase(bpm);
  }
  
  /**
   * Set/get master volume (user requirements)
   */
  get masterVolume(): number {
    return this.masterClock.state.masterVolume;
  }
  
  set masterVolume(volume: number) {
    this.masterClock.setMasterVolume(volume);
  }
  
  /**
   * Set/get loop mode (user requirements)
   */
  get loopMode(): 'off' | 'repeat' | 'ab' {
    return this.masterClock.state.loopMode;
  }
  
  set loopMode(mode: 'off' | 'repeat' | 'ab') {
    this.masterClock.setLoopMode(mode, this.masterClock.state.markerA ?? undefined, this.masterClock.state.markerB ?? undefined);
  }

  /**
   * Independent global repeat flag (separate from AB loop mode)
   */
  get isGlobalRepeat(): boolean {
    return !!(this.masterClock.state as any).globalRepeat;
  }

  set isGlobalRepeat(enabled: boolean) {
    (this.masterClock.state as any).globalRepeat = !!enabled;
  }
  
  /**
   * Set/get marker A (user requirements)
   */
  get markerA(): number | null {
    return this.masterClock.state.markerA;
  }
  
  set markerA(time: number | null) {
    this.masterClock.state.markerA = time;
    this.masterClock.setLoopMode(this.masterClock.state.loopMode, time ?? undefined, this.masterClock.state.markerB ?? undefined);
  }
  
  /**
   * Set/get marker B (user requirements)
   */
  get markerB(): number | null {
    return this.masterClock.state.markerB;
  }
  
  set markerB(time: number | null) {
    this.masterClock.state.markerB = time;
    this.masterClock.setLoopMode(this.masterClock.state.loopMode, this.masterClock.state.markerA ?? undefined, time ?? undefined);
  }
  
  /**
   * Configure A–B loop
   */
  setABLoop(markerA: number, markerB: number): void {
    this.masterClock.setLoopMode('ab', markerA, markerB);
  }
  
  // === Lower-level per-player control methods (user requirements) ===
  
  // Per-WAV-player controls
  
  /**
   * Set WAV player volume
   */
  setWavPlayerVolume(playerId: string, volume: number): void {
    this.wavPlayerGroup.setPlayerVolume(playerId, volume);
    // If currently playing and becoming audible, ensure the WAV joins immediately
    try {
      if (this.masterClock.state.isPlaying && volume > 0) {
        this.alignWavJoin(playerId);
      }
    } catch {}
  }

  /**
   * Adjust WAV group mix vs MIDI (0-1)
   */
  setWavGroupMix(gain: number): void {
    try {
      (this.wavPlayerGroup as any).setGroupMixGain?.(gain);
    } catch {}
  }
  
  /**
   * Set WAV player pan
   */
  setWavPlayerPan(playerId: string, pan: number): void {
    this.wavPlayerGroup.setPlayerPan(playerId, pan);
  }
  
  /**
   * Set WAV player mute
   */
  setWavPlayerMute(playerId: string, muted: boolean): void {
    this.wavPlayerGroup.setPlayerMute(playerId, muted);
  }
  
  /**
   * Get all WAV player states
   */
  getWavPlayerStates(): Record<string, { volume: number; pan: number; muted: boolean }> {
    return this.wavPlayerGroup.getPlayerStates();
  }
  
  // Per-MIDI-player controls
  
  /**
   * Set MIDI player volume
   */
  setMidiPlayerVolume(fileId: string, volume: number): void {
    this.midiPlayerGroup.setPlayerVolume(fileId, volume);
  }
  
  /**
   * Set MIDI player pan
   */
  setMidiPlayerPan(fileId: string, pan: number): void {
    this.midiPlayerGroup.setPlayerPan(fileId, pan);
  }
  
  /**
   * Set MIDI player mute
   */
  setMidiPlayerMute(fileId: string, muted: boolean): void {
    this.midiPlayerGroup.setPlayerMute(fileId, muted);
  }
  
  /**
   * Get all MIDI player states
   */
  getMidiPlayerStates(): Record<string, { volume: number; pan: number; muted: boolean }> {
    return this.midiPlayerGroup.getPlayerStates();
  }
  
  // === Compatibility methods with existing system ===
  
  /**
   * Set MIDI manager (compatibility with existing code)
   */
  setMidiManager(midiManager: any): void {
    this.midiPlayerGroup.setMidiManager(midiManager);
  }
  
  /**
   * Return state object (compatibility with existing code)
   */
  getState() {
    const masterState = this.masterClock.state;
    // Get real-time current time when playing
    const currentTime = this.masterClock.getCurrentTime();
    
    return {
      ...masterState,
      currentTime,  // Use real-time current time instead of cached nowTime
      duration: masterState.totalTime,  // Alias for legacy compatibility
      // Include per-player states as well
      wavPlayers: this.getWavPlayerStates(),
      midiPlayers: this.getMidiPlayerStates()
    };
  }
  
  /**
   * Set visual update callback (compatibility with existing code)
   */
  setOnVisualUpdate(callback: (time: number) => void): void {
    this.visualUpdateCallback = callback;
    // Trigger once with current time for immediate UI sync
    try {
      const t = this.masterClock.getCurrentTime();
      this.visualUpdateCallback?.(t);
    } catch {}
  }

  private startVisualUpdateLoop(): void {
    this.stopVisualUpdateLoop();
    
    const update = () => {
      if (this.masterClock.state.isPlaying && this.visualUpdateCallback) {
        try {
          const currentTime = this.masterClock.getCurrentTime();
          const st = this.masterClock.state;
          const effectiveDuration = this.getEffectiveTotalTime();
          const globalRepeatOn = (this.masterClock.state as any).globalRepeat === true || st.loopMode === 'repeat';
          // End-of-track handling when no repeat is enabled: clamp to duration and auto-pause
          if (!globalRepeatOn && effectiveDuration > 0 && currentTime >= effectiveDuration) {
            const finalTime = effectiveDuration;
            // Clamp visual and notify once at exact end
            this.masterClock.state.nowTime = finalTime;
            try { this.visualUpdateCallback(finalTime); } catch {}
            // Pause and set exact position to duration to avoid > duration drift
            this.masterClock.pausePlayback();
            this.masterClock.seekTo(finalTime);
            return; // Do not schedule further frames
          }
          // End-of-track handling when full repeat is ON (independent flag): wrap to start and continue
          const crossedEnd = this._prevTime < effectiveDuration && currentTime >= effectiveDuration;
          if (globalRepeatOn && effectiveDuration > 0 && crossedEnd) {
            if (this._lastRepeatWrapAtGen !== st.generation) {
              this._lastRepeatWrapAtGen = st.generation;
              // Use atomic seek to 0 to restart without layering
              this.seek(0);
              return;
            }
          }
          // Update master clock state with current time
          this.masterClock.state.nowTime = currentTime;
          this.visualUpdateCallback(currentTime);

          // AB-loop handling: jump back to A at (or just after) B using the
          // same robust atomic restart path as seek(). This prevents any
          // overlapping audio because groups are stopped before restart.
          if (st.loopMode === 'ab' && st.markerA !== null && st.markerB !== null) {
            const a = Math.max(0, st.markerA);
            const b = Math.max(a, st.markerB);
            // Trigger only when we cross B (prev < B <= current)
            if (this._prevTime < b && currentTime >= b) {
              // Guard against duplicate triggers within the same generation
              const gen = st.generation;
              if (this._lastLoopJumpAtGen !== gen) {
                this._lastLoopJumpAtGen = gen;
                // Use seek with atomic restart to avoid layering
                this.seek(a);
              }
            }
          }

          this._prevTime = currentTime;
        } catch (error) {
          console.error('[UnifiedAudioController] Visual update error:', error);
        }
      }
      // Opportunistically start any pending WAV tracks that became visible/unmuted
      try {
        if (this.masterClock.state.isPlaying) {
          this.wavPlayerGroup.syncPendingPlayers(this.masterClock.getCurrentTime());
        }
      } catch {}
      
      if (this.masterClock.state.isPlaying) {
        // Use RAF in browsers; fallback to setTimeout in non-DOM test envs
        const raf = typeof requestAnimationFrame !== 'undefined'
          ? requestAnimationFrame
          : ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now?.() ?? Date.now()), 16) as unknown as number);
        this.visualUpdateLoop = raf(update);
      }
    };
    
    const raf = typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now?.() ?? Date.now()), 16) as unknown as number);
    this.visualUpdateLoop = raf(update);
  }

  private stopVisualUpdateLoop(): void {
    if (this.visualUpdateLoop) {
      const caf = typeof cancelAnimationFrame !== 'undefined'
        ? cancelAnimationFrame
        : ((id: number) => clearTimeout(id as unknown as any));
      caf(this.visualUpdateLoop);
      this.visualUpdateLoop = undefined;
    }
  }
  
  /**
   * Resource cleanup
   */
  destroy(): void {
    // console.log('[UnifiedAudioController] Destroying');
    
    // Stop visual updates
    this.stopVisualUpdateLoop();
    
    // Stop playback
    this.masterClock.stopPlayback();
    
    // Destroy player groups
    this.wavPlayerGroup.destroy();
    this.midiPlayerGroup.destroy();
    
    // Remove listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('wr-wav-visibility-changed', this.handleWavVisibilityChange as EventListener);
      window.removeEventListener('wr-wav-mute-changed', this.handleWavMuteChange as EventListener);
    }

    // Reset state
    this.isInitialized = false;
    this.initPromise = null;
    this.visualUpdateCallback = undefined;
    
    // console.log('[UnifiedAudioController] Destroyed');
  }

  /**
   * Public: Align a WAV track to join playback at the exact master time, if appropriate.
   */
  alignWavJoin(fileId: string, lookahead: number = 0.03): void {
    try {
      if (!this.masterClock.state.isPlaying) return;
      // throttle per id
      const now = Tone.now();
      const last = this.lastJoinRequestTs.get(fileId) || 0;
      if (now - last < 0.05) return;
      this.lastJoinRequestTs.set(fileId, now);
      // Use current master time for offset
      const masterTime = this.masterClock.getCurrentTime();
      this.wavPlayerGroup.syncStartIfNeeded(fileId, masterTime, lookahead);
    } catch {}
  }
}
