/**
 * AudioPlayer V2 - Wrapper around UnifiedAudioController
 * 
 * This class maintains compatibility with the existing AudioPlayer interface
 * while using the new synchronized UnifiedAudioController internally.
 */

import { UnifiedAudioController } from './unified-audio-controller';
import * as Tone from 'tone';
export class AudioPlayer {
  // Internal unified controller (the new system)
  private unifiedController: UnifiedAudioController;
  
  // Compatibility properties (for existing code)
  public notes: any[] = [];
  public options: any;
  public pianoRoll: any;
  public midiManager: any;
  public state: any;
  public originalTempo: number = 120;
  public isInitialized: boolean = false;
  public initPromise: Promise<void> | null = null;
  
  // Legacy managers (for compatibility - delegate to unified controller)
  public samplerManager: any;
  public wavPlayerManager: any;
  public transportSyncManager: any;
  public loopManager: any;
  
  // Controllers (for compatibility)
  public playbackController: any;
  public audioSettingsController: any;
  public fileAudioController: any;
  public autoPauseController: any;
  
  // Visual update callback
  public visualUpdateCallback: ((update: any) => void) | null = null;
  
  // Operation state
  public operationState: any = {
    lastOperation: 'none',
    lastOperationTime: 0,
    isOperationLocked: false,
    currentGeneration: 0
  };
  
  public isHandlingLoop: boolean = false;
  
  constructor(notes: any[], options: any, pianoRoll: any) {
    console.log('[AudioPlayer] Initializing V2 with unified controller');
    console.log('[AudioPlayer] Constructor received notes:', notes ? notes.length : 0, 'notes');
    
    this.notes = notes;
    this.options = options;
    this.pianoRoll = pianoRoll;
    
    // Create unified controller (the new system)
    this.unifiedController = new UnifiedAudioController();
    
    // Set up MIDI data
    if (this.notes && this.notes.length > 0) {
      console.log('[AudioPlayer] Setting MIDI manager with', this.notes.length, 'notes');
      this.unifiedController.setMidiManager({ notes: this.notes });
      console.log('[AudioPlayer] MIDI manager set successfully');
    } else {
      console.log('[AudioPlayer] No notes provided - MIDI manager not initialized');
    }
    
    // Create compatibility state proxy
    this.state = this.createStateProxy();
    
    // Initialize legacy managers as proxies (for compatibility)
    this.createLegacyManagers();
    
    console.log('[AudioPlayer] V2 initialized with unified controller');
  }
  
  /**
   * Create state proxy for compatibility
   */
  private createStateProxy(): any {
    const self = this;
    return new Proxy({}, {
      get(target, prop: string) {
        const unifiedState = self.unifiedController.getState();
        
        // Map unified state properties to legacy names
        switch (prop) {
          case 'currentTime':
            return unifiedState.nowTime;
          case 'isPlaying':
            return unifiedState.isPlaying;
          case 'tempo':
            return unifiedState.tempo;
          case 'volume':
          case 'masterVolume':
            return unifiedState.masterVolume;
          case 'duration':
          case 'totalTime':
            return unifiedState.totalTime;
          case 'nowTime':
            return unifiedState.nowTime;
          default:
            return (unifiedState as any)[prop];
        }
      },
      
      set(target, prop: string, value: any) {
        // Map legacy property sets to unified controller
        switch (prop) {
          case 'currentTime':
            self.unifiedController.nowTime = value;
            break;
          case 'tempo':
            self.unifiedController.tempo = value;
            break;
          case 'volume':
          case 'masterVolume':
            self.unifiedController.masterVolume = value;
            break;
          case 'duration':
          case 'totalTime':
            self.unifiedController.totalTime = value;
            break;
          case 'nowTime':
            self.unifiedController.nowTime = value;
            break;
          default:
            // For other properties, store in target
            (target as any)[prop] = value;
            break;
        }
        return true;
      }
    });
  }
  
  /**
   * Create legacy manager proxies for compatibility
   */
  private createLegacyManagers(): void {
    // These are just placeholder objects for compatibility
    // Actual functionality is handled by unified controller
    this.samplerManager = {
      initialize: () => Promise.resolve(),
      destroy: () => {},
      setFileMute: (fileId: string, muted: boolean) => this.unifiedController.setMidiPlayerMute(fileId, muted),
      setFileVolume: (fileId: string, volume: number) => this.unifiedController.setMidiPlayerVolume(fileId, volume),
      setFilePan: (fileId: string, pan: number) => this.unifiedController.setMidiPlayerPan(fileId, pan),
    };
    
    this.wavPlayerManager = {
      setTransportSyncManager: () => {},
      refreshAudioPlayers: () => {},
      isAudioActive: () => true,
      setFileMute: (playerId: string, muted: boolean) => this.unifiedController.setWavPlayerMute(playerId, muted),
      setFileVolume: (playerId: string, volume: number) => this.unifiedController.setWavPlayerVolume(playerId, volume),
      setFilePan: (playerId: string, pan: number) => this.unifiedController.setWavPlayerPan(playerId, pan),
    };
    
    this.transportSyncManager = {
      startSyncScheduler: () => {},
      stopSyncScheduler: () => {},
      updateSeekTimestamp: () => {},
      enableSyncInspector: () => {},
      disableSyncInspector: () => {},
    };
    
    this.loopManager = {
      loopStartVisual: 0,
      loopEndVisual: 0,
      getPartOffset: () => 0,
    };
    
    // Controllers
    this.playbackController = {
      play: () => this.play(),
      pause: () => this.pause(),
      seek: (time: number) => this.seek(time),
    };
    
    this.audioSettingsController = {};
    this.fileAudioController = {};
    this.autoPauseController = {};
  }
  
  /**
   * Initialize - delegate to unified controller
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
      console.log('[AudioPlayer] V2 initializing unified controller');
      
      await this.unifiedController.initialize();
      
      this.isInitialized = true;
      console.log('[AudioPlayer] V2 initialization completed');
      
    } catch (error) {
      console.error('[AudioPlayer] V2 initialization failed:', error);
      throw error;
    }
  }
  
  // === Public API Methods (compatibility with existing AudioPlayer) ===
  
  /**
   * Start playbook
   */
  public async play(): Promise<void> {
    await this.initialize();
    
    try {
      // Avoid unintended rewind: only if clearly past end
      try {
        const st = this.unifiedController.getState();
        const duration = Number.isFinite(st.totalTime) ? st.totalTime : st.duration;
        const position = Number.isFinite(st.nowTime) ? st.nowTime : 0;
        const isLoopOff = !st.loopMode || st.loopMode === 'off';
        const clearlyPastEnd = duration && position > duration + 0.05;
        if (isLoopOff && clearlyPastEnd) {
          this.unifiedController.seek(0);
        }
      } catch {}

      await this.unifiedController.play();
      // console.log('[AudioPlayer] V2 playback started');
    } catch (error) {
      console.error('[AudioPlayer] V2 failed to start playback:', error);
      throw error;
    }
  }
  
  /**
   * Pause playback
   */
  public pause(): void {
    console.log('[AudioPlayer] V2 pausing playback');
    this.unifiedController.pause();
  }
  
  /**
   * Restart playback
   */
  public restart(): void {
    console.log('[AudioPlayer] V2 restarting playback');
    this.unifiedController.stop();
  }
  
  /**
   * Seek to specific time
   */
  public seek(time: number): void {
    console.log('[AudioPlayer] V2 seeking to:', time);
    this.unifiedController.seek(time);
  }
  
  /**
   * Set tempo
   */
  public setTempo(bpm: number): void {
    console.log('[AudioPlayer] V2 setting tempo:', bpm);
    this.unifiedController.tempo = bpm;
  }
  
  /**
   * Set master volume
   */
  public setVolume(volume: number): void {
    console.log('[AudioPlayer] V2 setting volume:', volume);
    this.unifiedController.masterVolume = volume;
  }
  
  /**
   * Set playback rate
   */
  public setPlaybackRate(rate: number): void {
    // Interpret input as PERCENT (10–200, 100=normal)
    const clampedPercent = Math.max(10, Math.min(200, rate));
    const factor = clampedPercent / 100;
    const st = this.unifiedController.getState();
    const base = Number.isFinite(st.originalTempo) && st.originalTempo > 0 ? st.originalTempo : this.originalTempo;
    const newTempo = base * factor;
    this.setTempo(newTempo);
  }

  /**
   * Update baseline/original tempo used as 100% reference.
   */
  public setOriginalTempo(bpm: number): void {
    try {
      this.unifiedController.setOriginalTempo(bpm);
    } catch {}
  }
  
  /**
   * Set loop points (A-B) with optional position preservation.
   * - Passing null,null clears loop and (optionally) preserves position.
   * - Passing null,B sets [0,B) as loop window.
   * - Passing A,null stores A only (does NOT activate loop by policy).
   * - Passing A,B activates AB loop; when preservePosition=false, jumps to A.
   */
  public setLoopPoints(start: number | null, end: number | null, preservePosition: boolean = false): void {
    try {
      const st = this.unifiedController.getState();
      const total = Number.isFinite(st.totalTime) && st.totalTime > 0 ? st.totalTime : (Number.isFinite(st.duration) ? st.duration : 0);
      const current = Number.isFinite(st.nowTime) ? st.nowTime : 0;

      // Clear loop entirely
      if (start === null && end === null) {
        this.unifiedController.markerA = null;
        this.unifiedController.markerB = null;
        this.unifiedController.loopMode = 'off';
        if (!preservePosition) {
          this.seek(0);
        }
        return;
      }

      // Normalize A>B ordering when both provided
      if (start !== null && end !== null && start > end) {
        const tmp = start; start = end; end = tmp;
      }

      // B-only: treat A = 0
      if (start === null && end !== null) {
        const clampedEnd = total > 0 ? Math.max(0, Math.min(end, total)) : Math.max(0, end);
        this.unifiedController.markerA = 0;
        this.unifiedController.markerB = clampedEnd;
        this.unifiedController.loopMode = 'ab';

        if (preservePosition) {
          const within = current >= 0 && current <= clampedEnd;
          if (!within) {
            this.seek(0);
          }
        } else {
          this.seek(0);
        }
        return;
      }

      // A-only: do not activate loop, just store A
      if (start !== null && end === null) {
        // Policy: A-only should NOT activate a loop window
        this.unifiedController.markerA = Math.max(0, start);
        // Keep markerB as-is; loopMode unchanged
        return;
      }

      // A & B provided: activate AB loop
      if (start !== null && end !== null) {
        const clampedStart = Math.max(0, start);
        const clampedEnd = total > 0 ? Math.max(0, Math.min(end, total)) : Math.max(0, end);
        if (clampedStart >= clampedEnd) {
          console.warn('[AudioPlayer] Ignoring invalid loop points (start >= end):', { start, end });
          return;
        }
        this.unifiedController.markerA = clampedStart;
        this.unifiedController.markerB = clampedEnd;
        this.unifiedController.loopMode = 'ab';

        if (preservePosition) {
          const within = current >= clampedStart && current <= clampedEnd;
          if (!within) {
            this.seek(clampedStart);
          }
        } else {
          this.seek(clampedStart);
        }
        return;
      }
    } catch (e) {
      console.error('[AudioPlayer] setLoopPoints failed:', e);
    }
  }
  
  /**
   * Toggle or explicitly set repeat mode.
   * - When enabled is provided: true → on, false → off.
   * - Without argument: toggle current state.
   * If AB markers are present and enabled=true, subsequent setLoopPoints will switch to 'ab'.
   */
  public toggleRepeat(enabled?: boolean): void {
    try {
      if (typeof enabled === 'boolean') {
        // Use independent global repeat flag; leave loopMode for AB loop only
        (this.unifiedController as any).isGlobalRepeat = !!enabled;
        return;
      }

      // No argument: toggle
      const cur = (this.unifiedController as any).isGlobalRepeat === true;
      (this.unifiedController as any).isGlobalRepeat = !cur;
    } catch (e) {
      console.error('[AudioPlayer] toggleRepeat failed:', e);
    }
  }
  
  // Global pan control removed in v2. Use setFilePan for per-file control.
  
  /**
   * Set file mute
   */
  public setFileMute(fileId: string, muted: boolean): void {
    console.log('[AudioPlayer] V2 setting file mute:', { fileId, muted });

    if (this.isWavFileId(fileId)) {
      this.unifiedController.setWavPlayerMute(fileId, muted);
    } else {
      this.unifiedController.setMidiPlayerMute(fileId, muted);
    }
  }
  
  /**
   * Set file pan
   */
  public setFilePan(fileId: string, pan: number): void {
    console.log('[AudioPlayer] V2 setting file pan:', { fileId, pan });

    if (this.isWavFileId(fileId)) {
      this.unifiedController.setWavPlayerPan(fileId, pan);
    } else {
      this.unifiedController.setMidiPlayerPan(fileId, pan);
    }
  }
  
  /**
   * Set file volume
   */
  public setFileVolume(fileId: string, volume: number): void {
    console.log('[AudioPlayer] V2 setting file volume:', { fileId, volume });

    if (this.isWavFileId(fileId)) {
      this.unifiedController.setWavPlayerVolume(fileId, volume);
    } else {
      this.unifiedController.setMidiPlayerVolume(fileId, volume);
    }
  }
  
  /**
   * Set WAV volume
   */
  public setWavVolume(playerId: string, volume: number): void {
    console.log('[AudioPlayer] V2 setting WAV volume:', { playerId, volume });
    this.unifiedController.setWavPlayerVolume(playerId, volume);
  }

  /** Determine if the given id belongs to WAV registry */
  private isWavFileId(fileId: string): boolean {
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ id: string; type?: string }> } })._waveRollAudio;
      const items = api?.getFiles?.() || [];
      // Check if the file exists in WAV registry and verify type if available
      const wavItem = items.find((it) => it.id === fileId);
      if (wavItem) {
        // If type field exists, use it for accurate detection
        if (wavItem.type) {
          return wavItem.type === 'audio' || wavItem.type === 'wav';
        }
        // If no type field, assume it's WAV since it's in the registry
        return true;
      }
      // Fallback: check fileId pattern for common audio extensions
      return fileId.includes('audio') || fileId.includes('.mp3') || fileId.includes('.wav');
    } catch {
      // Error fallback: check fileId pattern
      return fileId.includes('audio') || fileId.includes('.mp3') || fileId.includes('.wav');
    }
  }
  
  /**
   * Get current state
   */
  public getState(): any {
    const st = this.unifiedController.getState();
    // Back-compat: expose isRepeating derived from loopMode
    const isRepeating = st.loopMode && st.loopMode !== 'off';
    return { ...st, isRepeating };
  }
  
  /**
   * Set visual update callback
   */
  public setOnVisualUpdate(callback: (update: any) => void): void {
    console.log('[AudioPlayer] V2 current time:', this.unifiedController.getCurrentTime());
    console.log('[AudioPlayer] V2 setting visual update callback');
    this.visualUpdateCallback = callback;
    
    // Set the callback on UnifiedAudioController
    this.unifiedController.setOnVisualUpdate((payload: any) => {
      if (!this.visualUpdateCallback) return;
      try {
        // Support legacy numeric payloads and new object payloads
        if (typeof payload === 'number') {
          const state = this.unifiedController.getState();
          this.visualUpdateCallback({
            currentTime: payload,
            duration: state.duration,
            isPlaying: state.isPlaying,
          });
        } else {
          this.visualUpdateCallback(payload);
        }
      } catch (e) {
        console.error('[AudioPlayer] Visual update callback error:', e);
      }
    });
  }
  
  /**
   * Refresh audio players (compatibility)
   */
  public refreshAudioPlayers(): void {
    console.log('[AudioPlayer] V2 refreshing audio players (compatibility)');
    // The unified controller handles this automatically
  }
  
  // === Legacy compatibility methods ===
  
  public cleanup(): void {
    console.log('[AudioPlayer] V2 cleanup (compatibility)');
  }
  
  public setupTransportCallbacks(): void {
    console.log('[AudioPlayer] V2 setup transport callbacks (compatibility)');
  }
  
  public removeTransportCallbacks(): void {
    console.log('[AudioPlayer] V2 remove transport callbacks (compatibility)');
  }
  
  public updateAllUI(): void {
    console.log('[AudioPlayer] V2 update all UI (compatibility)');
  }
  
  public handleFileSettingsChange(): void {
    console.log('[AudioPlayer] V2 handle file settings change (compatibility)');
  }
  
  public handlePlaybackEnd(): void {
    console.log('[AudioPlayer] V2 handle playback end (compatibility)');
  }
  
  public maybeAutoPauseIfSilent(): void {
    console.log('[AudioPlayer] V2 maybe auto pause if silent (compatibility)');
  }
  
  // Transport event handlers (compatibility)
  public handleTransportStop = () => {
    console.log('[AudioPlayer] V2 transport stop');
  };
  
  public handleTransportPause = () => {
    console.log('[AudioPlayer] V2 transport pause');
  };
  
  public handleTransportLoop = () => {
    console.log('[AudioPlayer] V2 transport loop');
  };
  
  /**
   * Destroy and cleanup
   */
  public destroy(): void {
    console.log('[AudioPlayer] V2 destroying');
    
    this.unifiedController.destroy();
    
    this.isInitialized = false;
    this.initPromise = null;
    this.visualUpdateCallback = null;
    
    console.log('[AudioPlayer] V2 destroyed');
  }
}

/**
 * Create a new audio player instance
 */
export function createAudioPlayer(notes: any[], options: any, pianoRoll: any): AudioPlayer {
  return new AudioPlayer(notes, options, pianoRoll);
}

// Legacy compatibility exports
export { AudioPlayer as AudioPlayerContainer };
