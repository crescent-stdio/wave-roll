/**
 * SVG Icons for player controls
 * Used in Audio Player UI
 *
 * Design System:
 * - Base Grid: 24x24 viewBox
 * - Style: Lucide/Feather (clean lines, rounded corners)
 * - Attributes: stroke="currentColor", stroke-width="2", fill="none"
 */

import { prepareSvg } from "./icon-utils";

import playRaw from "./icons/player/play.svg?raw";
import pauseRaw from "./icons/player/pause.svg?raw";
import restartRaw from "./icons/player/restart.svg?raw";
import repeatRaw from "./icons/player/repeat.svg?raw";
import volumeRaw from "./icons/player/volume.svg?raw";
import muteRaw from "./icons/player/mute.svg?raw";
import tempoRaw from "./icons/player/tempo.svg?raw";
import skipForwardRaw from "./icons/player/skip-forward.svg?raw";
import skipBackwardRaw from "./icons/player/skip-backward.svg?raw";
import shuffleRaw from "./icons/player/shuffle.svg?raw";
import listRaw from "./icons/player/list.svg?raw";
import menuRaw from "./icons/player/menu.svg?raw";
import midiRaw from "./icons/player/midi.svg?raw";
import zoomResetRaw from "./icons/player/zoom-reset.svg?raw";
import settingsRaw from "./icons/player/settings.svg?raw";
import loopStartRaw from "./icons/player/loop-start.svg?raw";
import eyeOpenRaw from "./icons/player/eye-open.svg?raw";
import eyeClosedRaw from "./icons/player/eye-closed.svg?raw";
import pinRaw from "./icons/player/pin.svg?raw";
import editRaw from "./icons/player/edit.svg?raw";
import duplicateRaw from "./icons/player/duplicate.svg?raw";
import trashRaw from "./icons/player/trash.svg?raw";
import paletteRaw from "./icons/player/palette.svg?raw";
import sustainRaw from "./icons/player/sustain.svg?raw";
import estRaw from "./icons/player/est.svg?raw";
import fileRaw from "./icons/player/file.svg?raw";
import resultsRaw from "./icons/player/results.svg?raw";
import gridBeatRaw from "./icons/player/grid-beat.svg?raw";
import tempoSyncRaw from "./icons/player/tempo-sync.svg?raw";
import snapToGridRaw from "./icons/player/snap-to-grid.svg?raw";

export const PLAYER_ICONS = {
  play: prepareSvg(playRaw),
  pause: prepareSvg(pauseRaw),
  restart: prepareSvg(restartRaw),
  repeat: prepareSvg(repeatRaw),
  volume: prepareSvg(volumeRaw),
  mute: prepareSvg(muteRaw),
  tempo: prepareSvg(tempoRaw),
  skip_forward: prepareSvg(skipForwardRaw),
  skip_backward: prepareSvg(skipBackwardRaw),
  shuffle: prepareSvg(shuffleRaw),
  list: prepareSvg(listRaw),
  menu: prepareSvg(menuRaw),
  midi: prepareSvg(midiRaw),
  zoom_reset: prepareSvg(zoomResetRaw),
  settings: prepareSvg(settingsRaw),
  loop_start: prepareSvg(loopStartRaw),
  eye_open: prepareSvg(eyeOpenRaw),
  eye_closed: prepareSvg(eyeClosedRaw),
  pin: prepareSvg(pinRaw),
  edit: prepareSvg(editRaw),
  duplicate: prepareSvg(duplicateRaw),
  trash: prepareSvg(trashRaw),
  palette: prepareSvg(paletteRaw),
  sustain: prepareSvg(sustainRaw),
  est: prepareSvg(estRaw),
  file: prepareSvg(fileRaw),
  results: prepareSvg(resultsRaw),
  grid_beat: prepareSvg(gridBeatRaw),
  tempo_sync: prepareSvg(tempoSyncRaw),
  snap_to_grid: prepareSvg(snapToGridRaw),
};
