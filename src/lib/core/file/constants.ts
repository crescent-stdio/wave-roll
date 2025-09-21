import { SampleFileConfig, SampleAudioFileConfig } from "./types";

/**
 * Default sample files configuration
 */
export const DEFAULT_SAMPLE_FILES: SampleFileConfig[] = [
  {
    path: "./src/sample_midi/bytedance-liszt.mid",
    name: "Bytedance Liszt",
  },
  {
    path: "./src/sample_midi/basicpitch-liszt.mid",
    name: "Basic Pitch Liszt",
  },
  {
    path: "./src/sample_midi/Transkun-liszt.mid",
    name: "Transkun Liszt",
  },
];

export const DEFAULT_SAMPLE_AUDIO_FILES: SampleAudioFileConfig[] = [
  {
    path: "./src/sample_midi/sample-liszt.mp3",
    name: "Liszt Audio",
  },
];
