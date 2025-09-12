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
  gate: Tone.Gain;
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
  
  // Master volume (controlled from above)
  private masterVolume: number = 1.0;
  
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
      console.log('[WavPlayerGroup] Audio API not available');
      return;
    }
    
    const items = api.getFiles() as AudioFileInfo[];
    console.log('[WavPlayerGroup] Found', items.length, 'audio files in registry:', items.map(i => i.displayName || i.id));
    // Prepare audio players for all registered files
    
    for (const item of items) {
      if (!this.audioPlayers.has(item.id)) {
        console.log('[WavPlayerGroup] Creating player for:', item.displayName || item.id);
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
      
      // Create player and gain nodes
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
      
      const gate = new Tone.Gain(1);
      
      // Connection: Player → Gate → Destination
      player.connect(gate);
      gate.toDestination();
      
      // Create entry
      const entry: AudioPlayerEntry = {
        player,
        gate,
        isStarted: false,
        muted: item.isMuted || false,
        startToken: 0,
        volume: 1.0,
        pan: 0.0,
      };
      
      this.audioPlayers.set(item.id, entry);
      
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
    console.log('[WavPlayerGroup] Starting synchronized playback', syncInfo);
    
    // Setup audio players first
    try {
      await this.setupAudioPlayersFromRegistry({});
      console.log('[WavPlayerGroup] Audio players setup completed, players count:', this.audioPlayers.size);
    } catch (error) {
      console.error('[WavPlayerGroup] Setup failed:', error);
      return;
    }
    
    // Wait for buffers to be ready
    if (this.bufferLoadPromise) {
      try {
        await this.bufferLoadPromise;
        // console.log('[WavPlayerGroup] Buffer loading completed');
      } catch (error) {
        console.error('[WavPlayerGroup] Buffer loading failed:', error);
      }
    }
    
    // Check if audio API is available
    const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => AudioFileInfo[] } })._waveRollAudio;
    if (!api?.getFiles) {
      console.warn('[WavPlayerGroup] Audio API not available');
      return;
    }
    
    const items = api.getFiles() as AudioFileInfo[];
    console.log('[WavPlayerGroup] Found', items.length, 'audio files to process for sync start');
    
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
        console.log('[WavPlayerGroup] Skipping invisible item:', item.displayName || item.id);
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
        console.warn('[WavPlayerGroup] Buffer not loaded for:', item.id, 'buffer state:', entry.player.buffer);
        continue;
      }
      
      try {
        // Stop existing playback
        if (entry.isStarted) {
          entry.player.stop();
          entry.isStarted = false;
        }
        
        // Calculate volume considering both global mute states and individual mute
        const isMuted = item.isMuted || entry.muted;
        const finalVolume = this.masterVolume * entry.volume * (isMuted ? 0 : 1);
        entry.gate.gain.value = finalVolume;
        
        // Start precisely with master clock's AudioContext time - always start for timing sync
        entry.player.start(syncInfo.audioContextTime, syncInfo.masterTime);
        entry.isStarted = true;
        startedCount++;
        
        console.log('[WavPlayerGroup] Started WAV', item.displayName || item.id, 'at audio time', syncInfo.audioContextTime, 'offset', syncInfo.masterTime, 'volume', finalVolume, 'muted:', isMuted);
        
      } catch (error) {
        console.error('[WavPlayerGroup] Failed to start', item.id, ':', error);
      }
    }
    
    console.log('[WavPlayerGroup] Successfully started', startedCount, 'of', items.length, 'audio files');
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
    // WAV players may need restart as real-time seek is difficult
    this.stopSynchronized();
  }
  
  /**
   * PlayerGroup interface implementation: Set tempo
   */
  setTempo(bpm: number): void {
    // WAV players handle tempo change with playbackRate
    const rate = bpm / 120; // Based on 120 BPM
    
    for (const [id, entry] of this.audioPlayers) {
      try {
        entry.player.playbackRate = rate;
      } catch (error) {
        console.error('[WavPlayerGroup] Failed to set tempo for', id, ':', error);
      }
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
        entry.gate.gain.value = this.masterVolume * entry.volume * (entry.muted ? 0 : 1);
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
      console.warn('[WavPlayerGroup] Player not found:', playerId);
      return;
    }
    
    entry.volume = Math.max(0, Math.min(1, volume));
    entry.gate.gain.value = this.masterVolume * entry.volume * (entry.muted ? 0 : 1);
    
    // no-op log
  }
  
  /**
   * Set individual WAV player pan
   */
  setPlayerPan(playerId: string, pan: number): void {
    const entry = this.audioPlayers.get(playerId);
    if (!entry) {
      console.warn('[WavPlayerGroup] Player not found:', playerId);
      return;
    }
    
    entry.pan = Math.max(-1, Math.min(1, pan));
    // Implement pan node here if needed
    
    // no-op log
  }
  
  /**
   * Set individual WAV player mute
   */
  setPlayerMute(playerId: string, muted: boolean): void {
    const entry = this.audioPlayers.get(playerId);
    if (!entry) {
      console.warn('[WavPlayerGroup] Player not found:', playerId);
      return;
    }
    
    entry.muted = muted;
    entry.gate.gain.value = this.masterVolume * entry.volume * (entry.muted ? 0 : 1);
    
    // no-op log
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
        entry.gate.dispose();
      } catch (error) {
        console.error('[WavPlayerGroup] Failed to dispose', id, ':', error);
      }
    }
    
    this.audioPlayers.clear();
  }
}
