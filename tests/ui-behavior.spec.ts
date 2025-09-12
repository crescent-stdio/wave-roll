import { test, expect } from '@playwright/test';

test.describe('WaveRoll basic UI behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-sync.html', { waitUntil: 'networkidle' });
    await page.click('body'); // allow audio
    await page.waitForSelector('wave-roll');
  });

  test('play/pause toggles isPlaying on component', async ({ page }) => {
    const waveRoll = page.locator('wave-roll');

    // Initially not playing
    const initiallyPlaying = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(initiallyPlaying).toBeFalsy();

    // Play
    await page.click('#playBtn');
    await page.waitForTimeout(400);
    const playing = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(playing).toBeTruthy();

    // Pause
    await page.click('#pauseBtn');
    await page.waitForTimeout(200);
    const paused = await waveRoll.evaluate((el: any) => !!el.isPlaying);
    expect(paused).toBeFalsy();
  });
});
