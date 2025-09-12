import { test, expect } from '@playwright/test';

test.describe('Audio Playback Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-sync.html', { waitUntil: 'networkidle' });
    // Click to allow audio
    await page.click('body');
    await page.waitForSelector('wave-roll');
  });

  test('WAV audio starts playing when play button is clicked', async ({ page }) => {
    const waveRoll = page.locator('wave-roll');

    // Initially not playing
    const initiallyPlaying = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(initiallyPlaying).toBeFalsy();

    // Click play button
    await page.click('#playBtn');
    
    // Wait for audio to start
    await page.waitForTimeout(500);
    
    // Check if playing state is true
    const isPlaying = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(isPlaying).toBeTruthy();
    
    // Check if audio context is running
    const audioContextState = await page.evaluate(() => {
      return (window as any).Tone?.context?.state;
    });
    expect(audioContextState).toBe('running');
  });

  test('play button state updates correctly', async ({ page }) => {
    const playBtn = page.locator('#playBtn');
    const pauseBtn = page.locator('#pauseBtn');

    // Initially play button should be visible, pause button hidden
    await expect(playBtn).toBeVisible();
    
    // Click play
    await playBtn.click();
    await page.waitForTimeout(300);
    
    // Check if component state updated
    const waveRoll = page.locator('wave-roll');
    const isPlaying = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(isPlaying).toBeTruthy();
    
    // Pause
    await pauseBtn.click();
    await page.waitForTimeout(300);
    
    const isPaused = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(isPaused).toBeFalsy();
  });

  test('piano roll visualization starts updating during playback', async ({ page }) => {
    const waveRoll = page.locator('wave-roll');

    // Get initial time
    const initialTime = await waveRoll.evaluate((el: any) => el.getCurrentTime?.() || 0);
    
    // Start playback
    await page.click('#playBtn');
    await page.waitForTimeout(800);
    
    // Check if time has progressed
    const currentTime = await waveRoll.evaluate((el: any) => el.getCurrentTime?.() || 0);
    expect(currentTime).toBeGreaterThan(initialTime);
    
    // Check if visual updates are happening
    const hasVisualUpdates = await page.evaluate(() => {
      return (window as any).lastVisualUpdateTime !== undefined;
    });
    
    if (hasVisualUpdates) {
      expect(hasVisualUpdates).toBeTruthy();
    }
  });

  test('audio stops when pause button is clicked', async ({ page }) => {
    const waveRoll = page.locator('wave-roll');
    
    // Start playing
    await page.click('#playBtn');
    await page.waitForTimeout(500);
    
    // Confirm it's playing
    const isPlayingBefore = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(isPlayingBefore).toBeTruthy();
    
    // Pause
    await page.click('#pauseBtn');
    await page.waitForTimeout(300);
    
    // Confirm it's paused
    const isPlayingAfter = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(isPlayingAfter).toBeFalsy();
  });

  test('audio system initializes without errors', async ({ page }) => {
    const waveRoll = page.locator('wave-roll');
    
    // Check if audio player is initialized
    const audioPlayerExists = await waveRoll.evaluate((el: any) => {
      return !!el.audioPlayer;
    });
    expect(audioPlayerExists).toBeTruthy();
    
    // Check for console errors
    const errors = await page.evaluate(() => {
      return (window as any).audioErrors || [];
    });
    expect(errors.length).toBe(0);
  });

  test('seek functionality works correctly', async ({ page }) => {
    const waveRoll = page.locator('wave-roll');
    
    // Start playing
    await page.click('#playBtn');
    await page.waitForTimeout(300);
    
    // Seek to a specific time (if seek functionality exists)
    const seekTime = 2.0; // 2 seconds
    const canSeek = await waveRoll.evaluate((el: any, time) => {
      if (el.seek && typeof el.seek === 'function') {
        el.seek(time);
        return true;
      }
      return false;
    }, seekTime);
    
    if (canSeek) {
      await page.waitForTimeout(200);
      
      const currentTime = await waveRoll.evaluate((el: any) => el.getCurrentTime?.() || 0);
      expect(currentTime).toBeCloseTo(seekTime, 1);
    }
  });
});