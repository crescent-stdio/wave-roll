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
      // Perfectly synchronized playback via the master clock
      await this.masterClock.startPlayback(this.masterClock.state.nowTime, 0.1);
      
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
    this.masterClock.seekTo(time);
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
    this.masterClock.setLoopMode(mode, this.masterClock.state.markerA, this.masterClock.state.markerB);
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
          // Update master clock state with current time
          this.masterClock.state.nowTime = currentTime;
          this.visualUpdateCallback(currentTime);
        } catch (error) {
          console.error('[UnifiedAudioController] Visual update error:', error);
        }
      }
      
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
    
    // Reset state
    this.isInitialized = false;
    this.initPromise = null;
    this.visualUpdateCallback = undefined;
    
    // console.log('[UnifiedAudioController] Destroyed');
  }
}
