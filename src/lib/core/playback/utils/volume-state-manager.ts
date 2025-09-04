/**
 * Volume and mute state management utilities
 */

import { PlaybackValueUtils } from './value-utils';
import { createStateChangeHandler } from './state-change-handler';

export interface VolumeState {
  volume: number;
  muted: boolean;
}

/**
 * Manages volume and mute states for multiple sources
 */
export class VolumeStateManager<T extends string = string> {
  private volumes = new Map<T, number>();
  private mutes = new Map<T, boolean>();
  private masterVolume: number = 1.0;
  private masterMuted: boolean = false;
  
  constructor(
    private onStateChange?: (wasSilent: boolean, isSilent: boolean) => void
  ) {}

  /**
   * Set volume for a specific source
   */
  setVolume(id: T, volume: number): void {
    const handler = createStateChangeHandler(
      () => this.isAllSilent(),
      (wasSilent, isSilent) => {
        if (this.onStateChange && wasSilent !== isSilent) {
          this.onStateChange(wasSilent, isSilent);
        }
      }
    );

    handler(() => {
      const clampedVolume = PlaybackValueUtils.clampVolume(volume);
      this.volumes.set(id, clampedVolume);
    });
  }

  /**
   * Get volume for a specific source
   */
  getVolume(id: T): number {
    return this.volumes.get(id) ?? 1.0;
  }

  /**
   * Set mute state for a specific source
   */
  setMuted(id: T, muted: boolean): void {
    const handler = createStateChangeHandler(
      () => this.isAllSilent(),
      (wasSilent, isSilent) => {
        if (this.onStateChange && wasSilent !== isSilent) {
          this.onStateChange(wasSilent, isSilent);
        }
      }
    );

    handler(() => {
      this.mutes.set(id, muted);
    });
  }

  /**
   * Get mute state for a specific source
   */
  isMuted(id: T): boolean {
    return this.mutes.get(id) ?? false;
  }

  /**
   * Set master volume
   */
  setMasterVolume(volume: number): void {
    const handler = createStateChangeHandler(
      () => this.isAllSilent(),
      (wasSilent, isSilent) => {
        if (this.onStateChange && wasSilent !== isSilent) {
          this.onStateChange(wasSilent, isSilent);
        }
      }
    );

    handler(() => {
      this.masterVolume = PlaybackValueUtils.clampVolume(volume);
    });
  }

  /**
   * Get master volume
   */
  getMasterVolume(): number {
    return this.masterVolume;
  }

  /**
   * Set master mute state
   */
  setMasterMuted(muted: boolean): void {
    const handler = createStateChangeHandler(
      () => this.isAllSilent(),
      (wasSilent, isSilent) => {
        if (this.onStateChange && wasSilent !== isSilent) {
          this.onStateChange(wasSilent, isSilent);
        }
      }
    );

    handler(() => {
      this.masterMuted = muted;
    });
  }

  /**
   * Check if master is muted
   */
  isMasterMuted(): boolean {
    return this.masterMuted;
  }

  /**
   * Get effective volume for a source (considering mute states and master)
   */
  getEffectiveVolume(id: T): number {
    if (this.masterMuted || this.isMuted(id)) {
      return 0;
    }
    
    const sourceVolume = this.getVolume(id);
    return sourceVolume * this.masterVolume;
  }

  /**
   * Check if all sources are effectively silent
   */
  isAllSilent(): boolean {
    if (this.masterMuted || PlaybackValueUtils.isSilent(this.masterVolume)) {
      return true;
    }

    // If no volumes are set, not considered silent (no sources to be silent)
    if (this.volumes.size === 0) {
      return false;
    }

    // Check if any source is audible
    for (const [id, volume] of this.volumes) {
      if (!this.mutes.get(id) && !PlaybackValueUtils.isSilent(volume)) {
        return false;
      }
    }

    // All sources exist and are silent
    return true;
  }

  /**
   * Check if a specific source is silent
   */
  isSilent(id: T): boolean {
    return this.getEffectiveVolume(id) === 0;
  }

  /**
   * Get all sources that are currently audible
   */
  getAudibleSources(): T[] {
    const audible: T[] = [];
    
    if (this.masterMuted || PlaybackValueUtils.isSilent(this.masterVolume)) {
      return audible;
    }

    for (const [id, volume] of this.volumes) {
      if (!this.mutes.get(id) && !PlaybackValueUtils.isSilent(volume)) {
        audible.push(id);
      }
    }

    return audible;
  }

  /**
   * Clear all volume and mute states
   */
  clear(): void {
    this.volumes.clear();
    this.mutes.clear();
  }

  /**
   * Get state summary
   */
  getState(): {
    sources: Map<T, VolumeState>;
    master: VolumeState;
  } {
    const sources = new Map<T, VolumeState>();
    
    for (const [id, volume] of this.volumes) {
      sources.set(id, {
        volume,
        muted: this.mutes.get(id) ?? false
      });
    }

    return {
      sources,
      master: {
        volume: this.masterVolume,
        muted: this.masterMuted
      }
    };
  }
}