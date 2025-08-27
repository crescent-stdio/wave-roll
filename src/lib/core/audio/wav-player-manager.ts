/**
 * WAV Player Manager
 * Handles WAV/audio file playback using Tone.js GrainPlayer
 */

import * as Tone from "tone";

export interface AudioPlayerEntry {
  player: Tone.GrainPlayer;
  panner: Tone.Panner;
  url: string;
  muted?: boolean;
}

export class WavPlayerManager {
  private audioPlayers = new Map<string, AudioPlayerEntry>();
  private activeAudioId: string | null = null;

  constructor(
    private state: any,
    private options: any
  ) {}

  getAudioPlayers() {
    return this.audioPlayers;
  }

  getActiveAudioId() {
    return this.activeAudioId;
  }

  setupAudioPlayersFromRegistry(): void {
    try {
      const api = (window as any)._waveRollAudio;
      if (!api?.getFiles) return;

      const items = api.getFiles() as Array<{
        id: string;
        url: string;
        isVisible: boolean;
        isMuted: boolean;
        audioBuffer?: AudioBuffer;
        pan?: number;
      }>;

      // Clean up players for removed items
      this.audioPlayers.forEach((entry, id) => {
        if (!items.find((it) => it.id === id)) {
          entry.player.dispose();
          entry.panner.dispose();
          this.audioPlayers.delete(id);
        }
      });

      // Create/refresh players
      for (const it of items) {
        if (!this.audioPlayers.has(it.id)) {
          try {
            const panner = new Tone.Panner(it.pan ?? 0).toDestination();
            
            const player = new Tone.GrainPlayer({
              url: it.url,
              onload: () => {
                console.debug(`Audio buffer loaded for ${it.id}`);
              },
              onerror: (error: Error) => {
                console.warn(`Audio file could not be loaded for ${it.id}:`, error.message);
                setTimeout(() => {
                  if (this.audioPlayers.has(it.id)) {
                    const entry = this.audioPlayers.get(it.id);
                    if (entry) {
                      entry.player.dispose();
                      entry.panner.dispose();
                      this.audioPlayers.delete(it.id);
                    }
                  }
                }, 100);
              }
            }).connect(panner);
            
            player.grainSize = 0.1;
            player.overlap = 0.05;
            const volumeValue = it.isMuted
              ? 0
              : (this.state?.volume ?? this.options.volume);
            player.volume.value = Tone.gainToDb(volumeValue);
            if (this.state?.playbackRate) {
              player.playbackRate = this.state.playbackRate / 100;
            }
            this.audioPlayers.set(it.id, { player, panner, url: it.url });
          } catch (error) {
            console.error(`Failed to create audio player for ${it.id}:`, error);
          }
        } else {
          const entry = this.audioPlayers.get(it.id)!;
          entry.panner.pan.value = Math.max(-1, Math.min(1, it.pan ?? 0));

          const volumeValue = it.isMuted
            ? 0
            : (this.state?.volume ?? this.options.volume);
          entry.player.volume.value = Tone.gainToDb(volumeValue);

          if (entry.url !== it.url) {
            entry.player.dispose();
            entry.url = it.url;
            entry.player = new Tone.GrainPlayer(it.url, () => {
              // Buffer loaded callback
            }).connect(entry.panner);
            entry.player.grainSize = 0.1;
            entry.player.overlap = 0.05;
            entry.player.volume.value = Tone.gainToDb(volumeValue);
            if (this.state?.playbackRate) {
              entry.player.playbackRate = this.state.playbackRate / 100;
            }
          }
        }
      }

      const eligible = items.filter((i) => i.isVisible && !i.isMuted);
      this.activeAudioId = eligible.length > 0 ? eligible[0].id : null;

      const audioDurations = items
        .map((i) => i.audioBuffer?.duration || 0)
        .filter((d) => d > 0);
      if (audioDurations.length > 0) {
        const maxAudioDur = Math.max(...audioDurations);
        if (maxAudioDur > this.state.duration) {
          this.state.duration = maxAudioDur;
        }
      }
    } catch {
      // registry not present -> ignore
    }
  }

  isAudioActive(): boolean {
    return (
      this.activeAudioId !== null && this.audioPlayers.has(this.activeAudioId)
    );
  }

  stopAllAudioPlayers(): void {
    this.audioPlayers.forEach(({ player }) => {
      try {
        player.stop("+0");
      } catch {}
    });
  }

  startActiveAudioAt(offsetSeconds: number): void {
    const api = (window as any)._waveRollAudio;
    if (!api?.getFiles) return;

    const items = api.getFiles() as Array<{
      id: string;
      isVisible: boolean;
      isMuted: boolean;
    }>;

    items.forEach((item) => {
      const localEntry = this.audioPlayers.get(item.id);
      const isMuted = item.isMuted || localEntry?.muted;
      
      if (!item.isVisible || isMuted) return;

      const entry = this.audioPlayers.get(item.id);
      if (!entry) return;
      
      // Mark entry as not muted when starting
      (entry as any).muted = false;

      const buffer: any = (entry.player as any).buffer;
      if (!buffer || buffer.loaded === false) {
        try {
          const maybePromise = (entry.player as any).load?.(entry.url);
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise
              .then(() => {
                try {
                  entry.player.stop("+0");
                } catch {}
                try {
                  entry.player.start("+0", Math.max(0, offsetSeconds));
                } catch {}
              })
              .catch(() => {
                // Silently ignore
              });
          }
        } catch {
          // Ignore
        }
        return;
      }

      try {
        entry.player.stop("+0");
      } catch {}
      try {
        entry.player.start("+0", Math.max(0, offsetSeconds));
      } catch {}
    });
  }

  updatePlaybackRate(rate: number): void {
    const speedMultiplier = rate / 100;
    this.audioPlayers.forEach(({ player }) => {
      if (player) {
        player.playbackRate = speedMultiplier;
      }
    });
  }

  dispose(): void {
    this.audioPlayers.forEach(({ player, panner }) => {
      try {
        player.dispose();
      } catch {}
      try {
        panner.dispose();
      } catch {}
    });
    this.audioPlayers.clear();
  }
}