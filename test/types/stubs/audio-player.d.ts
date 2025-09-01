declare module "@/lib/core/audio/audio-player" {
  export class AudioPlayer { constructor(...args: any[]); play(): Promise<void>; pause(): void; getState(): any; destroy(): void; setWavVolume(id: string, v: number): void; }
  export function createAudioPlayer(...args: any[]): any;
}
