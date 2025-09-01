declare module "@/core/playback" {
  export interface PianoRollManager {
    getPianoRollInstance(): any;
    setTime(t: number): void;
  }
}
