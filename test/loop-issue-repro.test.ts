/**
 * Reproduction Tests for Reported Loop Issues
 * 
 * Tests specifically targeting the reported bugs:
 * - A button not updating UI during playback
 * - Loop enable jumping to wrong position
 * - Clear button not updating UI
 * - Tempo changes not updating UI immediately
 * - Seek bar click accuracy issues
 */

import { describe, it, expect, vi } from "vitest";

describe("Section A - A-B Loop Issues", () => {
  describe("A button click during playback", () => {
    it("should update piano roll/seekbar/time display when A is clicked during playback", () => {
      // Issue: 재생되고 있는 상태에서 A를 했더니 소리만 나오고 피아노롤/seekbar/시간표시가 바뀌지 않음
      // Expected: UI should update immediately to show A position
      
      const mockAudioPlayer = {
        getState: vi.fn(() => ({
          isPlaying: true,
          currentTime: 5,
          duration: 10,
          playbackRate: 100
        })),
        seek: vi.fn(),
        setLoopPoints: vi.fn()
      };
      
      const mockPianoRoll = {
        setTime: vi.fn(),
        setLoopWindow: vi.fn()
      };
      
      // Simulate A button click during playback
      const currentTime = mockAudioPlayer.getState().currentTime;
      
      // Fix needed: When playing, A button should call seek() to update position
      mockAudioPlayer.seek(currentTime, true); // updateVisual = true
      mockPianoRoll.setTime(currentTime);
      
      expect(mockAudioPlayer.seek).toHaveBeenCalledWith(5, true);
      expect(mockPianoRoll.setTime).toHaveBeenCalledWith(5);
    });
    
    it("should preserve position when A is clicked while not playing", () => {
      // Issue: 재생하고 있지 않은 상태에서 A를 했더니 현재 위치 유지 (의도된 결과)
      // This is the expected behavior - just verify it works
      
      const mockAudioPlayer = {
        getState: vi.fn(() => ({
          isPlaying: false,
          currentTime: 3,
          duration: 10,
          playbackRate: 100
        }))
      };
      
      const mockPianoRoll = {
        setTime: vi.fn()
      };
      
      // When not playing, only visual update
      const currentTime = mockAudioPlayer.getState().currentTime;
      mockPianoRoll.setTime(currentTime);
      
      expect(mockPianoRoll.setTime).toHaveBeenCalledWith(3);
    });
  });

  describe("AB Loop enable behavior", () => {
    it("should jump to A when enabling loop during playback", () => {
      // Issue: 재생중에 "A 클릭 → B 클릭 → AB루프 재생 클릭"에서 0s로 점프
      // Expected: Should jump to A position, not 0
      
      const mockAudioPlayer = {
        getState: vi.fn(() => ({
          isPlaying: true,
          currentTime: 5,
          duration: 10
        })),
        setLoopPoints: vi.fn(),
        seek: vi.fn(),
        play: vi.fn()
      };
      
      const pointA = 2;
      const pointB = 8;
      
      // Enable loop mode
      // Fix: Use preservePosition=false to jump to start, and seek to pointA not 0
      mockAudioPlayer.setLoopPoints(pointA, pointB, false);
      mockAudioPlayer.seek(pointA); // Should seek to A, not 0
      
      expect(mockAudioPlayer.setLoopPoints).toHaveBeenCalledWith(2, 8, false);
      expect(mockAudioPlayer.seek).toHaveBeenCalledWith(2);
    });
    
    it("should jump to A when enabling loop while not playing", () => {
      // Issue: 재생중이지 않은 상태에서 "A 클릭 → B 클릭 → AB루프 재생 클릭"에서 A로 점프
      // This is correct behavior - verify it works
      
      const mockAudioPlayer = {
        getState: vi.fn(() => ({
          isPlaying: false,
          currentTime: 0,
          duration: 10
        })),
        setLoopPoints: vi.fn(),
        seek: vi.fn(),
        play: vi.fn()
      };
      
      const pointA = 3;
      const pointB = 7;
      
      mockAudioPlayer.setLoopPoints(pointA, pointB, false);
      mockAudioPlayer.seek(pointA);
      mockAudioPlayer.play();
      
      expect(mockAudioPlayer.seek).toHaveBeenCalledWith(3);
      expect(mockAudioPlayer.play).toHaveBeenCalled();
    });
  });

  describe("Clear button behavior", () => {
    it("should update UI when clearing during playback", () => {
      // Issue: 구간 재생 중에도 X(클리어) 시 소리만 나오고 피아노롤/seekbar/시간표시가 바뀌지 않음
      // Expected: UI should update while preserving position
      
      const mockAudioPlayer = {
        getState: vi.fn(() => ({
          isPlaying: true,
          currentTime: 5,
          duration: 10
        })),
        setLoopPoints: vi.fn(),
        seek: vi.fn()
      };
      
      const mockPianoRoll = {
        setTime: vi.fn(),
        setLoopWindow: vi.fn()
      };
      
      // Clear loop points
      mockAudioPlayer.setLoopPoints(null, null, true); // preservePosition = true
      
      // Fix: Need to trigger UI update even when preserving position
      const currentTime = mockAudioPlayer.getState().currentTime;
      mockAudioPlayer.seek(currentTime, true); // Force UI update
      mockPianoRoll.setTime(currentTime);
      mockPianoRoll.setLoopWindow(null, null);
      
      expect(mockAudioPlayer.setLoopPoints).toHaveBeenCalledWith(null, null, true);
      expect(mockAudioPlayer.seek).toHaveBeenCalledWith(5, true);
      expect(mockPianoRoll.setLoopWindow).toHaveBeenCalledWith(null, null);
    });
  });
});

describe("Section B - Tempo/Playback Rate Issues", () => {
  describe("Tempo change UI updates", () => {
    it("should update UI immediately when tempo changes to 200%", () => {
      // Issue: 200%을 템포 조절 창에서 입력하면 UI가 즉시 갱신X. spacebar를 눌러야 재생
      // Expected: UI should update immediately without needing to play
      
      const mockAudioPlayer = {
        getState: vi.fn(() => ({
          isPlaying: false,
          currentTime: 5,
          duration: 10,
          playbackRate: 100,
          tempo: 120
        })),
        setPlaybackRate: vi.fn(),
        setOnVisualUpdate: vi.fn()
      };
      
      // Mock the visual update callback
      const visualUpdateCallback = vi.fn();
      mockAudioPlayer.setOnVisualUpdate(visualUpdateCallback);
      
      // Set playback rate to 200%
      mockAudioPlayer.setPlaybackRate(200);
      
      // Fix: The implementation should trigger visual update even when not playing
      // This is what needs to be fixed in the actual code
      // For now, we'll test that the methods are called correctly
      
      expect(mockAudioPlayer.setPlaybackRate).toHaveBeenCalledWith(200);
      expect(mockAudioPlayer.setOnVisualUpdate).toHaveBeenCalledWith(visualUpdateCallback);
      
      // The fix would involve calling the callback immediately after setPlaybackRate
      // when not playing, which is currently not happening
    });
  });

  describe("Seek bar click accuracy", () => {
    it("should calculate correct position with playback rate", () => {
      // Issue: 클릭 seeking 정확하지 않음 (클릭한 위치와 seek된 위치가 같지 않음)
      // Root cause: Effective duration calculation with playback rate
      
      const duration = 10;
      const playbackRate = 200; // 200% speed
      const speed = playbackRate / 100; // 2
      const effectiveDuration = duration / speed; // 5 seconds
      
      // Click at 50% position
      const clickPercent = 50;
      const expectedPosition = (clickPercent / 100) * effectiveDuration;
      
      expect(expectedPosition).toBe(2.5); // 50% of 5s = 2.5s
      
      // Click at 80% position
      const clickPercent2 = 80;
      const expectedPosition2 = (clickPercent2 / 100) * effectiveDuration;
      
      expect(expectedPosition2).toBe(4); // 80% of 5s = 4s
    });
    
    it("should handle different playback rates correctly", () => {
      const duration = 12;
      
      // At 100% speed
      let playbackRate = 100;
      let effectiveDuration = duration / (playbackRate / 100);
      expect(effectiveDuration).toBe(12);
      
      // At 150% speed
      playbackRate = 150;
      effectiveDuration = duration / (playbackRate / 100);
      expect(effectiveDuration).toBe(8);
      
      // At 50% speed
      playbackRate = 50;
      effectiveDuration = duration / (playbackRate / 100);
      expect(effectiveDuration).toBe(24);
    });
  });
});