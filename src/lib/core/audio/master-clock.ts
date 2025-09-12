import * as Tone from 'tone';

/**
 * Master Audio Clock - Single time source for all audio players
 * 
 * This class provides a unified time reference to ensure perfect synchronization
 * between WAV and MIDI players by converting master time to each system's format.
 */
export class AudioMasterClock {
  // Master time state
  private masterTime: number = 0;           // Current playback position (seconds)
  private startTime: number = 0;            // Playback start position
  private isRunning: boolean = false;       // Whether currently playing
  
  // Audio context reference times
  private audioContextStartTime: number = 0;
  private toneTransportStartTime: number = 0;
  
  // Unified state (user requirements)
  public readonly state = {
    nowTime: 0,                             // Current playback position
    totalTime: 0,                          // Total duration
    isPlaying: false,                      // Playing state
    tempo: 120,                            // Tempo (BPM)
    masterVolume: 1.0,                     // Master volume
    
    // Loop control
    loopMode: 'off' as 'off' | 'repeat' | 'ab',
    markerA: null as number | null,        // A marker
    markerB: null as number | null,        // B marker
    
    // Generation token to prevent ghost audio
    generation: 0,
    playbackGeneration: 0,                 // Legacy compatibility
  };
  
  // Registered player groups
  private playerGroups: PlayerGroup[] = [];
  
  constructor() {
    console.log('[AudioMasterClock] Initialized');
  }
  
  /**
   * Get current master time
   */
  getCurrentTime(): number {
    if (!this.isRunning) {
      return this.masterTime;
    }
    
    // Calculate real-time when running; clamp to start when anchor is in the future
    const now = Tone.context.currentTime;
    const audioElapsed = now - this.audioContextStartTime;
    if (audioElapsed < 0) {
      return this.startTime;
    }
    return this.startTime + audioElapsed;
  }
  
  /**
   * Convert master time to AudioContext time
   */
  toAudioContextTime(masterTime: number, lookahead: number = 0): number {
    const currentTime = Tone.context.currentTime;
    
    // Handle invalid audio context time
    if (!isFinite(currentTime) || isNaN(currentTime)) {
      console.warn('[AudioMasterClock] Invalid Tone.context.currentTime:', currentTime);
      return 0;
    }
    
    const currentMasterTime = this.getCurrentTime();
    if (!isFinite(currentMasterTime) || isNaN(currentMasterTime)) {
      console.warn('[AudioMasterClock] Invalid getCurrentTime():', currentMasterTime);
      return currentTime + lookahead;
    }
    
    return currentTime + lookahead + (masterTime - currentMasterTime);
  }
  
  /**
   * Convert master time to Tone.js Transport time
   */
  toToneTransportTime(masterTime: number): number {
    // Transport can be set directly in seconds
    return masterTime;
  }
  
  /**
   * Register player group
   */
  registerPlayerGroup(group: PlayerGroup): void {
    this.playerGroups.push(group);
    console.log('[AudioMasterClock] Registered player group:', group.constructor.name);
  }
  
  /**
   * Start unified playback - synchronize all player groups perfectly
   */
  async startPlayback(fromTime: number = 0, lookahead: number = 0.1): Promise<void> {
    // Increment generation to prevent ghost audio
    this.state.generation += 1;
    this.state.playbackGeneration += 1;
    const currentGeneration = this.state.generation;
    
    // Determine if this is a resume or new playback
    // If fromTime is 0 and we have saved masterTime, use it (resume)
    const isResume = fromTime === 0 && this.masterTime > 0;
    const startPosition = isResume ? this.masterTime : fromTime;
    
    console.log('[AudioMasterClock] Starting synchronized playback', {
      fromTime,
      startPosition,
      isResume,
      savedMasterTime: this.masterTime,
      lookahead,
      generation: currentGeneration
    });
    
    // Set master time
    this.masterTime = startPosition;
    this.startTime = startPosition;
    const safeLookahead = Math.max(0.15, lookahead);
    this.audioContextStartTime = Tone.context.currentTime + safeLookahead;
    this.toneTransportStartTime = this.audioContextStartTime;
    
    // Update state
    this.state.nowTime = startPosition;
    this.state.isPlaying = true;
    
    // Sync Tone.js Transport
    const transport = Tone.getTransport();
    transport.seconds = startPosition;
    
    // Calculate unified start times (absolute anchor + transport offset)
    const audioStartTime = this.toAudioContextTime(startPosition, safeLookahead);
    const toneStartTime = 0; // Transport will be set to startPosition
    
    console.log('[AudioMasterClock] Calculated sync times:', {
      audioStartTime,
      toneStartTime,
      startPosition,
      generation: currentGeneration
    });
    
    // Start all player groups with identical times
    const startPromises = this.playerGroups.map(async (group) => {
      if (this.state.generation !== currentGeneration) {
        console.log('[AudioMasterClock] Generation changed, aborting group start');
        return;
      }
      
      try {
        await group.startSynchronized({
          audioContextTime: audioStartTime,
          toneTransportTime: toneStartTime,
          masterTime: startPosition,
          generation: currentGeneration,
          mode: 'play'
        });
      } catch (error) {
        console.error('[AudioMasterClock] Failed to start group:', group.constructor.name, error);
      }
    });
    
    // Start Transport at the common anchor immediately; avoid waiting for group awaits to prevent anchor drift
    transport.seconds = startPosition;
    transport.start(audioStartTime);
    Promise.allSettled(startPromises).catch(() => {});
    
    // Final state check
    if (this.state.generation === currentGeneration) {
      this.isRunning = true;
      console.log('[AudioMasterClock] Successfully started all groups, generation:', currentGeneration);
    } else {
      console.log('[AudioMasterClock] Playback aborted due to generation change');
    }
  }
  
  /**
   * Stop playback
   */
  stopPlayback(): void {
    console.log('[AudioMasterClock] Stopping playback');
    
    this.isRunning = false;
    this.state.isPlaying = false;
    this.state.generation += 1; // Prevent ghost audio
    
    // Stop Transport
    const transport = Tone.getTransport();
    transport.stop();
    
    // Stop all player groups
    this.playerGroups.forEach(group => {
      try {
        group.stopSynchronized();
      } catch (error) {
        console.error('[AudioMasterClock] Failed to stop group:', group.constructor.name, error);
      }
    });
  }

  pausePlayback(): void {
    console.log('[AudioMasterClock] Pausing playback');
    
    // Save current time before pausing for proper seekbar positioning
    if (this.isRunning) {
      const currentTime = this.getCurrentTime();
      this.masterTime = currentTime;
      this.state.nowTime = currentTime;
      console.log('[AudioMasterClock] Saved playback position:', currentTime);
    }
    
    this.isRunning = false;
    this.state.isPlaying = false;
    
    // Pause Transport (maintains current position)
    const transport = Tone.getTransport();
    transport.pause();
    
    // Pause all player groups (don't reset position)
    this.playerGroups.forEach(group => {
      try {
        group.stopSynchronized(); // This will pause, not reset
      } catch (error) {
        console.error('[AudioMasterClock] Failed to pause group:', group.constructor.name, error);
      }
    });
  }
  
  /**
   * Seek to specific time
   */
  seekTo(time: number): void {
    console.log('[AudioMasterClock] Seeking to:', time);
    
    this.masterTime = time;
    this.state.nowTime = time;
    this.state.generation += 1; // Prevent ghost audio
    const currentGeneration = this.state.generation;
    
    const transport = Tone.getTransport();
    const wasRunning = this.isRunning;
    
    if (!wasRunning) {
      // Paused: just reposition transport and notify groups
      transport.seconds = time;
      console.log('[AudioMasterClock.seek] Paused mode: transport.seconds =', transport.seconds);
      this.playerGroups.forEach(group => {
        try {
          group.seekTo(time);
        } catch (error) {
          console.error('[AudioMasterClock] Failed to seek group:', group.constructor.name, error);
        }
      });
      return;
    }
    
    // Playing: perform atomic re-start at a common absolute anchor
    const lookahead = 0.1; // reduce latency on seek
    this.audioContextStartTime = Tone.context.currentTime + lookahead;
    this.toneTransportStartTime = this.audioContextStartTime;
    // Critical: baseline for getCurrentTime() after seek
    this.startTime = time;
    
    // Stop groups to clear any scheduled events
    this.playerGroups.forEach(group => {
      console.log('[AudioMasterClock.seek] Stopping group before restart:', group.constructor.name);
      try {
        group.stopSynchronized();
      } catch (error) {
        console.error('[AudioMasterClock] Failed to stop group before seek restart:', group.constructor.name, error);
      }
    });
    
    // Reposition transport to target time and restart at the absolute anchor
    transport.stop();
    transport.seconds = time;
    console.log('[AudioMasterClock.seek] Transport positioned to', time, 'anchor', this.audioContextStartTime, 'now', Tone.context.currentTime);
    
    // Schedule re-start for all groups with identical anchor and masterTime
    const startPromises = this.playerGroups.map(async (group) => {
      try {
        await group.startSynchronized({
          audioContextTime: this.audioContextStartTime + 0.002, // 2ms safety so Part events at t=0 are not lost
          toneTransportTime: 0,
          masterTime: time,
          generation: currentGeneration,
          mode: 'seek'
        });
      } catch (error) {
        console.error('[AudioMasterClock] Failed to restart group on seek:', group.constructor.name, error);
      }
    });
    
    // Start Transport at the common anchor immediately; avoid waiting to prevent drift
    transport.start(this.audioContextStartTime);
    this.isRunning = true;
    Promise.allSettled(startPromises).catch(() => {});
    console.log('[AudioMasterClock] Seek restart committed at', this.audioContextStartTime, 'masterTime', time);
  }
  
  /**
   * Set tempo
   */
  setTempo(bpm: number): void {
    console.log('[AudioMasterClock] Setting tempo:', bpm);
    
    this.state.tempo = bpm;
    this.state.generation += 1; // Prevent ghost audio
    
    // Set Transport BPM
    const transport = Tone.getTransport();
    transport.bpm.value = bpm;
    
    // Notify all player groups of tempo change
    this.playerGroups.forEach(group => {
      try {
        group.setTempo(bpm);
      } catch (error) {
        console.error('[AudioMasterClock] Failed to set tempo for group:', group.constructor.name, error);
      }
    });
  }
  
  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    this.state.masterVolume = Math.max(0, Math.min(1, volume));
    
    // Notify all player groups of master volume change
    this.playerGroups.forEach(group => {
      try {
        group.setMasterVolume(this.state.masterVolume);
      } catch (error) {
        console.error('[AudioMasterClock] Failed to set master volume for group:', group.constructor.name, error);
      }
    });
  }
  
  /**
   * Set loop mode
   */
  setLoopMode(mode: 'off' | 'repeat' | 'ab', markerA?: number, markerB?: number): void {
    this.state.loopMode = mode;
    if (markerA !== undefined) this.state.markerA = markerA;
    if (markerB !== undefined) this.state.markerB = markerB;
    
    // Notify all player groups of loop settings
    this.playerGroups.forEach(group => {
      try {
        group.setLoop(mode, this.state.markerA, this.state.markerB);
      } catch (error) {
        console.error('[AudioMasterClock] Failed to set loop for group:', group.constructor.name, error);
      }
    });
  }
}

/**
 * Interface that player groups must implement
 */
export interface PlayerGroup {
  startSynchronized(syncInfo: SynchronizationInfo): Promise<void>;
  stopSynchronized(): void;
  seekTo(time: number): void;
  setTempo(bpm: number): void;
  setMasterVolume(volume: number): void;
  setLoop(mode: 'off' | 'repeat' | 'ab', markerA: number | null, markerB: number | null): void;
}

/**
 * Synchronization info
 */
export interface SynchronizationInfo {
  audioContextTime: number;    // Web Audio API start time
  toneTransportTime: number;   // Tone.js Transport time
  masterTime: number;          // Master clock time
  generation: number;          // Token to prevent ghost audio
  mode?: 'play' | 'seek';      // Start context
}
