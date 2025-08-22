/**
 * Audio file entry and state for WAV/MP3 waveform integration.
 */
export interface AudioFileEntry {
  id: string;
  displayName: string;
  url: string;
  duration: number; // seconds
  color: number;
  isVisible: boolean; // waveform visibility on piano-roll grid
  isMuted: boolean;
  pan: number; // -1..1
  peaks: number[]; // normalized [0, 1]
  audioBuffer?: AudioBuffer; // optional decoded buffer
}

export interface AudioFilesState {
  files: AudioFileEntry[];
}


