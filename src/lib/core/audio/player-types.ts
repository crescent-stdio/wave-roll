/**
 * Audio Player Types and Interfaces
 */

import { NoteData } from "@/lib/midi/types";

/**
 * Piano roll interface for playhead synchronization
 */
export interface PianoRollSync {
  /** Update the playhead position in seconds */
  setTime(time: number): void;
}

/**
 * Configuration options for the audio player
 */
export interface PlayerOptions {
  /** BPM for playback (default: 120) */
  tempo?: number;
  /** Volume level 0-1 (default: 0.7) */
  volume?: number;
  /** Whether to enable repeat/loop mode (default: false) */
  repeat?: boolean;
  /** Custom sound font URL for better audio quality */
  soundFont?: string;
  /** Update interval for playhead synchronization in ms (default: 16 for ~60fps) */
  syncInterval?: number;
  /** Callback when playback reaches the end (non-looping mode only) */
  onPlaybackEnd?: () => void;
}

/**
 * Audio player state
 */
export interface AudioPlayerState {
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Whether repeat mode is enabled */
  isRepeating: boolean;
  /** Current playback position in seconds (unified time reference) */
  currentTime: number;
  /** Total duration in seconds (affected by tempo) */
  duration: number;
  /** Current volume level 0-1 */
  volume: number;
  /** Current tempo in BPM */
  tempo: number;
  /** Reference tempo used when MIDI was decoded (immutable baseline) */
  originalTempo: number;
  /** Current stereo pan value (-1 left, 0 center, 1 right) */
  pan: number;
  /** Current playback rate as percentage (10-200, 100 = normal speed) */
  playbackRate?: number;
  /** Generation token to prevent ghost audio - increments on play/seek/tempo changes */
  playbackGeneration?: number;
  
  // New unified state management fields
  /** Master volume for all audio sources */
  masterVolume: number;
  /** Loop mode configuration */
  loopMode: 'off' | 'all' | 'ab';
  /** AB loop start marker in seconds */
  markerA: number | null;
  /** AB loop end marker in seconds */
  markerB: number | null;
  /** Unified current time for all sources (real-time playback position) */
  nowTime: number;
  /** Total time accounting for tempo changes */
  totalTime: number;
}

/**
 * Audio player control interface
 */
export interface AudioPlayerContainer {
  /** Start or resume playback */
  play(): Promise<void>;

  /** Pause playback */
  pause(): void;

  /** Stop and restart from beginning */
  restart(): void;

  /** Enable or disable repeat mode */
  toggleRepeat(enabled: boolean): void;

  /** Seek to specific time position */
  seek(seconds: number, updateVisual?: boolean): void;

  /** Set playback volume */
  setVolume(volume: number): void;

  /** Set playback tempo */
  setTempo(bpm: number): void;

  /** Set playback rate as percentage (10-200, 100 = normal speed) */
  setPlaybackRate(rate: number): void;

  /**
   * Set custom A-B loop points (in seconds).
   * Passing `null` for both parameters clears the loop.
   * If only `start` is provided, the loop will extend to the end of the piece.
   * @param preservePosition - If true, maintains current position when setting loop points
   */
  setLoopPoints(
    start: number | null,
    end: number | null,
    preservePosition?: boolean
  ): void;

  /** Get current player state */
  getState(): AudioPlayerState;

  /** Clean up resources */
  destroy(): void;

  // Global pan control removed in v2. Use per-file setFilePan instead.

  /** Set stereo pan for a specific file when multiple MIDI files are playing */
  setFilePan(fileId: string, pan: number): void;

  /** Set mute state for a specific file when multiple MIDI files are playing */
  setFileMute(fileId: string, mute: boolean): void;

  /** Set volume for a specific MIDI file */
  setFileVolume(fileId: string, volume: number): void;

  /** Set volume for a specific WAV file */
  setWavVolume(fileId: string, volume: number): void;

  /** Refresh WAV/audio players from registry (for mute/visibility updates) */
  refreshAudioPlayers?(): void;
}

/**
 * Internal state for managing async operations
 */
export interface OperationState {
  isSeeking: boolean;
  isRestarting: boolean;
  pendingSeek: number | null;
  lastLoopJumpTime: number;
}

/**
 * External audio file information from registry
 */
export interface AudioFileInfo {
  id: string;
  url: string;
  isVisible: boolean;
  isMuted: boolean;
  audioBuffer?: AudioBuffer;
  pan?: number;
  volume?: number;
}

/**
 * Default sample map for Tone.js sampler
 */
export const DEFAULT_SAMPLE_MAP = {
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
};

/**
 * Audio constants
 */
export const AUDIO_CONSTANTS = {
  /** Seek event suppression window in milliseconds */
  SEEK_SUPPRESS_MS: 3000,
  /** Silent threshold in decibels */
  SILENT_DB: -80,
  /** Restart delay for transport scheduling - increased for stability */
  RESTART_DELAY: 0.1,
  /** Default sync interval in milliseconds */
  DEFAULT_SYNC_INTERVAL: 16,
  /** Lookahead time for event scheduling in seconds */
  LOOKAHEAD_TIME: 0.1,
  /** Schedule ahead time for notes in seconds */
  SCHEDULE_AHEAD_TIME: 0.25,
  /** Default volume level */
  DEFAULT_VOLUME: 1.0,
  /** Default tempo in BPM */
  DEFAULT_TEMPO: 120,
  /** Default playback rate percentage */
  DEFAULT_PLAYBACK_RATE: 100,
  /** Minimum playback rate percentage */
  MIN_PLAYBACK_RATE: 10,
  /** Maximum playback rate percentage */
  MAX_PLAYBACK_RATE: 200,
  /** Minimum playback rate (alias for consistency) */
  MIN_RATE: 10,
  /** Maximum playback rate (alias for consistency) */
  MAX_RATE: 200,
  /** Minimum tempo in BPM */
  MIN_TEMPO: 30,
  /** Maximum tempo in BPM */
  MAX_TEMPO: 300,
};
