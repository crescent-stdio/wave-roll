/**
 * Value utility functions for playback module
 */

import { clamp } from '@/lib/core/utils';

/**
 * Playback-specific value utilities
 */
export const PlaybackValueUtils = {
  /**
   * Clamp volume to valid range [0, 1]
   */
  clampVolume(volume: number): number {
    return clamp(volume, 0, 1);
  },

  /**
   * Clamp tempo to specified range
   */
  clampTempo(tempo: number, min: number = 30, max: number = 300): number {
    return clamp(tempo, min, max);
  },

  /**
   * Clamp pan value to stereo range [-1, 1]
   */
  clampPan(pan: number): number {
    return clamp(pan, -1, 1);
  },

  /**
   * Convert time to percentage of duration
   */
  timeToPercent(time: number, duration: number): number {
    if (duration === 0) return 0;
    return (time / duration) * 100;
  },

  /**
   * Convert percentage to time based on duration
   */
  percentToTime(percent: number, duration: number): number {
    return (percent / 100) * duration;
  },

  /**
   * Check if volume is effectively silent
   */
  isSilent(volume: number, threshold: number = 0.001): boolean {
    return volume < threshold;
  },

  /**
   * Convert decibels to linear volume
   */
  dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  },

  /**
   * Convert linear volume to decibels
   */
  linearToDb(linear: number): number {
    return 20 * Math.log10(Math.max(0.001, linear));
  },

  /**
   * Normalize tempo to playback rate
   */
  tempoToPlaybackRate(tempo: number, baseTempo: number = 120): number {
    return tempo / baseTempo;
  },

  /**
   * Convert playback rate to tempo
   */
  playbackRateToTempo(rate: number, baseTempo: number = 120): number {
    return rate * baseTempo;
  }
};