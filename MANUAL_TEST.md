# Manual Test: Visual Play-Head & Pause Control

## Test Steps

1. **Load Demo**
   - Open the demo page at `http://localhost:3003/`
   - Load a MIDI file using either file upload or URL input

2. **Create Synchronized Player**
   - Click "Create Synchronized Player" button
   - Verify the PixiJS piano roll appears with audio controls

3. **Test Play/Pause Cycle**
   - Click "Play" button
   - **Expected**: Console shows "playing" message
   - **Expected**: Button changes to "Pause"
   - **Expected**: Solid red (#ff0000) vertical playhead line appears at fixed position (30% from left)
   - **Expected**: Piano roll content smoothly glides left with jitter ≤1px/frame
   - **Expected**: Console.debug shows `[roll]` messages with time/offset data
   - **Expected**: Audio playback starts

4. **Test Pause**
   - Click "Pause" button  
   - **Expected**: Console shows "paused" message
   - **Expected**: Button changes to "Play"
   - **Expected**: Piano roll content stops scrolling instantly and freezes
   - **Expected**: Red playhead line remains at fixed position
   - **Expected**: Audio playback stops immediately

5. **Test Resume**
   - Click "Play" button again
   - **Expected**: Console shows "playing" message
   - **Expected**: Button changes to "Pause"
   - **Expected**: Piano roll content resumes scrolling from the same time position
   - **Expected**: Audio playback resumes seamlessly

## Success Criteria

**Visual Sync**: Piano roll content scrolls smoothly with ≤16ms drift from audio clock  
**Pause Control**: Button correctly toggles between play/pause states  
**State Persistence**: Pause position is maintained when resuming playback  
**Console Logs**: Clear "paused" and "playing" messages appear in dev console  
**UI Consistency**: Button text accurately reflects current player state