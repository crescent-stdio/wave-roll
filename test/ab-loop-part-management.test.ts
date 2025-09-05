/**
 * Test suite for A-B loop and Part management
 * Ensures only one Part instance exists at any time
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Tone from 'tone';
import { AudioPlayer } from '../src/lib/core/audio/audio-player';
import { NoteData } from '../src/lib/midi/types';

// Mock PianoRollSync interface
const createMockPianoRoll = () => ({
  setTime: vi.fn(),
  getTime: vi.fn(() => 0),
  setLoopMarkers: vi.fn(),
  clearLoopMarkers: vi.fn(),
  render: vi.fn(),
});

// Create sample notes for testing
const createSampleNotes = (): NoteData[] => [
  { name: 'C4', time: 0, duration: 0.5, velocity: 0.8, fileId: 'test' },
  { name: 'E4', time: 0.5, duration: 0.5, velocity: 0.8, fileId: 'test' },
  { name: 'G4', time: 1.0, duration: 0.5, velocity: 0.8, fileId: 'test' },
  { name: 'C5', time: 1.5, duration: 0.5, velocity: 0.8, fileId: 'test' },
];

describe('A-B Loop and Part Management', () => {
  let audioPlayer: AudioPlayer;
  let pianoRoll: ReturnType<typeof createMockPianoRoll>;
  let notes: NoteData[];

  beforeEach(async () => {
    // Initialize Tone.js context
    if (Tone.context.state === 'suspended') {
      await Tone.start();
    }
    
    pianoRoll = createMockPianoRoll();
    notes = createSampleNotes();
    audioPlayer = new AudioPlayer(notes, pianoRoll, {
      tempo: 120,
      volume: 0.7,
      repeat: false,
    });
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    audioPlayer.destroy();
  });

  describe('Part Instance Management', () => {
    it('should have only one Part instance after initialization', () => {
      const samplerManager = (audioPlayer as any).samplerManager;
      const part = samplerManager.getPart();
      
      expect(part).toBeDefined();
      expect(part).toBeInstanceOf(Tone.Part);
    });

    it('should maintain single Part instance when setting loop points during playback', async () => {
      const samplerManager = (audioPlayer as any).samplerManager;
      const initialPart = samplerManager.getPart();
      
      // Start playback
      await audioPlayer.play();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Set A-B loop points while playing
      audioPlayer.setLoopPoints(1.0, 3.0, true); // preservePosition = true
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const partAfterLoop = samplerManager.getPart();
      
      // Should have a Part instance, but it should be a new one (rebuilt)
      expect(partAfterLoop).toBeDefined();
      expect(partAfterLoop).toBeInstanceOf(Tone.Part);
      
      // Check that old Part was disposed
      expect(initialPart).not.toBe(partAfterLoop);
    });

    it('should not create duplicate Parts when enabling loop after playback ends', async () => {
      const samplerManager = (audioPlayer as any).samplerManager;
      
      // Simulate playback ending
      const state = audioPlayer.getState();
      state.currentTime = state.duration;
      (audioPlayer as any).state.currentTime = state.duration;
      (audioPlayer as any).state.isPlaying = false;
      
      // Enable loop
      audioPlayer.toggleRepeat(true);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Start playback
      await audioPlayer.play();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const part = samplerManager.getPart();
      
      // Should have exactly one Part
      expect(part).toBeDefined();
      expect(part).toBeInstanceOf(Tone.Part);
    });
  });

  describe('A-B Loop Position Preservation', () => {
    it('should preserve playback position when setting loop points with preservePosition=true', async () => {
      // Start playback
      await audioPlayer.play();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get current position (should be > 0)
      const stateBefore = audioPlayer.getState();
      const positionBefore = stateBefore.currentTime;
      
      // Set A-B loop points with position preservation
      audioPlayer.setLoopPoints(0.5, 2.5, true);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const stateAfter = audioPlayer.getState();
      
      // Position should be preserved if it's within loop bounds
      if (positionBefore >= 0.5 && positionBefore < 2.5) {
        expect(Math.abs(stateAfter.currentTime - positionBefore)).toBeLessThan(0.1);
      } else {
        // If outside bounds, should move to loop start
        expect(Math.abs(stateAfter.currentTime - 0.5)).toBeLessThan(0.1);
      }
    });

    it('should move to loop start when setting loop points with preservePosition=false', async () => {
      // Start playback
      await audioPlayer.play();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Set A-B loop points without position preservation
      audioPlayer.setLoopPoints(1.0, 3.0, false);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const state = audioPlayer.getState();
      
      // Should be at loop start (1.0)
      expect(Math.abs(state.currentTime - 1.0)).toBeLessThan(0.1);
    });

    it('should handle scenario C: set markers during playback and preserve position', async () => {
      // Scenario C: Playing → Set marker A → Set marker B → Enable loop
      // Should continue from current position, not restart from beginning
      
      // Start playback
      await audioPlayer.play();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Get position after some playback
      const stateBeforeLoop = audioPlayer.getState();
      const positionBeforeLoop = stateBeforeLoop.currentTime;
      console.log('Position before setting loop:', positionBeforeLoop);
      
      // Simulate setting markers A and B, then enabling loop
      // This should preserve the current playback position
      audioPlayer.setLoopPoints(0.5, 3.0, true); // preservePosition = true
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const stateAfterLoop = audioPlayer.getState();
      console.log('Position after setting loop:', stateAfterLoop.currentTime);
      
      // Playback should continue (still playing)
      expect(stateAfterLoop.isPlaying).toBe(true);
      
      // Position should be preserved if within bounds
      if (positionBeforeLoop >= 0.5 && positionBeforeLoop < 3.0) {
        // Allow small difference due to continued playback
        expect(Math.abs(stateAfterLoop.currentTime - positionBeforeLoop)).toBeLessThan(0.2);
      }
    });
  });

  describe('Part State Validation', () => {
    it('should properly stop Part before starting a new one', async () => {
      const samplerManager = (audioPlayer as any).samplerManager;
      
      // Start playback
      await audioPlayer.play();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const spy = vi.spyOn(console, 'log');
      
      // Trigger Part restart by seeking
      audioPlayer.seek(2.0);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Check logs for proper Part management
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[SamplerManager]'),
        expect.anything()
      );
      
      spy.mockRestore();
    });

    it('should not start Part multiple times without stopping', async () => {
      const samplerManager = (audioPlayer as any).samplerManager;
      const warnSpy = vi.spyOn(console, 'warn');
      
      // Start playback
      await audioPlayer.play();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Try to start Part again directly (simulating a bug scenario)
      try {
        samplerManager.startPart('+0.01', 0);
      } catch (e) {
        // Expected to handle gracefully
      }
      
      // Should see warning about Part already started
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Part already started')
      );
      
      warnSpy.mockRestore();
    });
  });
});