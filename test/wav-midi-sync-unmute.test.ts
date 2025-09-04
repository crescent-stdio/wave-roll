/**
 * Test for WAV and MIDI synchronization when unmuting tracks
 * 
 * This test verifies that when all tracks are muted and then unmuted,
 * WAV and MIDI files start playing from the same position.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import * as Tone from 'tone';
import { AudioPlayer } from '../src/lib/core/audio/audio-player';
import { NoteData } from '../src/lib/midi/types';

describe('WAV and MIDI Synchronization on Unmute', () => {
  let audioPlayer: AudioPlayer;
  let mockPianoRoll: any;
  let mockMidiManager: any;
  let testNotes: NoteData[];

  beforeEach(() => {
    // Reset Tone.js transport
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    Tone.getTransport().seconds = 0;

    // Mock piano roll
    mockPianoRoll = {
      setTime: vi.fn(),
    };

    // Mock MIDI manager with multiple files
    mockMidiManager = {
      getState: vi.fn(() => ({
        files: [
          { id: 'midi-1', isMuted: false },
          { id: 'midi-2', isMuted: false },
        ],
      })),
      setFileMute: vi.fn(),
    };

    // Create test notes for 2 MIDI files
    testNotes = [
      // File 1 notes
      { time: 0, duration: 0.5, name: 'C4', velocity: 0.8, fileId: 'midi-1' },
      { time: 0.5, duration: 0.5, name: 'D4', velocity: 0.8, fileId: 'midi-1' },
      { time: 1.0, duration: 0.5, name: 'E4', velocity: 0.8, fileId: 'midi-1' },
      // File 2 notes
      { time: 0, duration: 0.5, name: 'G4', velocity: 0.8, fileId: 'midi-2' },
      { time: 0.5, duration: 0.5, name: 'A4', velocity: 0.8, fileId: 'midi-2' },
      { time: 1.0, duration: 0.5, name: 'B4', velocity: 0.8, fileId: 'midi-2' },
    ];

    // Mock WAV audio registry
    (global as any)._waveRollAudio = {
      getFiles: vi.fn(() => [
        {
          id: 'wav-1',
          url: 'test-audio-1.wav',
          isVisible: true,
          isMuted: false,
        },
        {
          id: 'wav-2',
          url: 'test-audio-2.wav',
          isVisible: true,
          isMuted: false,
        },
      ]),
    };

    // Create audio player instance
    audioPlayer = new AudioPlayer(testNotes, mockPianoRoll, {
      tempo: 120,
      volume: 0.7,
      repeat: false,
    }, mockMidiManager);
  });

  test('WAV and MIDI should be synchronized when unmuting during playback', async () => {
    // Start playback
    await audioPlayer.play();
    
    // Let some time pass (simulate playback for 1 second)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mute all tracks
    audioPlayer.setFileMute('midi-1', true);
    audioPlayer.setFileMute('midi-2', true);
    audioPlayer.setFileMute('wav-1', true);
    audioPlayer.setFileMute('wav-2', true);
    
    // Playback should auto-pause
    const stateAfterMute = audioPlayer.getState();
    expect(stateAfterMute.isPlaying).toBe(false);
    
    // Record the position where playback was paused
    const pausedPosition = stateAfterMute.currentTime;
    console.log('Paused at position:', pausedPosition);
    
    // Unmute one MIDI and one WAV track
    audioPlayer.setFileMute('midi-1', false);
    audioPlayer.setFileMute('wav-1', false);
    
    // Wait a bit for auto-resume
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check that playback resumed
    const stateAfterUnmute = audioPlayer.getState();
    expect(stateAfterUnmute.isPlaying).toBe(true);
    
    // Verify that both WAV and MIDI resumed from the same position
    // This is the critical test - they should be synchronized
    const resumedPosition = stateAfterUnmute.currentTime;
    expect(resumedPosition).toBeCloseTo(pausedPosition, 1);
  });

  test('All tracks should start from the same position when unmuting', async () => {
    // Mute all tracks before starting
    audioPlayer.setFileMute('midi-1', true);
    audioPlayer.setFileMute('midi-2', true);
    audioPlayer.setFileMute('wav-1', true);
    audioPlayer.setFileMute('wav-2', true);
    
    // Try to play (should fail)
    await audioPlayer.play();
    expect(audioPlayer.getState().isPlaying).toBe(false);
    
    // Unmute tracks
    audioPlayer.setFileMute('midi-1', false);
    audioPlayer.setFileMute('wav-1', false);
    
    // Now play should work
    await audioPlayer.play();
    expect(audioPlayer.getState().isPlaying).toBe(true);
    
    // All tracks should start from position 0
    const state = audioPlayer.getState();
    expect(state.currentTime).toBeCloseTo(0, 1);
    
    // Verify transport is also at 0
    expect(Tone.getTransport().seconds).toBeCloseTo(0, 1);
  });

  test('Tracks unmuted at different times should sync to current position', async () => {
    // Start with one track playing
    audioPlayer.setFileMute('midi-2', true);
    audioPlayer.setFileMute('wav-2', true);
    
    await audioPlayer.play();
    
    // Play for 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const positionBeforeUnmute = audioPlayer.getState().currentTime;
    console.log('Position before unmuting additional tracks:', positionBeforeUnmute);
    
    // Unmute additional tracks while playing
    audioPlayer.setFileMute('midi-2', false);
    audioPlayer.setFileMute('wav-2', false);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // All tracks should be playing from the same position
    const positionAfterUnmute = audioPlayer.getState().currentTime;
    
    // Position should have continued advancing, not reset
    expect(positionAfterUnmute).toBeGreaterThanOrEqual(positionBeforeUnmute);
    
    // The newly unmuted tracks should have caught up to this position
    // (This tests the retriggerHeldNotes functionality)
  });
});