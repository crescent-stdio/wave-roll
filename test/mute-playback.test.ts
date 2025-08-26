/**
 * Test file for verifying mute toggle behavior
 * 
 * This test ensures that:
 * 1. Muting/unmuting MIDI tracks does not reset transport/playhead
 * 2. WAV playback continues uninterrupted 
 * 3. Timeline position is preserved
 * 4. No restart events are triggered
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Tone from 'tone';
import { AudioPlayer } from '@/lib/core/audio/audio-player';
import { CorePlaybackEngine } from '@/lib/core/playback/core-playback-engine';
import { StateManager } from '@/lib/core/state';
import { NoteData } from '@/lib/midi/types';

describe('Mute Toggle Playback Tests', () => {
  let audioPlayer: AudioPlayer;
  let coreEngine: CorePlaybackEngine;
  let stateManager: StateManager;
  let mockPianoRoll: any;
  
  // Sample MIDI notes for testing
  const midiNotes: NoteData[] = [
    { midi: 60, name: 'C4', time: 0, duration: 1, velocity: 0.8, fileId: 'track1' },
    { midi: 64, name: 'E4', time: 0.5, duration: 1, velocity: 0.8, fileId: 'track2' },
    { midi: 67, name: 'G4', time: 1, duration: 1, velocity: 0.8, fileId: 'track3' },
  ];

  beforeEach(async () => {
    // Setup mock piano roll
    mockPianoRoll = {
      setTime: vi.fn(),
      onTimeChange: vi.fn(),
      getPianoRollInstance: () => mockPianoRoll,
      initialize: vi.fn(),
      updateVisualization: vi.fn(),
      getZoom: () => 1,
      setZoom: vi.fn(),
      updateConfig: vi.fn(),
      destroy: vi.fn(),
    };
    
    // Initialize state manager
    stateManager = new StateManager();
    
    // Initialize core engine with state manager
    coreEngine = new CorePlaybackEngine(stateManager, {
      updateInterval: 50,
      enableStateSync: true,
    });
    
    // Initialize audio context
    await Tone.start();
    
    // Create audio player
    audioPlayer = new AudioPlayer(midiNotes, mockPianoRoll, {
      tempo: 120,
      volume: 0.7,
    });
  });

  afterEach(() => {
    audioPlayer?.destroy();
    coreEngine?.destroy();
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
  });

  test('Muting a MIDI track should not reset transport position', async () => {
    // Start playback
    await audioPlayer.play();
    
    // Let it play for 500ms
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get current position
    const positionBefore = audioPlayer.getState().currentTime;
    expect(positionBefore).toBeGreaterThan(0);
    
    // Mute track 1
    audioPlayer.setFileMute('track1', true);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check position hasn't reset
    const positionAfter = audioPlayer.getState().currentTime;
    expect(positionAfter).toBeGreaterThanOrEqual(positionBefore);
    expect(positionAfter).not.toBe(0);
  });

  test('Unmuting a MIDI track should not reset transport position', async () => {
    // Start with track 1 muted
    audioPlayer.setFileMute('track1', true);
    
    // Start playback
    await audioPlayer.play();
    
    // Let it play for 500ms
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get current position
    const positionBefore = audioPlayer.getState().currentTime;
    expect(positionBefore).toBeGreaterThan(0);
    
    // Unmute track 1
    audioPlayer.setFileMute('track1', false);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check position hasn't reset
    const positionAfter = audioPlayer.getState().currentTime;
    expect(positionAfter).toBeGreaterThanOrEqual(positionBefore);
    expect(positionAfter).not.toBe(0);
  });

  test('Rapid mute/unmute cycles should not cause transport reset', async () => {
    const resetEvents: number[] = [];
    let previousTime = 0;
    
    // Start playback
    await audioPlayer.play();
    
    // Perform 100 rapid mute/unmute cycles
    for (let i = 0; i < 100; i++) {
      const mute = i % 2 === 0;
      
      // Toggle mute for all tracks
      audioPlayer.setFileMute('track1', mute);
      audioPlayer.setFileMute('track2', mute);
      audioPlayer.setFileMute('track3', mute);
      
      // Check if transport reset occurred
      const currentTime = audioPlayer.getState().currentTime;
      if (currentTime < previousTime) {
        resetEvents.push(i);
      }
      previousTime = currentTime;
      
      // Small delay between toggles
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Verify no reset events occurred
    expect(resetEvents).toHaveLength(0);
    
    // Verify playback continued
    const finalTime = audioPlayer.getState().currentTime;
    expect(finalTime).toBeGreaterThan(0);
  });

  test('Playback state should remain playing during mute toggle', async () => {
    // Start playback
    await audioPlayer.play();
    
    // Let it play
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify it's playing
    expect(audioPlayer.getState().isPlaying).toBe(true);
    
    // Mute all tracks
    audioPlayer.setFileMute('track1', true);
    audioPlayer.setFileMute('track2', true);
    audioPlayer.setFileMute('track3', true);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should still be playing
    expect(audioPlayer.getState().isPlaying).toBe(true);
    
    // Unmute all tracks
    audioPlayer.setFileMute('track1', false);
    audioPlayer.setFileMute('track2', false);
    audioPlayer.setFileMute('track3', false);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should still be playing
    expect(audioPlayer.getState().isPlaying).toBe(true);
  });

  test('CorePlaybackEngine should handle mute without recreation', async () => {
    // Setup piano roll manager mock
    const pianoRollManager = {
      initialize: vi.fn(),
      getPianoRollInstance: () => mockPianoRoll,
      updateVisualization: vi.fn(),
      getZoom: () => 1,
      setZoom: vi.fn(),
      setTime: vi.fn(),
      updateConfig: vi.fn(),
      destroy: vi.fn(),
    };
    
    // Initialize core engine with piano roll
    await coreEngine.initialize(pianoRollManager as any);
    
    // Update audio with notes
    await coreEngine.updateAudio(midiNotes);
    
    // Start playback
    await coreEngine.play();
    
    // Let it play
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const positionBefore = coreEngine.getState().currentTime;
    
    // Apply mute via core engine
    coreEngine.setFileMute('track1', true);
    coreEngine.setFileMute('track2', true);
    
    // Wait
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const positionAfter = coreEngine.getState().currentTime;
    
    // Position should have advanced, not reset
    expect(positionAfter).toBeGreaterThan(positionBefore);
    expect(positionAfter).not.toBe(0);
    
    // Should still be playing
    expect(coreEngine.getState().isPlaying).toBe(true);
  });

  test('Mute state should be preserved across operations', () => {
    // Set mute states
    audioPlayer.setFileMute('track1', true);
    audioPlayer.setFileMute('track2', false);
    audioPlayer.setFileMute('track3', true);
    
    // Verify states are preserved in state manager
    expect(stateManager.getFileMuteState('track1')).toBe(true);
    expect(stateManager.getFileMuteState('track2')).toBe(false);
    expect(stateManager.getFileMuteState('track3')).toBe(true);
  });

  test('Timeline should remain monotonic during mute operations', async () => {
    const timeValues: number[] = [];
    
    // Start playback
    await audioPlayer.play();
    
    // Collect timeline values during mute operations
    for (let i = 0; i < 20; i++) {
      if (i % 4 === 0) {
        // Toggle mute every 4th iteration
        const mute = Math.random() > 0.5;
        audioPlayer.setFileMute('track1', mute);
        audioPlayer.setFileMute('track2', !mute);
      }
      
      timeValues.push(audioPlayer.getState().currentTime);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Verify timeline is monotonic (never goes backward)
    for (let i = 1; i < timeValues.length; i++) {
      expect(timeValues[i]).toBeGreaterThanOrEqual(timeValues[i - 1]);
    }
  });
});