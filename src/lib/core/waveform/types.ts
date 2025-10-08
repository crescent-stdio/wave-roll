// Shared types for the global waveform/audio registry used by the UI and
// playback utilities. Keeping them here avoids ad-hoc duplications.

export interface RegisteredAudio {
  id: string;
  name: string;
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
  getVisiblePeaks?: () => PeakDatum[];
  sampleAtTime?: (time: number) => Omit<PeakDatum, "time"> | null;
  toggleVisibility?: (id: string) => void;
  /** Set visibility explicitly (added for compatibility) */
  setVisibility?: (id: string, visible: boolean) => void;
  toggleMute?: (id: string) => void;
  /** Set mute explicitly (added for compatibility) */
  setMute?: (id: string, muted: boolean) => void;
  setPan?: (id: string, pan: number) => void;
  updateName?: (id: string, name: string) => void;
  updateColor?: (id: string, color: number) => void;
  /** Remove audio file by id */
  remove?: (id: string) => void;
  _store?: { items: RegisteredAudio[] };
}


export interface PeakDatum {
  time: number;
  min: number;
  max: number;
  color: number;
}
