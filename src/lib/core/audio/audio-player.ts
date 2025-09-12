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
  public visualUpdateCallback: ((time: number) => void) | null = null;
  
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
    // Convert rate to tempo for unified controller
    const newTempo = this.originalTempo * rate;
    this.setTempo(newTempo);
  }
  
  /**
   * Set loop points
   */
  public setLoopPoints(start: number, end: number): void {
    console.log('[AudioPlayer] V2 setting loop points:', { start, end });
    this.unifiedController.setABLoop(start, end);
  }
  
  /**
   * Toggle repeat mode
   */
  public toggleRepeat(): void {
    const currentMode = this.unifiedController.loopMode;
    const newMode = currentMode === 'repeat' ? 'off' : 'repeat';
    this.unifiedController.loopMode = newMode;
    console.log('[AudioPlayer] V2 toggled repeat mode to:', newMode);
  }
  
  /**
   * Set pan
   */
  public setPan(pan: number): void {
    console.log('[AudioPlayer] V2 setting pan:', pan);
    // Apply to all players - this is a simplified implementation
    // In a real implementation, you might want to set pan per group or player
  }
  
  /**
   * Set file mute
   */
  public setFileMute(fileId: string, muted: boolean): void {
    console.log('[AudioPlayer] V2 setting file mute:', { fileId, muted });
    
    // Try both WAV and MIDI players
    try {
      this.unifiedController.setWavPlayerMute(fileId, muted);
    } catch (e) {
      // If WAV fails, try MIDI
      try {
        this.unifiedController.setMidiPlayerMute(fileId, muted);
      } catch (e2) {
        console.warn('[AudioPlayer] V2 failed to set mute for:', fileId);
      }
    }
  }
  
  /**
   * Set file pan
   */
  public setFilePan(fileId: string, pan: number): void {
    console.log('[AudioPlayer] V2 setting file pan:', { fileId, pan });
    
    try {
      this.unifiedController.setWavPlayerPan(fileId, pan);
    } catch (e) {
      try {
        this.unifiedController.setMidiPlayerPan(fileId, pan);
      } catch (e2) {
        console.warn('[AudioPlayer] V2 failed to set pan for:', fileId);
      }
    }
  }
  
  /**
   * Set file volume
   */
  public setFileVolume(fileId: string, volume: number): void {
    console.log('[AudioPlayer] V2 setting file volume:', { fileId, volume });
    
    try {
      this.unifiedController.setWavPlayerVolume(fileId, volume);
    } catch (e) {
      try {
        this.unifiedController.setMidiPlayerVolume(fileId, volume);
      } catch (e2) {
        console.warn('[AudioPlayer] V2 failed to set volume for:', fileId);
      }
    }
  }
  
  /**
   * Set WAV volume
   */
  public setWavVolume(playerId: string, volume: number): void {
    console.log('[AudioPlayer] V2 setting WAV volume:', { playerId, volume });
    this.unifiedController.setWavPlayerVolume(playerId, volume);
  }
  
  /**
   * Get current state
   */
  public getState(): any {
    return this.unifiedController.getState();
  }
  
  /**
   * Set visual update callback
   */
  public setOnVisualUpdate(callback: (time: number) => void): void {
    console.log('[AudioPlayer] V2 setting visual update callback');
    this.visualUpdateCallback = callback;
    
    // Set the callback on UnifiedAudioController
    this.unifiedController.setOnVisualUpdate((time: number) => {
      // console.log('[AudioPlayer] Visual update called with time:', time);
      if (this.visualUpdateCallback) {
        this.visualUpdateCallback(time);
      }
    });
  }    // console.log('[AudioPlayer] V2 setting visual update callback');\n    this.visualUpdateCallback = callback;\n    this.unifiedController.setOnVisualUpdate(callback);\n  }
  
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
export type AudioPlayerContainer = AudioPlayer;

// Legacy compatibility exports
export type AudioPlayerContainer = AudioPlayer;
export { AudioPlayer as AudioPlayerContainer };
