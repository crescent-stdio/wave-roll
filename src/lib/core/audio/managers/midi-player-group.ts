import * as Tone from 'tone';
import type { PlayerGroup, SynchronizationInfo } from '../master-clock';
import { DEFAULT_SAMPLE_MAP } from '../player-types';

/**
 * MIDI note information
 */
interface MidiNote {
  fileId?: string;
  time: number;
  duration: number;
  pitch: number | string;  // Support both numeric MIDI note and string note name
  velocity: number;
  // Support NoteData fields as well
  name?: string;  // Scientific pitch notation (e.g., "C4", "A#3")
  midi?: number;  // MIDI note number (0-127)
}

/**
 * MIDI player information
 */
interface MidiPlayerInfo {
  fileId: string;
  sampler: Tone.Sampler;  // Changed from PolySynth to Sampler for real piano sound
  gate: Tone.Gain;
  panner: Tone.Panner;
  
  // Individual player control state
  volume: number;
  pan: number;
  muted: boolean;
}

/**
 * MIDI Player Group - Synchronized with AudioMasterClock
 * 
 * User requirements: Individual control of volume, pan, mute for each MIDI player
 */
export class MidiPlayerGroup implements PlayerGroup {
  private static DEBUG = false;
  
  private players = new Map<string, MidiPlayerInfo>();
  private part: Tone.Part | null = null;
  private notes: MidiNote[] = [];
  private applyZeroEps: boolean = false;
  private tempoScale: number = 1; // 1.0 = normal speed; 2.0 = 2x faster
  private originalTempoBase: number = 120;
  private lastStartGen: number | null = null;
  
  // Master volume (controlled from above)
  private masterVolume: number = 1.0;
  
  // MIDI-related references
  private midiManager: any = null;
  // Error tracking and statistics
  private errorStats = {
    totalNoteAttempts: 0,
    failedNotes: 0,
    invalidDataErrors: 0,
    synthErrors: 0,
    lastResetTime: Date.now()
  };
  
  constructor() {
    // console.log('[MidiPlayerGroup] Initialized');
  }
  
  /**
   * Set MIDI manager (compatibility with existing code)
   */
  setMidiManager(midiManager: any): void {
    // console.log('[MidiPlayerGroup] Setting MIDI manager:', midiManager);
    this.midiManager = midiManager;
    if (midiManager?.notes) {
      this.notes = midiManager.notes;
      // console.log('[MidiPlayerGroup] Set notes from MIDI manager:', this.notes.length);
      // console.log('[MidiPlayerGroup] Sample notes:', this.notes.slice(0, 3).map(note => ({
      //   time: note.time,
      //   pitch: note.pitch,
      //   duration: note.duration,
      //   velocity: note.velocity,
      //   fileId: note.fileId
      // })));
    } else {
      // console.log('[MidiPlayerGroup] No notes found in MIDI manager');
    }
  }
  
  /**
   * Initialize MIDI samplers
   */
  async initialize(): Promise<void> {
    // console.log('[MidiPlayerGroup] Initializing samplers');
    
    if (!this.notes.length) {
      console.warn('[MidiPlayerGroup] No notes available');
      return;
    }
    
    // Create unique sampler for each file ID
    const fileIds = new Set(this.notes.map(note => note.fileId).filter(Boolean));
    // console.log('[MidiPlayerGroup] Found file IDs:', Array.from(fileIds));
    
    // Create all samplers in parallel for faster loading
    const createPromises = Array.from(fileIds).map(async (fileId) => {
      if (fileId && !this.players.has(fileId)) {
        return this.createSamplerForFile(fileId);
      }
    }).filter(Boolean);
    
    if (createPromises.length > 0) {
      // console.log('[MidiPlayerGroup] Loading', createPromises.length, 'samplers...');
      await Promise.all(createPromises);
      // console.log('[MidiPlayerGroup] All samplers loaded successfully');
    } else {
      // console.log('[MidiPlayerGroup] No new samplers to create');
    }
  }

  /**
   * Wait until all MIDI samplers are ready.
   */
  async waitUntilReady(): Promise<void> {
    // If players are already created, assume ready
    if (this.players.size > 0) return;
    // Otherwise trigger initialize (which awaits sampler loads)
    await this.initialize();
  }
  
  /**
   * Create sampler for file
   */
  private async createSamplerForFile(fileId: string): Promise<void> {
    try {
      // console.log('[MidiPlayerGroup] Starting sampler creation for file:', fileId);
      
      // Create promise that resolves when sampler is loaded
      const samplerLoadPromise = new Promise<Tone.Sampler>((resolve, reject) => {
        const sampler = new Tone.Sampler({
          urls: DEFAULT_SAMPLE_MAP,
          baseUrl: "https://tonejs.github.io/audio/salamander/",
          onload: () => {
            // console.log('[MidiPlayerGroup] Sampler loaded for file:', fileId);
            resolve(sampler);
          },
          onerror: (error: Error) => {
            console.error('[MidiPlayerGroup] Failed to load sampler for', fileId, ':', error);
            reject(error);
          }
        });
      });
      
      // Wait for sampler to load
      const sampler = await samplerLoadPromise;
      
      const gate = new Tone.Gain(1);
      const panner = new Tone.Panner(0);
      
      // Audio chain: Sampler → Gate → Panner → Destination
      sampler.connect(gate);
      gate.connect(panner);
      panner.toDestination();
      
      const playerInfo: MidiPlayerInfo = {
        fileId,
        sampler,
        gate,
        panner,
        volume: 1.0,
        pan: 0.0,
        muted: false
      };
      
      this.players.set(fileId, playerInfo);
      // console.log('[MidiPlayerGroup] Successfully created and loaded sampler for file:', fileId);
      
    } catch (error) {
      console.error('[MidiPlayerGroup] Failed to create sampler for', fileId, ':', error);
      throw error; // Re-throw so initialize() can handle the error
    }
  }
  
  /**
   * Create MIDI Part
   */
  /**
   * Validate MIDI note data
   */
  private validateMidiNote(note: MidiNote): boolean {
    // Check if required properties exist and are valid numbers
    if (typeof note.time !== 'number' || !isFinite(note.time) || note.time < 0) {
      return false;
    }
    
    if (typeof note.duration !== 'number' || !isFinite(note.duration) || note.duration <= 0) {
      return false;
    }
    
    // Validate pitch - can be either numeric MIDI note (0-127) or string note name
    if (typeof note.pitch === 'number') {
      if (!isFinite(note.pitch) || note.pitch < 0 || note.pitch > 127) {
        return false;
      }
    } else if (typeof note.pitch === 'string') {
      // Validate note name format (e.g., "C4", "C#4", "Bb3")
      if (!this.isValidNoteName(note.pitch)) {
        return false;
      }
    } else {
      return false; // pitch must be number or string
    }
    
    if (typeof note.velocity !== 'number' || !isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) {
      return false;
    }
    
    return true;
  }

  /**
   * Validate note name format (supports standard notation like "C4", "C#4", "Bb3")
   */
  private isValidNoteName(noteName: string): boolean {
    if (!noteName || typeof noteName !== 'string') return false;
    
    // Regular expression for standard note names
    // Supports: C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B
    // With optional octave numbers from -1 to 9 (octave is now optional)
    const noteRegex = /^[A-G][#b]?(?:-?[0-9])?$/;
    
    return noteRegex.test(noteName);
  }

  /**
   * Normalize pitch input to consistent note name format
   * Handles both numeric MIDI notes (0-127) and string note names ('C#4', 'Db3', etc.)
   */
  private normalizeNoteName(pitch: number | string): string {
    if (typeof pitch === 'string') {
      // If it's already a string note name, validate and normalize it
      if (this.isValidNoteName(pitch)) {
        // Check if octave number is missing (note names like 'G', 'C#', 'Bb')
        const hasOctave = /[0-9]/.test(pitch);
        if (!hasOctave) {
          // Log warning instead of silently adding octave 4
          console.warn(`[MidiPlayerGroup] Note missing octave information: ${pitch}. Original MIDI data may have been corrupted.`);
          return 'C4'; // Return safe default instead of guessing octave
        }
        return pitch; // Already has octave, return as-is
      } else {
        console.warn(`[MidiPlayerGroup] Invalid note name: ${pitch}`);
        return 'C4'; // Default fallback
      }
    }
    
    // Convert numeric MIDI note to string format
    return this.midiNoteNumberToName(pitch);
  }

  /**
   * Sanitize and filter MIDI notes
   */
  /**
   * Update error statistics
   */
  private updateErrorStats(type: 'noteAttempt' | 'failedNote' | 'invalidData' | 'synthError'): void {
    switch (type) {
      case 'noteAttempt':
        this.errorStats.totalNoteAttempts++;
        break;
      case 'failedNote':
        this.errorStats.failedNotes++;
        break;
      case 'invalidData':
        this.errorStats.invalidDataErrors++;
        break;
      case 'synthError':
        this.errorStats.synthErrors++;
        break;
    }
  }

  /**
   * Get error statistics
   */
  public getErrorStats() {
    const uptime = Date.now() - this.errorStats.lastResetTime;
    const successRate = this.errorStats.totalNoteAttempts > 0 
      ? ((this.errorStats.totalNoteAttempts - this.errorStats.failedNotes) / this.errorStats.totalNoteAttempts * 100)
      : 100;

    return {
      ...this.errorStats,
      uptimeMs: uptime,
      successRate: parseFloat(successRate.toFixed(2))
    };
  }

  /**
   * Reset error statistics
   */
  public resetErrorStats(): void {
    this.errorStats = {
      totalNoteAttempts: 0,
      failedNotes: 0,
      invalidDataErrors: 0,
      synthErrors: 0,
      lastResetTime: Date.now()
    };
    // console.log('[MidiPlayerGroup] Error statistics reset');
  }

  /**
   * Comprehensive MIDI data quality analysis
   */
  public analyzeMidiDataQuality() {
    const analysis = {
      timestamp: new Date().toISOString(),
      totalNotes: this.notes.length,
      fileIds: Array.from(new Set(this.notes.map(note => note.fileId).filter(Boolean))),
      dataQuality: {
        validNotes: 0,
        invalidNotes: 0,
        pitchRange: { min: Infinity, max: -Infinity },
        velocityRange: { min: Infinity, max: -Infinity },
        durationRange: { min: Infinity, max: -Infinity },
        timeRange: { min: Infinity, max: -Infinity }
      },
      issues: [] as string[],
      recommendations: [] as string[]
    };

    // Analyze each note
    for (const note of this.notes) {
      if (this.validateMidiNote(note)) {
        analysis.dataQuality.validNotes++;
        
        // Update ranges
        analysis.dataQuality.pitchRange.min = Math.min(
          analysis.dataQuality.pitchRange.min,
          typeof note.pitch === 'number' ? note.pitch : Number(note.pitch) || 0
        );
        analysis.dataQuality.pitchRange.max = Math.max(
          analysis.dataQuality.pitchRange.max,
          typeof note.pitch === 'number' ? note.pitch : Number(note.pitch) || 0
        );
        analysis.dataQuality.velocityRange.min = Math.min(analysis.dataQuality.velocityRange.min, note.velocity);
        analysis.dataQuality.velocityRange.max = Math.max(analysis.dataQuality.velocityRange.max, note.velocity);
        analysis.dataQuality.durationRange.min = Math.min(analysis.dataQuality.durationRange.min, note.duration);
        analysis.dataQuality.durationRange.max = Math.max(analysis.dataQuality.durationRange.max, note.duration);
        analysis.dataQuality.timeRange.min = Math.min(analysis.dataQuality.timeRange.min, note.time);
        analysis.dataQuality.timeRange.max = Math.max(analysis.dataQuality.timeRange.max, note.time);
      } else {
        analysis.dataQuality.invalidNotes++;
      }
    }

    const qualityPercent = analysis.totalNotes > 0 
      ? (analysis.dataQuality.validNotes / analysis.totalNotes) * 100 
      : 100;

    // Generate issues and recommendations
    if (qualityPercent < 95) {
      analysis.issues.push(`Low data quality: ${qualityPercent.toFixed(1)}% valid notes`);
      analysis.recommendations.push('Check MIDI file source and parsing quality');
    }

    if (analysis.dataQuality.invalidNotes > 0) {
      analysis.issues.push(`${analysis.dataQuality.invalidNotes} invalid notes detected`);
      analysis.recommendations.push('Verify MIDI data integrity and consider data cleaning');
    }

    if (analysis.dataQuality.pitchRange.min < 0 || analysis.dataQuality.pitchRange.max > 127) {
      analysis.issues.push('MIDI pitch values outside valid range (0-127)');
      analysis.recommendations.push('Sanitize pitch values to MIDI specification');
    }

    if (analysis.dataQuality.velocityRange.max > 1) {
      analysis.issues.push('Velocity values above 1.0 detected');
      analysis.recommendations.push('Normalize velocity values to 0.0-1.0 range');
    }

    if (analysis.dataQuality.durationRange.min <= 0) {
      analysis.issues.push('Zero or negative duration notes detected');
      analysis.recommendations.push('Filter out or correct invalid durations');
    }

    return analysis;
  }

  /**
   * Get comprehensive performance report
   */
  public getPerformanceReport() {
    const errorStats = this.getErrorStats();
    const dataAnalysis = this.analyzeMidiDataQuality();
    
    return {
      timestamp: new Date().toISOString(),
      playbackPerformance: {
        ...errorStats,
        isHealthy: errorStats.successRate >= 95,
        healthStatus: errorStats.successRate >= 99 ? 'excellent' : 
                     errorStats.successRate >= 95 ? 'good' : 
                     errorStats.successRate >= 80 ? 'fair' : 'poor'
      },
      dataQuality: dataAnalysis,
      systemStatus: {
        activePlayers: this.players.size,
        totalNotes: this.notes.length,
        partActive: this.part !== null,
        masterVolume: this.masterVolume
      },
      recommendations: this.generateRecommendations(errorStats, dataAnalysis)
    };
  }

  /**
   * Generate system recommendations based on performance and data quality
   */
  private generateRecommendations(errorStats: any, dataAnalysis: any): string[] {
    const recommendations: string[] = [];

    if (errorStats.successRate < 95) {
      recommendations.push('Consider reducing MIDI data complexity or checking for corrupted files');
    }

    if (errorStats.synthErrors > 0) {
      recommendations.push('Synthesizer errors detected - check audio system configuration');
    }

    if (dataAnalysis.dataQuality.invalidNotes > dataAnalysis.totalNotes * 0.05) {
      recommendations.push('High invalid note rate - consider implementing stricter data validation');
    }

    if (this.players.size === 0) {
      recommendations.push('No active synthesizers - check MIDI file loading and player initialization');
    }

    if (dataAnalysis.dataQuality.validNotes === 0) {
      recommendations.push('No valid notes found - verify MIDI data source and format');
    }

    return recommendations;
  }

  /**
   * Log comprehensive health status to console
   */
  public logHealthStatus(): void {
    const report = this.getPerformanceReport();
    
    console.group('[MidiPlayerGroup] Health Status Report');
    // console.log('Performance:', {
    //   successRate: report.playbackPerformance.successRate + '%',
    //   healthStatus: report.playbackPerformance.healthStatus,
    //   totalAttempts: report.playbackPerformance.totalNoteAttempts,
    //   failures: report.playbackPerformance.failedNotes
    // });

    // console.log('Data Quality:', {
    //   totalNotes: report.dataQuality.totalNotes,
    //   validNotes: report.dataQuality.dataQuality.validNotes,
    //   qualityPercent: ((report.dataQuality.dataQuality.validNotes / report.dataQuality.totalNotes) * 100).toFixed(1) + '%'
    // });

    // console.log('System Status:', report.systemStatus);
    
    if (report.dataQuality.issues.length > 0) {
      console.warn('Issues:', report.dataQuality.issues);
    }
    
    if (report.recommendations.length > 0) {
      // console.info('Recommendations:', report.recommendations);
    }
    
    console.groupEnd();
  }

  private sanitizeMidiNotes(notes: MidiNote[]): { validNotes: MidiNote[], stats: { total: number, valid: number, invalid: number } } {
    const validNotes: MidiNote[] = [];
    let invalidCount = 0;
    
    for (const note of notes) {
      if (this.validateMidiNote(note)) {
        validNotes.push(note);
      } else {
        invalidCount++;
        this.updateErrorStats('invalidData');
        if (MidiPlayerGroup.DEBUG) {
          console.warn('[MidiPlayerGroup] Invalid MIDI note filtered out:', {
            time: note.time,
            pitch: note.pitch,
            velocity: note.velocity,
            duration: note.duration,
            fileId: note.fileId
          });
        }
      }
    }
    
    const stats = {
      total: notes.length,
      valid: validNotes.length,
      invalid: invalidCount
    };
    
    if (invalidCount > 0) {
      console.warn(`[MidiPlayerGroup] Filtered out ${invalidCount}/${notes.length} invalid notes (${((invalidCount/notes.length)*100).toFixed(1)}%)`);
    }
    
    return { validNotes, stats };
  }

  private createMidiPart(startTime: number = 0, endTime?: number): void {
    if (this.part) {
      this.part.dispose();
      this.part = null;
    }
    
    if (!this.notes || this.notes.length === 0) {
      return;
    }
    
    // First, sanitize all MIDI notes
    const { validNotes, stats } = this.sanitizeMidiNotes(this.notes);
    // console.log('[MidiPlayerGroup] Sanitization results:', stats);
    
    // Filter by time range and convert note events
    // Clamp startTime within available MIDI time range to avoid unintended wrap to tail.
    const minTime = 0;
    const maxTime = validNotes.length > 0 ? Math.max(...validNotes.map(n => n.time)) : 0;
    let safeStart = Math.max(minTime, Math.min(startTime, maxTime));

    // Notes that start at/after safeStart
    const startingNotes = validNotes.filter(note => {
      if (note.time < safeStart) return false;
      if (endTime && note.time > endTime) return false;
      return true;
    });

    // Compute time scaling so MIDI follows BPM changes when using second-based scheduling
    const trForScale = Tone.getTransport();
    const currentBpm = Number(trForScale?.bpm?.value) || this.originalTempoBase || 120;
    const baseBpm = this.originalTempoBase || 120;
    const timeScale = (baseBpm > 0 && currentBpm > 0) ? (baseBpm / currentBpm) : 1;

    // For seek/resume (no endTime specified): include sustaining notes that began before safeStart
    // and are still active at safeStart by re-triggering them at t=0 with remaining duration.
    const includeCarryOver = (endTime === undefined);
    let carryOverEvents: Array<{ time: number; note: string; velocity: number; duration: number; fileId?: string } > = [];
    if (includeCarryOver) {
      const sustaining = validNotes.filter(note => {
        const noteEnd = note.time + note.duration;
        return note.time < safeStart && noteEnd > safeStart;
      });
      carryOverEvents = sustaining.map(note => {
        const remaining = Math.max(0.01, (note.time + note.duration) - safeStart);
        const scaledRemaining = Math.max(0.01, remaining * timeScale);
        return {
          time: 0,
          note: (note as any).name || this.normalizeNoteName(typeof note.pitch === 'number' ? note.pitch : Number(note.pitch) || 60),
          velocity: note.velocity,
          duration: scaledRemaining,
          fileId: note.fileId
        };
      });
    }

    // If no notes at/after the requested time, shift start slightly earlier to include nearest note
    let filteredNotes = startingNotes;
    if (filteredNotes.length === 0 && validNotes.length > 0) {
      const FALLBACK_WINDOW = 0.2; // seconds
      const prevTimes = validNotes
        .map(n => n.time)
        .filter(t => t <= safeStart);
      if (prevTimes.length > 0) {
        const prevNoteTime = Math.max(...prevTimes);
        const fallbackStart = Math.max(0, prevNoteTime - FALLBACK_WINDOW);
        safeStart = fallbackStart;
        filteredNotes = validNotes.filter(note => {
          if (note.time < safeStart) return false;
          if (endTime && note.time > endTime) return false;
          return true;
        });
        // console.info('[MidiPlayerGroup] Fallback start applied', { requested: startTime, safeStart, prevNoteTime });
      }
    }
    
    // Scale event times/durations so tempo changes affect playback speed for second-based scheduling
    let events = filteredNotes.map(note => ({
      time: Math.max(0, note.time - safeStart) * timeScale,
      note: (note as any).name || this.normalizeNoteName(typeof note.pitch === 'number' ? note.pitch : Number(note.pitch) || 60),
      velocity: note.velocity,
      duration: Math.max(0.01, note.duration * timeScale),
      fileId: note.fileId as string | undefined
    }));

    // Prepend carry-over sustaining notes (if any)
    if (carryOverEvents.length > 0) {
      // Normalize types and ensure fileId presence
      const normalizedCarry = carryOverEvents.map(e => ({
        time: e.time, // keep 0 offset for carry-over retrigger
        note: e.note,
        velocity: e.velocity,
        duration: Math.max(0.01, e.duration),
        fileId: (e.fileId as string | undefined)
      }));
      events = [...normalizedCarry, ...events];
    }

    // Seek safety: do NOT push events at t=0 when resuming live; allow immediate trigger.
    // EPS only applies when we explicitly schedule into the future anchor (handled at startSynchronized).
    
    // console.log('[MidiPlayerGroup] Creating Part with', events.length, 'events');
    // console.log('[MidiPlayerGroup] Sample events:', events.slice(0, 5));
    if (stats.invalid > 0) {
      // console.log(`[MidiPlayerGroup] Data quality: ${stats.valid}/${stats.total} valid notes (${((stats.valid/stats.total)*100).toFixed(1)}%)`);
    }
    
    // Check player availability
    // console.log('[MidiPlayerGroup] Available players:', Array.from(this.players.keys()));
    
    // Create Part with enhanced error recovery
    this.part = new Tone.Part((time, event) => {
      // Track note attempt
      this.updateErrorStats('noteAttempt');
      
      const playerInfo = this.players.get((event.fileId ?? '') as string);
      if (!playerInfo) {
        console.warn('[MidiPlayerGroup] No player for fileId:', event.fileId);
        return;
      }
      
      if (playerInfo.muted) {
        // Silenced repetitive log to avoid console noise during playback when muted
        // console.debug('[MidiPlayerGroup] Player muted, skipping:', event.fileId);
        return; // Don't play muted players (not counted as error)
      }
      
      // console.log('[MidiPlayerGroup] Playing note:', event.note, 'at time:', time, 'transportSeconds', Tone.getTransport().seconds);
      
      try {
        // Additional validation at runtime
        if (!event.note || typeof event.note !== 'string') {
          this.updateErrorStats('failedNote');
          console.warn('[MidiPlayerGroup] Runtime note validation failed:', event);
          return;
        }
        
        if (!Number.isFinite(event.duration) || event.duration <= 0) {
          this.updateErrorStats('failedNote');
          console.warn('[MidiPlayerGroup] Runtime duration validation failed:', event);
          return;
        }
        
        // Apply volume: master * individual * velocity
        const finalVolume = this.masterVolume * playerInfo.volume * event.velocity;
        
        // Use Sampler's triggerAttackRelease with proper volume scaling
        playerInfo.sampler.triggerAttackRelease(
          event.note,
          event.duration,
          time,
          finalVolume
        );
        
        // console.log('[MidiPlayerGroup] Note triggered successfully:', event.note, 'volume:', finalVolume);
        
      } catch (error) {
        this.updateErrorStats('failedNote');
        this.updateErrorStats('synthError');
        
        console.error('[MidiPlayerGroup] Failed to trigger note:', error, {
          note: event.note,
          duration: event.duration,
          velocity: event.velocity,
          fileId: event.fileId,
          finalVolume: this.masterVolume * playerInfo.volume * event.velocity
        });
        
        // Try graceful recovery - attempt with fallback parameters
        try {
          // console.log('[MidiPlayerGroup] Attempting recovery with C4 fallback');
          playerInfo.sampler.triggerAttackRelease(
            'C4',
            0.5,  // Fallback duration
            time,
            0.1   // Safe volume
          );
        } catch (recoveryError) {
          console.error('[MidiPlayerGroup] Recovery attempt also failed:', recoveryError);
        }
      }
    }, events);

    this.part.loop = false; // Loop is managed from above
    // console.log('[DEBUG][MidiPlayerGroup] Part created successfully with', events.length, 'events, tempoScale:', this.tempoScale);
  }
  
  /**
   * Convert MIDI note number to note name
   */
  private midiNoteNumberToName(noteNumber: number): string {
    // Input validation and sanitization
    if (!Number.isFinite(noteNumber) || noteNumber < 0 || noteNumber > 127) {
      console.warn(`[MidiPlayerGroup] Invalid MIDI note number: ${noteNumber}, using C4 as fallback`);
      noteNumber = 60; // C4 as fallback
    }
    
    // Ensure noteNumber is an integer
    noteNumber = Math.round(noteNumber);
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(noteNumber / 12) - 1;
    const noteIndex = noteNumber % 12;
    
    // Additional safety check for array bounds
    const noteName = noteNames[noteIndex] || 'C';
    
    return noteName + octave;
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
    
    // Initialize samplers
    await this.initialize();
    
    // Re-check generation after await to prevent race condition
    if (typeof currentGen === 'number' && this.lastStartGen !== currentGen) {
      return;
    }
    
    if (this.players.size === 0) {
      return;
    }
    
    const transport = Tone.getTransport();
    
    // Unmute all gates
    for (const playerInfo of this.players.values()) {
      if (!playerInfo.muted) {
        playerInfo.gate.gain.value = this.masterVolume * playerInfo.volume;
      }
    }
    
    // Decide start mode ahead to control zero-time EPS application
    const timeToAnchor = syncInfo.audioContextTime - Tone.context.currentTime;
    // Apply zero-time EPS only for seek restarts to avoid initial start misalignment
    this.applyZeroEps = (syncInfo.mode === 'seek') && timeToAnchor > 0.05;

    // Create MIDI Part without preroll to maintain exact timing
    const partStartTime = syncInfo.masterTime; // No preroll applied
    this.createMidiPart(partStartTime);
    
    if (this.part) {
      try {
        // Clean up existing Part - only if needed
        if (this.part.state === 'started') {
          this.part.stop(0);
          this.part.cancel(0);
        } else if (this.part.state === 'stopped') {
          this.part.cancel(0);
        } else {
          this.part.stop(0);
          this.part.cancel(0);
        }

        // First play vs seek: Use best anchor per mode to avoid drift
        if (syncInfo.mode === 'seek') {
          // Use masterTime directly to avoid drift from already-started transport
          this.part.start(syncInfo.masterTime, 0);
        } else {
          // Use masterTime directly to avoid drift from already-started transport
          this.part.start(syncInfo.masterTime, 0);
        }

      } catch (error) {
        console.error('[MidiPlayerGroup] ERROR in Part start process:', error instanceof Error ? error.message : String(error));
      }
    }
  }
  
  /**
   * PlayerGroup interface implementation: Synchronized stop
   */
  stopSynchronized(): void {
    // console.log('[DEBUG][MidiPlayerGroup] Stopping synchronized playback - Part exists:', !!this.part);
    
    // Stop Part
    if (this.part) {
      try {
        this.part.stop(0);
        this.part.cancel(0);
      } catch (error) {
        console.error('[MidiPlayerGroup] Failed to stop Part:', error);
      }
    }
    
    // Mute all gates
    for (const playerInfo of this.players.values()) {
      try {
        playerInfo.gate.gain.value = 0;
      } catch (error) {
        console.error('[MidiPlayerGroup] Failed to mute synthesizer:', error);
      }
    }
    
    // Immediately stop all currently playing sounds from all synthesizers
    for (const playerInfo of this.players.values()) {
      try {
        playerInfo.sampler.releaseAll();
      } catch (error) {
        console.error('[MidiPlayerGroup] Failed to release synthesizer:', error);
      }
    }
  }
  
  /**
   * PlayerGroup interface implementation: Seek to time
   */
  seekTo(time: number): void {
    // console.log('[MidiPlayerGroup] Seeking to:', time);
    
    // Stop current playback
    this.stopSynchronized();
    
    // Set Transport time
    const transport = Tone.getTransport();
    transport.seconds = time;
    // console.log('[MidiPlayerGroup] Transport.seconds set to', transport.seconds);
    
    // Recreate Part from new time point
    this.createMidiPart(time);
    
    // Restore gate values for unmuted players (critical for paused seek)
    for (const [fileId, playerInfo] of this.players.entries()) {
      if (!playerInfo.muted) {
        playerInfo.gate.gain.value = this.masterVolume * playerInfo.volume;
      }
    }
    // console.log('[MidiPlayerGroup] Gate values restored after seek');
  }
  
  /**
   * PlayerGroup interface implementation: Set tempo
   */
  setTempo(bpm: number): void {
    // Compute tempoScale relative to original baseline
    const base = this.originalTempoBase || 120;
    const newScale = (base > 0) ? (bpm / base) : 1;
    this.tempoScale = newScale;
    // Part will be recreated on next seek/restart initiated by master clock
  }

  /** Set baseline tempo used to compute MIDI scheduling scale. */
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
    
    // Apply to all synthesizers
    for (const playerInfo of this.players.values()) {
      if (!playerInfo.muted) {
        playerInfo.gate.gain.value = this.masterVolume * playerInfo.volume;
      }
    }
  }
  
  /**
   * PlayerGroup interface implementation: Set loop
   */
  setLoop(mode: 'off' | 'repeat' | 'ab', markerA: number | null, markerB: number | null): void {
    // console.log('[MidiPlayerGroup] Setting loop mode:', { mode, markerA, markerB });
    
    if (mode === 'ab' && markerA !== null && markerB !== null) {
      // For A-B loop, recreate Part with only that section
      this.createMidiPart(markerA, markerB);
      
      if (this.part) {
        this.part.loop = true;
        this.part.loopEnd = markerB - markerA;
      }
    } else if (mode === 'repeat') {
      // Full-repeat is handled by upper controller via atomic seek-to-start
      // Ensure Part itself does NOT loop to avoid layered/duplicated playback
      if (this.part) {
        this.part.loop = false;
        try { (this.part as any).loopEnd = undefined; } catch {}
      }
    } else {
      if (this.part) {
        this.part.loop = false;
      }
    }
  }
  
  // === Individual player control methods (user requirements) ===
  
  /**
   * Set individual MIDI player volume
   */
  setPlayerVolume(fileId: string, volume: number): void {
    const playerInfo = this.players.get(fileId);
    if (!playerInfo) {
      console.warn('[MidiPlayerGroup] Player not found:', fileId);
      return;
    }
    
    playerInfo.volume = Math.max(0, Math.min(1, volume));
    
    if (!playerInfo.muted) {
      playerInfo.gate.gain.value = this.masterVolume * playerInfo.volume;
    }
    
    // console.log('[MidiPlayerGroup] Set volume for', fileId, ':', playerInfo.volume);
  }
  
  /**
   * Set individual MIDI player pan
   */
  setPlayerPan(fileId: string, pan: number): void {
    const playerInfo = this.players.get(fileId);
    if (!playerInfo) {
      console.warn('[MidiPlayerGroup] Player not found:', fileId);
      return;
    }
    
    playerInfo.pan = Math.max(-1, Math.min(1, pan));
    playerInfo.panner.pan.value = playerInfo.pan;
    
    // console.log('[MidiPlayerGroup] Set pan for', fileId, ':', playerInfo.pan);
  }
  
  /**
   * Set individual MIDI player mute
   */
  setPlayerMute(fileId: string, muted: boolean): void {
    const playerInfo = this.players.get(fileId);
    if (!playerInfo) {
      console.warn('[MidiPlayerGroup] Player not found:', fileId);
      return;
    }
    
    playerInfo.muted = muted;
    
    if (playerInfo.muted) {
      playerInfo.gate.gain.value = 0;
      // Also immediately stop currently playing notes
      playerInfo.sampler.releaseAll();
    } else {
      playerInfo.gate.gain.value = this.masterVolume * playerInfo.volume;
    }
    
    // console.log('[MidiPlayerGroup] Set mute for', fileId, ':', playerInfo.muted);
  }
  
  /**
   * Get individual player states
   */
  getPlayerStates(): Record<string, { volume: number; pan: number; muted: boolean }> {
    const states: Record<string, { volume: number; pan: number; muted: boolean }> = {};
    
    for (const [fileId, playerInfo] of this.players) {
      states[fileId] = {
        volume: playerInfo.volume,
        pan: playerInfo.pan,
        muted: playerInfo.muted
      };
    }
    
    return states;
  }
  
  /**
   * Resource cleanup
   */
  destroy(): void {
    // console.log('[MidiPlayerGroup] Destroying');
    
    // Clean up Part
    if (this.part) {
      this.part.dispose();
      this.part = null;
    }
    
    // Clean up all synthesizers and audio nodes
    for (const playerInfo of this.players.values()) {
      try {
        playerInfo.sampler.dispose();
        playerInfo.gate.dispose();
        playerInfo.panner.dispose();
      } catch (error) {
        console.error('[MidiPlayerGroup] Failed to dispose synthesizer:', error);
      }
    }
    
    this.players.clear();
  }
}
