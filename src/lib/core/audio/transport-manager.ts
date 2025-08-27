/**
 * Transport Event Manager
 * Handles Tone.js Transport events and callbacks
 */

import * as Tone from "tone";
import { OperationState } from "./audio-player";

export class TransportManager {
  private _lastSeekTimestamp = 0;
  private _loopCounter = 0;
  private operationState: OperationState;
  private pausedTime = 0;
  
  constructor(
    private state: any,
    private originalTempo: number,
    private pianoRoll: any,
    private stopSyncScheduler: () => void,
    private stopAllAudioPlayers: () => void,
    private scheduleVisualUpdate: (callback: () => void) => void,
    private isAudioActive: () => boolean,
    private startActiveAudioAt: (offset: number) => void,
    private part: Tone.Part | null,
    private _loopStartVisual: number | null,
    private _loopEndVisual: number | null
  ) {
    this.operationState = {
      isSeeking: false,
      isRestarting: false,
      pendingSeek: null,
      lastLoopJumpTime: 0,
    };
  }

  get operationStateRef() {
    return this.operationState;
  }

  get pausedTimeRef() {
    return this.pausedTime;
  }

  set pausedTimeValue(value: number) {
    this.pausedTime = value;
  }

  updateLastSeekTimestamp(timestamp: number) {
    this._lastSeekTimestamp = timestamp;
  }

  handleTransportStop = (): void => {
    const SEEK_SUPPRESS_MS = 3000;
    if (Date.now() - this._lastSeekTimestamp < SEEK_SUPPRESS_MS) {
      return;
    }

    if (Tone.getTransport().state !== "stopped") {
      return;
    }

    console.log("[Transport.stop] fired", {
      transportState: Tone.getTransport().state,
      transportSec: Tone.getTransport().seconds.toFixed(3),
      visualSec: (
        (Tone.getTransport().seconds * this.state.tempo) /
        this.originalTempo
      ).toFixed(3),
      currentTime: this.state.currentTime.toFixed(3),
      isSeeking: this.operationState.isSeeking,
      isRestarting: this.operationState.isRestarting,
    });

    const transportSec = Tone.getTransport().seconds;
    const visualSec = (transportSec * this.state.tempo) / this.originalTempo;
    if (Math.abs(visualSec - this.state.currentTime) > 1) {
      return;
    }

    this.state.isPlaying = false;
    this.pausedTime = transportSec;
    this.stopSyncScheduler();
    this.pianoRoll.setTime(this.state.currentTime);
    this.stopAllAudioPlayers();
  };

  handleTransportPause = (): void => {
    if (this.operationState.isSeeking || this.operationState.isRestarting) {
      return;
    }

    this.state.isPlaying = false;
    this.pausedTime = Tone.getTransport().seconds;
    this.stopSyncScheduler();

    const visualTime =
      (this.pausedTime * this.state.tempo) / this.originalTempo;
    this.state.currentTime = visualTime;
    this.pianoRoll.setTime(visualTime);
    this.stopAllAudioPlayers();
  };

  handleTransportLoop = (): void => {
    this._loopCounter++;
    this.operationState.lastLoopJumpTime = Date.now();

    const loopStart = Tone.getTransport().loopStart as number;
    const loopEnd = Tone.getTransport().loopEnd as number;

    if (this._loopCounter === 1) {
      console.log("[Transport.loop] A-B loop started", {
        loopStart: loopStart.toFixed(3),
        loopEnd: loopEnd.toFixed(3),
        visualStart: this._loopStartVisual,
        visualEnd: this._loopEndVisual,
      });
    }

    if (this.part) {
      this.part.stop("+0");
      this.part.cancel("+0");
      (this.part as Tone.Part).start("+0", 0);
    }

    const visualStart =
      this._loopStartVisual !== null ? this._loopStartVisual : 0;
    this.scheduleVisualUpdate(() => this.pianoRoll.setTime(visualStart));
    this.state.currentTime = visualStart;

    if (this.isAudioActive()) {
      this.startActiveAudioAt(visualStart);
    }
  };

  setupTransportCallbacks(): void {
    this.removeTransportCallbacks();
    Tone.getTransport().on("stop", this.handleTransportStop);
    Tone.getTransport().on("pause", this.handleTransportPause);
    Tone.getTransport().on("loop", this.handleTransportLoop);
  }

  removeTransportCallbacks(): void {
    Tone.getTransport().off("stop", this.handleTransportStop);
    Tone.getTransport().off("pause", this.handleTransportPause);
    Tone.getTransport().off("loop", this.handleTransportLoop);
  }
}