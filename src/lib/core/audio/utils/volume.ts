import * as Tone from "tone";
import { AUDIO_CONSTANTS } from "../../audio/player-types";

/** Clamp value to [0,1] */
export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Convert linear gain [0,1] to dB; clamps input to [0,1]. */
export function toDb(linear: number): number {
  return Tone.gainToDb(clamp01(linear));
}

/** Convert dB to linear gain [0,1+]; result is not clamped. */
export function fromDb(db: number): number {
  return Tone.dbToGain(db);
}

/** Whether a dB value is at or below the silence threshold. */
export function isSilentDb(db: number, threshold: number = AUDIO_CONSTANTS.SILENT_DB): boolean {
  return db <= threshold;
}

/** Apply mute flag to a linear volume, returning 0 when muted. */
export function effectiveVolume(linear: number, muted?: boolean): number {
  return muted ? 0 : clamp01(linear);
}

/** Multiply master and channel linear volumes with clamping. */
export function mixLinear(master: number, channel: number): number {
  return clamp01(master) * clamp01(channel);
}

