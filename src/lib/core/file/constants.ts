import { SampleFileConfig, SampleAudioFileConfig } from "./types";

/**
 * Default sample files configuration
 */
export const DEFAULT_SAMPLE_FILES: SampleFileConfig[] = [
  {
    path: "./src/sample_midi/bytedance-liszt.mid",
    displayName: "Bytedance Liszt",
  },
  {
    path: "./src/sample_midi/basicpitch-liszt.mid",
    displayName: "Basic Pitch Liszt",
  },
  {
    path: "./src/sample_midi/Transkun-liszt.mid",
    displayName: "Transkun Liszt",
  },
];

export const DEFAULT_SAMPLE_AUDIO_FILES: SampleAudioFileConfig[] = [
  {
    path: "./src/sample_midi/sample-liszt.mp3",
    displayName: "Liszt Audio",
  },
];
