import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
import { ControlChangeEvent } from "@/lib/midi/types";
import { getColorForFile } from "../utils/get-color-for-file";

export function renderSustains(pianoRoll: PianoRoll): void {
  const g = pianoRoll.sustainOverlay;
  g.clear();

  // 1) Gather sustain-pedal CC events (controller 64) grouped by fileId
  const sustainEvents = pianoRoll.controlChanges
    .filter((cc) => cc.controller === 64)
    .sort((a, b) => a.time - b.time);

  // Organise events per originating file so we can apply per-track colours.
  const grouped: Record<string, ControlChangeEvent[]> = {};
  sustainEvents.forEach((cc) => {
    const fid = cc.fileId ?? "_unknown";
    (grouped[fid] = grouped[fid] || []).push(cc);
  });

  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
  const pxPerSec = pianoRoll.timeScale(1) * pianoRoll.state.zoomX;

  // Cache used by `getColorForFile` to avoid repeated scans over the notes
  // array when resolving colours for multiple sustain segments.
  const colorCache: Record<string, number> = {};

  type Segment = { start: number; end: number; fid: string };
  const segments: Segment[] = [];

  // Build sustain segments for each file separately
  Object.entries(grouped).forEach(([fid, events]) => {
    let isDown = false;
    let segStart = 0;
    events.forEach((cc) => {
      if (cc.value >= 0.5) {
        if (!isDown) {
          isDown = true;
          segStart = cc.time;
        }
      } else if (isDown) {
        segments.push({ start: segStart, end: cc.time, fid });
        isDown = false;
      }
    });

    // Pedal held till track end
    if (isDown) {
      const lastNoteEnd = pianoRoll.notes.length
        ? Math.max(...pianoRoll.notes.map((n) => n.time + n.duration))
        : events[events.length - 1].time;
      segments.push({ start: segStart, end: lastNoteEnd, fid });
    }
  });

  // 2) Draw translucent overlays
  segments.forEach(({ start, end, fid }) => {
    if (end <= start) return;
    const x = start * pxPerSec + pianoRoll.state.panX + pianoKeysOffset;
    const width = (end - start) * pxPerSec;
    if (width <= 0) return;

    const color = getColorForFile(pianoRoll, fid, colorCache);
    const alpha = 0.2;

    g.rect(x, 0, width, pianoRoll.options.height);
    g.fill({ color, alpha });
  });
}
