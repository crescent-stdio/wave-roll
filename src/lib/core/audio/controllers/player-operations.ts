/**
 * AudioPlayer operation implementations
 *
 * 이 모듈은 거대한 AudioPlayer 클래스의 동작 메서드 구현을 모아둔 컨트롤러로,
 * AudioPlayer 본체는 얇은 위임만 수행하도록 합니다. 외부 공개 API와 동작은 변경하지 않습니다.
 */

import * as Tone from "tone";
import { clamp } from "../../utils";
import { AUDIO_CONSTANTS, AudioPlayerState } from "../player-types";
import type { AudioPlayer } from "../audio-player"; // type-only import to avoid runtime cycles

/** Initialize audio resources */
export async function initialize(self: AudioPlayer): Promise<void> {
  // @ts-ignore accessing private for internal impl
  if ((self as any).isInitialized) return;

  if (Tone.context.state === "suspended") {
    await Tone.start();
  }

  const transport = Tone.getTransport();
  // @ts-ignore
  transport.bpm.value = (self as any).options.tempo;
  // @ts-ignore
  transport.loop = (self as any).options.repeat;
  // @ts-ignore
  transport.loopStart = 0;
  // @ts-ignore
  transport.loopEnd = (self as any).state.duration;

  // Sampler 초기화
  // @ts-ignore
  await (self as any).samplerManager.initialize({
    // @ts-ignore
    soundFont: (self as any).options.soundFont,
    // @ts-ignore
    volume: (self as any).options.volume,
  });

  // WAV 플레이어 준비
  // @ts-ignore
  (self as any).wavPlayerManager.setupAudioPlayersFromRegistry({
    // @ts-ignore
    volume: (self as any).state.volume,
    // @ts-ignore
    playbackRate: (self as any).state.playbackRate,
  });

  // 오디오 길이에 따라 duration 갱신
  // @ts-ignore
  const maxAudioDur = (self as any).wavPlayerManager.getMaxAudioDuration();
  if (maxAudioDur > (self as any).state.duration) {
    // @ts-ignore
    (self as any).state.duration = maxAudioDur;
  }

  // Note Part 구성
  // @ts-ignore
  (self as any).samplerManager.setupNotePart(
    // @ts-ignore
    (self as any).loopManager.loopStartVisual,
    // @ts-ignore
    (self as any).loopManager.loopEndVisual,
    {
      // @ts-ignore
      repeat: (self as any).options.repeat,
      // @ts-ignore
      duration: (self as any).state.duration,
      // @ts-ignore
      tempo: (self as any).state.tempo,
      // @ts-ignore
      originalTempo: (self as any).originalTempo,
    }
  );

  setupTransportCallbacks(self);

  // @ts-ignore
  (self as any).isInitialized = true;
}

/** Register transport event callbacks */
export function setupTransportCallbacks(self: AudioPlayer): void {
  removeTransportCallbacks(self);
  // @ts-ignore
  Tone.getTransport().on("stop", (self as any).handleTransportStop);
  // @ts-ignore
  Tone.getTransport().on("pause", (self as any).handleTransportPause);
  // @ts-ignore
  Tone.getTransport().on("loop", (self as any).handleTransportLoop);
}

/** Remove registered transport callbacks */
export function removeTransportCallbacks(self: AudioPlayer): void {
  // @ts-ignore
  Tone.getTransport().off("stop", (self as any).handleTransportStop);
  // @ts-ignore
  Tone.getTransport().off("pause", (self as any).handleTransportPause);
  // @ts-ignore
  Tone.getTransport().off("loop", (self as any).handleTransportLoop);
}

/** Start or resume playback */
export async function play(self: AudioPlayer): Promise<void> {
  // Prevent concurrent play() calls
  // @ts-ignore
  if ((self as any)._playLock) {
    console.warn("[AudioPlayer.play] Ignored - already in progress");
    return;
  }
  // @ts-ignore
  (self as any)._playLock = true;

  try {
    if (Tone.context.state === "suspended") {
      await Tone.start();
    }

    // @ts-ignore
    if (!(self as any).isInitialized) {
      await initialize(self);
    }

    // @ts-ignore
    if ((self as any).state.isPlaying) {
      return;
    }

    // Always refresh WAV registry on play
    // @ts-ignore
    (self as any).wavPlayerManager.setupAudioPlayersFromRegistry({
      // @ts-ignore
      volume: (self as any).state.volume,
      // @ts-ignore
      playbackRate: (self as any).state.playbackRate,
    });

    try {
      await Tone.loaded();
    } catch {}

    // @ts-ignore
    if ((self as any).pausedTime > 0) {
      // Resume
      // @ts-ignore
      Tone.getTransport().seconds = (self as any).pausedTime;

      // Rebuild Part on resume
      // @ts-ignore
      (self as any).samplerManager.setupNotePart(
        // @ts-ignore
        (self as any).loopManager.loopStartVisual,
        // @ts-ignore
        (self as any).loopManager.loopEndVisual,
        {
          // @ts-ignore
          repeat: (self as any).options.repeat,
          // @ts-ignore
          duration: (self as any).state.duration,
        }
      );
      // @ts-ignore
      const offsetForPart = (self as any).pausedTime;
      // @ts-ignore
      (self as any).samplerManager.startPart("+0.01", offsetForPart);

      // WAV start at visual position
      // @ts-ignore
      const resumeVisual = ((self as any).pausedTime * (self as any).state.tempo) / (self as any).originalTempo;
      // @ts-ignore
      (self as any).wavPlayerManager.startActiveAudioAt(resumeVisual, "+0.01");
    } else {
      // Start from beginning or current visual
      // @ts-ignore
      const resumeVisual = (self as any).state.currentTime > 0 ? (self as any).state.currentTime : 0;
      // @ts-ignore
      const resumeTransport = (resumeVisual * (self as any).originalTempo) / (self as any).state.tempo;

      Tone.getTransport().seconds = resumeTransport;
      // @ts-ignore
      (self as any).pausedTime = resumeTransport;
      // @ts-ignore
      (self as any).pianoRoll.setTime(resumeVisual);

      // Rebuild Part
      // @ts-ignore
      (self as any).samplerManager.setupNotePart(
        // @ts-ignore
        (self as any).loopManager.loopStartVisual,
        // @ts-ignore
        (self as any).loopManager.loopEndVisual,
        {
          // @ts-ignore
          repeat: (self as any).options.repeat,
          // @ts-ignore
          duration: (self as any).state.duration,
        }
      );
      // @ts-ignore
      (self as any).samplerManager.startPart("+0.01", resumeTransport);
      // @ts-ignore
      (self as any).wavPlayerManager.startActiveAudioAt(resumeVisual, "+0.01");
    }

    Tone.getTransport().start("+0.01");
    // @ts-ignore
    ;(self as any).state.isPlaying = true;
    // @ts-ignore
    (self as any)._autoPausedBySilence = false;
    // @ts-ignore
    (self as any).transportSyncManager.startSyncScheduler();
  } catch (error: any) {
    console.error("Failed to start playback:", error);
    throw new Error(`Playback failed: ${error?.message ?? "Unknown error"}`);
  } finally {
    // @ts-ignore
    (self as any)._playLock = false;
  }
}

/** Pause playback */
export function pause(self: AudioPlayer): void {
  const transport = Tone.getTransport();
  if (transport.state === "stopped") return;

  transport.pause();
  // @ts-ignore
  (self as any).state.isPlaying = false;
  // @ts-ignore
  (self as any).pausedTime = transport.seconds;

  // @ts-ignore
  (self as any).transportSyncManager.stopSyncScheduler();
  // @ts-ignore
  (self as any).pianoRoll.setTime((self as any).state.currentTime);
  // @ts-ignore
  (self as any).wavPlayerManager.stopAllAudioPlayers();
}

/** Stop and restart from beginning */
export function restart(self: AudioPlayer): void {
  // @ts-ignore
  const wasPlaying = (self as any).state.isPlaying;
  // @ts-ignore
  if ((self as any).operationState.isRestarting) return;
  // @ts-ignore
  (self as any).operationState.isRestarting = true;

  // @ts-ignore
  (self as any).transportSyncManager.stopSyncScheduler();
  // @ts-ignore
  (self as any).samplerManager.stopPart();

  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel();

  // @ts-ignore
  const visualStart = (self as any).loopManager.loopStartVisual ?? 0;
  // @ts-ignore
  const transportStart = (visualStart * (self as any).originalTempo) / (self as any).state.tempo;
  transport.seconds = transportStart;
  // @ts-ignore
  transport.position = transportStart as unknown as string;

  // @ts-ignore
  (self as any).state.currentTime = visualStart;
  // @ts-ignore
  (self as any).pausedTime = transportStart;

  if (!wasPlaying) {
    // @ts-ignore
    (self as any).pianoRoll.setTime(visualStart);
  }

  if (wasPlaying) {
    // @ts-ignore
    (self as any).samplerManager.setupNotePart(
      // @ts-ignore
      (self as any).loopManager.loopStartVisual,
      // @ts-ignore
      (self as any).loopManager.loopEndVisual,
      {
        // @ts-ignore
        repeat: (self as any).options.repeat,
        // @ts-ignore
        duration: (self as any).state.duration,
        // @ts-ignore
        tempo: (self as any).state.tempo,
        // @ts-ignore
        originalTempo: (self as any).originalTempo,
      }
    );

    const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
    const startTime = Tone.now() + RESTART_DELAY;
    transport.start(startTime);
    // @ts-ignore
    (self as any).samplerManager.startPart(startTime, 0);

    // @ts-ignore
    (self as any).state.isPlaying = true;
    // @ts-ignore
    (self as any).transportSyncManager.startSyncScheduler();

    // @ts-ignore
    (self as any).transportSyncManager.scheduleVisualUpdate(() =>
      // @ts-ignore
      (self as any).pianoRoll.setTime(visualStart)
    );

    // @ts-ignore
    if ((self as any).wavPlayerManager.isAudioActive()) {
      // @ts-ignore
      ;(self as any).wavPlayerManager.startActiveAudioAt(visualStart);
    }
  } else {
    // @ts-ignore
    (self as any).samplerManager.setupNotePart(
      // @ts-ignore
      (self as any).loopManager.loopStartVisual,
      // @ts-ignore
      (self as any).loopManager.loopEndVisual,
      {
        // @ts-ignore
        repeat: (self as any).options.repeat,
        // @ts-ignore
        duration: (self as any).state.duration,
        // @ts-ignore
        tempo: (self as any).state.tempo,
        // @ts-ignore
        originalTempo: (self as any).originalTempo,
      }
    );
  }

  setTimeout(() => {
    // @ts-ignore
    (self as any).operationState.isRestarting = false;
  }, 100);
}

/** Seek to specific time position */
export function seek(self: AudioPlayer, seconds: number, updateVisual: boolean = true): void {
  // @ts-ignore
  (self as any).transportSyncManager.updateSeekTimestamp();
  // @ts-ignore
  (self as any).operationState.pendingSeek = null;
  // @ts-ignore
  (self as any).operationState.isSeeking = true;

  const wasPlaying = Tone.getTransport().state === "started";
  // @ts-ignore
  (self as any).state.isPlaying = wasPlaying;

  // Clamp and convert time
  // @ts-ignore
  const clampedVisual = clamp(seconds, 0, (self as any).state.duration);
  // @ts-ignore
  const transportSeconds = (self as any).transportSyncManager.visualToTransportTime(clampedVisual);

  if (wasPlaying) {
    // Restart-style seek: stop and restart part and WAV in sync
    // @ts-ignore
    (self as any).transportSyncManager.stopSyncScheduler();
    // @ts-ignore
    (self as any).samplerManager.stopPart();

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.seconds = transportSeconds;

    // Rebuild Part for loop window
    // @ts-ignore
    (self as any).samplerManager.setupNotePart(
      // @ts-ignore
      (self as any).loopManager.loopStartVisual,
      // @ts-ignore
      (self as any).loopManager.loopEndVisual,
      {
        // @ts-ignore
        repeat: (self as any).options.repeat,
        // @ts-ignore
        duration: (self as any).state.duration,
        // @ts-ignore
        tempo: (self as any).state.tempo,
        // @ts-ignore
        originalTempo: (self as any).originalTempo,
      }
    );

    const offsetForPart = transportSeconds;
    const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
    const startAt = Tone.now() + RESTART_DELAY;
    transport.start(startAt);
    // @ts-ignore
    (self as any).samplerManager.startPart(startAt, offsetForPart);

    // Restart WAV
    // @ts-ignore
    if ((self as any).wavPlayerManager.isAudioActive()) {
      // @ts-ignore
      (self as any).wavPlayerManager.stopAllAudioPlayers();
      // @ts-ignore
      (self as any).wavPlayerManager.startActiveAudioAt(clampedVisual, startAt);
    }

    // @ts-ignore
    (self as any).state.isPlaying = true;
    // @ts-ignore
    (self as any).transportSyncManager.startSyncScheduler();
  } else {
    Tone.getTransport().seconds = transportSeconds;
  }

  if (updateVisual) {
    // @ts-ignore
    (self as any).pianoRoll.setTime(clampedVisual);
  }

  setTimeout(() => {
    // @ts-ignore
    (self as any).operationState.isSeeking = false;
  }, 50);
}

/** Enable or disable repeat mode */
export function toggleRepeat(self: AudioPlayer, enabled: boolean): void {
  // @ts-ignore
  (self as any).state.isRepeating = enabled;
  // @ts-ignore
  (self as any).loopManager.configureTransportLoop(
    enabled,
    // @ts-ignore
    (self as any).state,
    // @ts-ignore
    (self as any).state.duration
  );
}

/** Set playback volume */
export function setVolume(self: AudioPlayer, volume: number): void {
  const clamped = Math.max(0, Math.min(1, volume));
  // @ts-ignore
  (self as any).samplerManager.setVolume(clamped);
  // @ts-ignore
  (self as any).wavPlayerManager.setVolume(clamped);
  // @ts-ignore
  (self as any).state.volume = clamped;
  // @ts-ignore
  (self as any).options.volume = clamped;
  maybeAutoPauseIfSilent(self);
}

/** Set playback tempo (BPM) */
export function setTempo(self: AudioPlayer, bpm: number): void {
  const clampedTempo = clamp(bpm, AUDIO_CONSTANTS.MIN_TEMPO, AUDIO_CONSTANTS.MAX_TEMPO);
  // @ts-ignore
  const oldTempo = (self as any).state.tempo;
  // @ts-ignore
  (self as any).state.tempo = clampedTempo;
  const ratePct = (clampedTempo / (self as any).originalTempo) * 100;
  // @ts-ignore
  (self as any).state.playbackRate = ratePct;

  // @ts-ignore
  if ((self as any).state.isPlaying) {
    // restart-style tempo change
    // @ts-ignore
    (self as any).operationState.isSeeking = true;
    // @ts-ignore
    (self as any).operationState.isRestarting = true;

    // @ts-ignore
    const currentVisualTime = (self as any).state.currentTime;
    const newTransportSeconds = (currentVisualTime * (self as any).originalTempo) / clampedTempo;

    // @ts-ignore
    (self as any).loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, (self as any).state.duration);
    // @ts-ignore
    (self as any).transportSyncManager.stopSyncScheduler();
    // @ts-ignore
    (self as any).samplerManager.stopPart();

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.bpm.value = clampedTempo;
    // @ts-ignore
    (self as any).loopManager.configureTransportLoop((self as any).state.isRepeating, (self as any).state, (self as any).state.duration);
    transport.seconds = newTransportSeconds;

    // @ts-ignore
    (self as any).samplerManager.setupNotePart(
      // @ts-ignore
      (self as any).loopManager.loopStartVisual,
      // @ts-ignore
      (self as any).loopManager.loopEndVisual,
      {
        // @ts-ignore
        repeat: (self as any).options.repeat,
        // @ts-ignore
        duration: (self as any).state.duration,
        tempo: clampedTempo,
        // @ts-ignore
        originalTempo: (self as any).originalTempo,
      }
    );

    const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
    const startAt = Tone.now() + RESTART_DELAY;
    transport.start(startAt);
    // @ts-ignore
    (self as any).samplerManager.startPart(startAt, newTransportSeconds);

    // @ts-ignore
    try { (self as any).wavPlayerManager.setPlaybackRate(ratePct); } catch {}
    // @ts-ignore
    try { (self as any).wavPlayerManager.stopAllAudioPlayers(); (self as any).wavPlayerManager.startActiveAudioAt(currentVisualTime, startAt); } catch {}

    // @ts-ignore
    (self as any).state.isPlaying = true;
    // @ts-ignore
    (self as any).transportSyncManager.startSyncScheduler();

    setTimeout(() => {
      // @ts-ignore
      (self as any).operationState.isRestarting = false;
    }, 100);
  } else {
    Tone.getTransport().bpm.value = clampedTempo;
    // @ts-ignore
    if ((self as any).pausedTime > 0) {
      // @ts-ignore
      const currentVisualTime = ((self as any).pausedTime * oldTempo) / (self as any).originalTempo;
      // @ts-ignore
      (self as any).pausedTime = (currentVisualTime * (self as any).originalTempo) / clampedTempo;
    }
    // @ts-ignore
    try { (self as any).wavPlayerManager.setPlaybackRate(ratePct); } catch {}
    // @ts-ignore
    (self as any).loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, (self as any).state.duration);
    // @ts-ignore
    (self as any).loopManager.configureTransportLoop((self as any).state.isRepeating, (self as any).state, (self as any).state.duration);
  }
}

/** Set playback rate (percentage) */
export function setPlaybackRate(self: AudioPlayer, rate: number): void {
  const clampedRate = clamp(rate, AUDIO_CONSTANTS.MIN_PLAYBACK_RATE, AUDIO_CONSTANTS.MAX_PLAYBACK_RATE);
  // @ts-ignore
  const oldRate = (self as any).state.playbackRate || 100;
  // @ts-ignore
  const prevTempo = (self as any).state.tempo;
  if (clampedRate === oldRate) return;

  // @ts-ignore
  (self as any).state.playbackRate = clampedRate;
  const speedMultiplier = clampedRate / 100;
  // @ts-ignore
  const newTempo = (self as any).originalTempo * speedMultiplier;
  // @ts-ignore
  (self as any).state.tempo = newTempo;
  // @ts-ignore
  (self as any).loopManager.rescaleLoopForTempoChange(prevTempo, newTempo, (self as any).state.duration);

  // @ts-ignore
  (self as any).wavPlayerManager.setPlaybackRate(clampedRate);

  const wasPlaying = (Tone.getTransport().state === "started") && (self as any).state.isPlaying;
  const transportTime = wasPlaying ? Tone.getTransport().seconds : (self as any).pausedTime;

  Tone.getTransport().bpm.value = newTempo;
  if (!wasPlaying) {
    Tone.getTransport().seconds = transportTime;
  }

  // Rebuild Part
  // @ts-ignore
  (self as any).samplerManager.stopPart();
  // @ts-ignore
  (self as any).samplerManager.setupNotePart(
    // @ts-ignore
    (self as any).loopManager.loopStartVisual,
    // @ts-ignore
    (self as any).loopManager.loopEndVisual,
    {
      // @ts-ignore
      repeat: (self as any).options.repeat,
      // @ts-ignore
      duration: (self as any).state.duration,
      // @ts-ignore
      tempo: (self as any).state.tempo,
      // @ts-ignore
      originalTempo: (self as any).originalTempo,
    }
  );
  if (wasPlaying) {
    // @ts-ignore
    (self as any).samplerManager.startPart("+0.01", transportTime);
  }

  const visualTime = ((Tone.getTransport().seconds) * (self as any).state.tempo) / (self as any).originalTempo;
  // @ts-ignore
  (self as any).state.currentTime = visualTime;
  // @ts-ignore
  (self as any).pianoRoll.setTime(visualTime);

  if (wasPlaying) {
    try {
      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startAt = Tone.now() + RESTART_DELAY;
      // @ts-ignore
      (self as any).wavPlayerManager.stopAllAudioPlayers();
      // @ts-ignore
      (self as any).wavPlayerManager.startActiveAudioAt(visualTime, startAt);
    } catch {}
  }

  // @ts-ignore
  (self as any).loopManager.configureTransportLoop((self as any).state.isRepeating, (self as any).state, (self as any).state.duration);
}

/** Set custom A-B loop points */
export function setLoopPoints(self: AudioPlayer, start: number | null, end: number | null, preservePosition: boolean = false): void {
  // @ts-ignore
  const result = (self as any).loopManager.setLoopPoints(start, end, (self as any).state.duration, (self as any).state as AudioPlayerState);
  if (!result.changed) return;

  if (start === null) {
    toggleRepeat(self, false);
    // @ts-ignore
    (self as any).samplerManager.setupNotePart(null, null, {
      // @ts-ignore
      repeat: (self as any).options.repeat,
      // @ts-ignore
      duration: (self as any).state.duration,
      // @ts-ignore
      tempo: (self as any).state.tempo,
      // @ts-ignore
      originalTempo: (self as any).originalTempo,
    });
    return;
  }

  // @ts-ignore
  (self as any).state.isRepeating = true;
  const transport = Tone.getTransport();
  // @ts-ignore
  const wasPlaying = (self as any).state.isPlaying;
  // @ts-ignore
  const currentPosition = (self as any).state.currentTime;

  // @ts-ignore
  (self as any).samplerManager.stopPart();
  // @ts-ignore
  (self as any).samplerManager.setupNotePart(
    // @ts-ignore
    (self as any).loopManager.loopStartVisual,
    // @ts-ignore
    (self as any).loopManager.loopEndVisual,
    {
      // @ts-ignore
      repeat: (self as any).options.repeat,
      // @ts-ignore
      duration: (self as any).state.duration,
      // @ts-ignore
      tempo: (self as any).state.tempo,
      // @ts-ignore
      originalTempo: (self as any).originalTempo,
    }
  );

  transport.loop = true;
  transport.loopStart = result.transportStart;
  transport.loopEnd = result.transportEnd;

  if (wasPlaying) {
    transport.stop();
    transport.cancel();

    if (preservePosition && result.shouldPreservePosition) {
      const offsetInLoop = currentPosition - (start ?? 0);
      const transportPosition = result.transportStart + (offsetInLoop * (self as any).originalTempo) / (self as any).state.tempo;
      transport.seconds = transportPosition;
      transport.start("+0.01");
      // @ts-ignore
      (self as any).samplerManager.startPart("+0.01", offsetInLoop);
    } else {
      transport.seconds = result.transportStart;
      // @ts-ignore
      (self as any).state.currentTime = start ?? 0;
      // @ts-ignore
      (self as any).pianoRoll.setTime(start ?? 0);
      transport.start("+0.01");
      // @ts-ignore
      (self as any).samplerManager.startPart("+0.01", 0);
    }

    // @ts-ignore
    (self as any).transportSyncManager.startSyncScheduler();

    // WAV
    // @ts-ignore
    if ((self as any).wavPlayerManager.isAudioActive()) {
      // @ts-ignore
      (self as any).wavPlayerManager.stopAllAudioPlayers();
      const audioStartPos = preservePosition && result.shouldPreservePosition ? currentPosition : (start ?? 0);
      // @ts-ignore
      (self as any).wavPlayerManager.startActiveAudioAt(audioStartPos);
    }
  } else {
    if (!preservePosition) {
      transport.seconds = result.transportStart;
      // @ts-ignore
      (self as any).pausedTime = result.transportStart;
      // @ts-ignore
      (self as any).state.currentTime = start ?? 0;
      // @ts-ignore
      (self as any).pianoRoll.setTime(start ?? 0);
    }
  }
}

/** Get shallow-copied state */
export function getState(self: AudioPlayer): AudioPlayerState {
  // @ts-ignore
  return { ...(self as any).state } as AudioPlayerState;
}

/** Clean up resources */
export function destroy(self: AudioPlayer): void {
  removeTransportCallbacks(self);
  const transport = Tone.getTransport();
  if (transport.state !== "stopped") {
    transport.stop();
  }
  transport.cancel();
  // @ts-ignore
  (self as any).transportSyncManager.stopSyncScheduler();
  // @ts-ignore
  (self as any).samplerManager.destroy();
  // @ts-ignore
  (self as any).wavPlayerManager.destroy();
}

/** Set stereo pan for all sources */
export function setPan(self: AudioPlayer, pan: number): void {
  const clamped = Math.max(-1, Math.min(1, pan));
  // @ts-ignore
  (self as any).samplerManager.setPan(clamped);
  // @ts-ignore
  (self as any).wavPlayerManager.setPan(clamped);
  // @ts-ignore
  (self as any).state.pan = clamped;
}

/** Set stereo pan for specific MIDI file */
export function setFilePan(self: AudioPlayer, fileId: string, pan: number): void {
  // @ts-ignore
  (self as any).samplerManager.setFilePan(fileId, pan);
}

/** Set mute for specific MIDI file; handles auto-resume and retrigger */
export function setFileMute(self: AudioPlayer, fileId: string, mute: boolean): void {
  // @ts-ignore
  (self as any).samplerManager.setFileMute(fileId, mute);
  maybeAutoPauseIfSilent(self);

  // If unmuting while playing, retrigger held notes
  // @ts-ignore
  if (!mute && (self as any).state.isPlaying) {
    // Restore master volume if needed
    // @ts-ignore
    if ((self as any).state.volume === 0) {
      // @ts-ignore
      const restore = (self as any).options.volume > 0 ? (self as any).options.volume : 0.7;
      setVolume(self, restore);
    }
    try {
      // @ts-ignore
      (self as any).samplerManager.ensureTrackAudible(fileId, (self as any).state.volume);
    } catch {}
    try {
      // @ts-ignore
      (self as any).samplerManager.retriggerHeldNotes(fileId, (self as any).state.currentTime);
    } catch {}

    try {
      // Reschedule Part at current position
      // @ts-ignore
      const currentVisual = (self as any).state.currentTime;
      const transportSeconds = ((self as any).transportSyncManager as any).visualToTransportTime(currentVisual);
      // @ts-ignore
      (self as any).samplerManager.stopPart();
      // @ts-ignore
      (self as any).samplerManager.setupNotePart(
        // @ts-ignore
        (self as any).loopManager.loopStartVisual,
        // @ts-ignore
        (self as any).loopManager.loopEndVisual,
        {
          // @ts-ignore
          repeat: (self as any).options.repeat,
          // @ts-ignore
          duration: (self as any).state.duration,
          // @ts-ignore
          tempo: (self as any).state.tempo,
          // @ts-ignore
          originalTempo: (self as any).originalTempo,
        }
      );
      // @ts-ignore
      (self as any).samplerManager.startPart("+0", transportSeconds);
    } catch {}
  }

  // If previously auto-paused due to silence, try to resume
  // @ts-ignore
  if (!mute && !(self as any).state.isPlaying && (self as any)._autoPausedBySilence) {
    (async () => {
      try {
        await (self as any).play();
        // @ts-ignore
        if ((self as any).state.volume === 0) {
          // @ts-ignore
          const restore = (self as any).options.volume > 0 ? (self as any).options.volume : 0.7;
          setVolume(self, restore);
        }
        try {
          // @ts-ignore
          (self as any).samplerManager.ensureTrackAudible(fileId, (self as any).state.volume);
        } catch {}
        try {
          setTimeout(() => {
            try {
              // @ts-ignore
              (self as any).samplerManager.retriggerHeldNotes(fileId, (self as any).state.currentTime);
            } catch {}
          }, 30);
        } catch {}
      } catch {}
      // @ts-ignore
      (self as any)._silencePauseGuardUntilMs = Date.now() + 500;
      // @ts-ignore
      (self as any)._autoPausedBySilence = false;
    })();
  }
}

/** Set per-file MIDI volume */
export function setFileVolume(self: AudioPlayer, fileId: string, volume: number): void {
  // @ts-ignore
  (self as any).samplerManager.setFileVolume(fileId, volume, (self as any).state.volume);
  maybeAutoPauseIfSilent(self);
}

/** Set per-file WAV volume. Auto-resume when unmuting from paused. */
export function setWavVolume(self: AudioPlayer, fileId: string, volume: number): void {
  // @ts-ignore
  if (volume > 0 && (self as any).state.volume === 0) {
    // @ts-ignore
    const restore = (self as any).options.volume > 0 ? (self as any).options.volume : 0.7;
    setVolume(self, restore);
  }

  // @ts-ignore
  (self as any).wavPlayerManager.setWavVolume(fileId, volume, (self as any).state.volume, {
    // @ts-ignore
    isPlaying: (self as any).state.isPlaying,
    // @ts-ignore
    currentTime: (self as any).state.currentTime,
  });

  // Auto-resume on unmute while paused
  // @ts-ignore
  if (volume > 0 && !(self as any).state.isPlaying) {
    // @ts-ignore
    (self as any)._silencePauseGuardUntilMs = Date.now() + 500;
    // Call public method so tests spying on player.play() still observe it
    (self as any).play?.().catch(() => {});
  }
  maybeAutoPauseIfSilent(self);
}

/** Refresh audio players from registry (no auto-restart) */
export function refreshAudioPlayers(self: AudioPlayer): void {
  // @ts-ignore
  (self as any).wavPlayerManager.refreshAudioPlayers({
    // @ts-ignore
    isPlaying: (self as any).state.isPlaying,
    // @ts-ignore
    currentTime: (self as any).state.currentTime,
    // @ts-ignore
    volume: (self as any).state.volume,
    // @ts-ignore
    playbackRate: (self as any).state.playbackRate,
  });
  maybeAutoPauseIfSilent(self);
}

/** Handle playback end (non-loop mode) */
export function handlePlaybackEnd(self: AudioPlayer): void {
  // @ts-ignore
  if (!(self as any).state.isRepeating && (self as any).state.isPlaying) {
    // @ts-ignore
    (self as any).pause();
    // @ts-ignore
    (self as any).seek(0);
    // @ts-ignore
    (self as any).options.onPlaybackEnd?.();
  }
}

/** Auto-pause when all sources are silent */
export function maybeAutoPauseIfSilent(self: AudioPlayer): void {
  // @ts-ignore
  if (!(self as any).state.isPlaying) return;
  // @ts-ignore
  if (Date.now() < (self as any)._silencePauseGuardUntilMs) return;
  // @ts-ignore
  if ((self as any).state.volume === 0) { (self as any).pause(); return; }

  // @ts-ignore
  const midiMuted = (self as any).samplerManager.areAllTracksMuted();
  // @ts-ignore
  const wavMuted = (self as any).wavPlayerManager.areAllPlayersMuted();
  if (midiMuted && wavMuted) {
    // @ts-ignore
    (self as any)._autoPausedBySilence = true;
    // @ts-ignore
    (self as any).pause();
  }
}

