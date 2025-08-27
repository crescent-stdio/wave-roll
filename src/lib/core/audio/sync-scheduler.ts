/**
 * Sync Scheduler
 * Handles synchronization between audio playback and visual playhead
 */

import * as Tone from "tone";

export class SyncScheduler {
  private syncScheduler: number | null = null;
  private _schedulerToken = 0;
  private hasSeenNonZeroTime = false;

  constructor(
    private state: any,
    private originalTempo: number,
    private pianoRoll: any,
    private operationState: any,
    private options: any
  ) {}

  startSyncScheduler(): void {
    this.stopSyncScheduler();

    const token = ++this._schedulerToken;

    const initialSync = () => {
      const transport = Tone.getTransport();
      const transportTime = transport.seconds;
      const visualTime =
        (transportTime * this.state.tempo) / this.originalTempo;

      const TOLERANCE_SEC = 1;
      if (visualTime < this.state.currentTime - TOLERANCE_SEC) {
        return;
      }

      this.state.currentTime = visualTime;
      this.pianoRoll.setTime(visualTime);
    };

    initialSync();

    const performUpdate = () => {
      if (token !== this._schedulerToken) {
        return;
      }
      if (!this.state.isPlaying || this.operationState.isSeeking) {
        return;
      }

      const transport = Tone.getTransport();
      if (transport.state !== "started") {
        return;
      }

      const transportTime = transport.seconds;
      const visualTime =
        (transportTime * this.state.tempo) / this.originalTempo;

      this.state.currentTime = visualTime;
      this.pianoRoll.setTime(visualTime);

      if (!this.state.isRepeating && visualTime >= this.state.duration) {
        // Need to call pause from parent
        if (this.options.onAutoStop) {
          this.options.onAutoStop();
        }
      }
    };

    const scheduleUpdate = () => {
      performUpdate();
      if (this.state.isPlaying && token === this._schedulerToken) {
        this.syncScheduler = window.setTimeout(
          scheduleUpdate,
          this.options.syncInterval
        );
      }
    };

    this.syncScheduler = window.setTimeout(
      scheduleUpdate,
      this.options.syncInterval
    );
  }

  stopSyncScheduler(): void {
    if (this.syncScheduler !== null) {
      clearTimeout(this.syncScheduler);
      this.syncScheduler = null;
    }
    this._schedulerToken++;
  }
}