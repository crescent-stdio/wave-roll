declare module "@/core/audio" {
  export type AudioPlayerState = any;
  export interface AudioPlayerContainer {
    play(): Promise<void>;
    pause(): void;
    restart(): void;
    toggleRepeat(enabled: boolean): void;
    seek(seconds: number, updateVisual?: boolean): void;
    setVolume(volume: number): void;
    setTempo(bpm: number): void;
    setPlaybackRate(rate: number): void;
    setLoopPoints(start: number | null, end: number | null, preservePosition?: boolean): void;
    getState(): AudioPlayerState;
    destroy(): void;
    setPan(pan: number): void;
    setFilePan?(fileId: string, pan: number): void;
    setFileMute?(fileId: string, mute: boolean): void;
    setFileVolume?(fileId: string, volume: number): void;
    setWavVolume?(fileId: string, volume: number): void;
  }
  export function createAudioPlayer(...args: any[]): AudioPlayerContainer;
}

