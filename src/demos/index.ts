// Register <wave-roll-multi-midi> custom element.
//  • 상대경로를 사용하여 Vite dev-server 뿐 아니라 정적 file:// 로 열어도 동작하도록 한다.
//  • index.ts 는 src/demos/ 에 있으므로 한 단계 위로 올라간 뒤 lib/… 경로를 지정한다.
import "../lib/components/player/wave-roll-multi-midi/element";

// Re-export factory for external usage (optional)
export { createWaveRollMultiMidiPlayer } from "../lib/components/player/wave-roll-multi-midi/player";
