// Shared types for the global waveform/audio registry used by the UI and
// playback utilities. Keeping them here avoids ad-hoc duplications.

export interface RegisteredAudio {
  id: string;
  displayName: string;
  url: string;
  color: number;
  isVisible: boolean;
  isMuted: boolean;
  pan: number;
  audioBuffer?: AudioBuffer;
  peaks?: { min: number[]; max: number[] };
  volume?: number;
}

export interface WaveRollAudioAPI {
  getFiles(): RegisteredAudio[];
  getVisiblePeaks?: () => Array<{ time: number; min: number; max: number; color: number }>;
  sampleAtTime?: (time: number) => { min: number; max: number; color: number } | null;
  toggleVisibility?: (id: string) => void;
  toggleMute?: (id: string) => void;
  setPan?: (id: string, pan: number) => void;
  updateDisplayName?: (id: string, name: string) => void;
  updateColor?: (id: string, color: number) => void;
  _store?: { items: RegisteredAudio[] };
}

