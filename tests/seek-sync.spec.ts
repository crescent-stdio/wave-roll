import { test, expect } from '@playwright/test';

// E2E: Validate seek while playing on index.html page
test.describe('Index page seek behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.click('body');
    await page.waitForSelector('wave-roll');
    // Pipe page console for debugging WAV/MIDI seek alignment
    page.on('console', (msg) => {
      // eslint-disable-next-line no-console
      console.log('[page]', msg.type(), msg.text());
    });
  });

  test('seek during playback moves playhead near target', async ({ page }) => {
    const waveRoll = page.locator('wave-roll');

    // Start playback via API
    await waveRoll.evaluate((el: any) => el.play?.());
    await page.waitForTimeout(600);

    // Choose target time and perform seek
    const target = 7.5;
    await waveRoll.evaluate((el: any, t) => el.seek?.(t), target);

    // Allow re-sync
    await page.waitForTimeout(500);

    const st = await waveRoll.evaluate((el: any) => el.getState?.());
    expect(st).toBeTruthy();
    expect(typeof st.currentTime).toBe('number');
    expect(Math.abs(st.currentTime - target)).toBeLessThan(0.3);

    // Optional: check Tone.Transport alignment when available
    const tr = await page.evaluate(() => {
      try { return (window as any).Tone?.getTransport?.().seconds ?? -1; } catch { return -1; }
    });
    if (typeof tr === 'number' && tr >= 0) {
      expect(Math.abs(tr - target)).toBeLessThan(0.4);
    }
  });
});

import { test, expect } from '@playwright/test';

// E2E: WAV/MIDI seek alignment while playing
test.describe('Seek synchronization: WAV vs MIDI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/test-sync.html', { waitUntil: 'networkidle' });
    await page.click('body'); // allow audio
    await page.waitForSelector('wave-roll');
  });

  test('seek during playback realigns MIDI and WAV at the same visual time', async ({ page }) => {
    const waveRoll = page.locator('wave-roll');

    // Start playback
    await page.click('#playBtn');
    await page.waitForTimeout(600);

    // Confirm playing
    await expect(await waveRoll.evaluate((el: any) => !!el.isPlaying)).toBeTruthy();

    // Measure current time before seek
    const t0 = await waveRoll.evaluate((el: any) => el.getState?.().currentTime ?? 0);

    // Perform seek to target time
    const target = 5.0;
    await waveRoll.evaluate((el: any, time) => el.seek?.(time), target);

    // Wait for restart to settle
    await page.waitForTimeout(400);

    // Read back current time after seek
    const t1 = await waveRoll.evaluate((el: any) => el.getState?.().currentTime ?? 0);

    // The playhead should be close to the target within small epsilon
    expect(t1).toBeGreaterThan(0);
    expect(Math.abs(t1 - target)).toBeLessThan(0.2);

    // Additionally assert Transport is aligned to target (best-effort)
    const transportSeconds = await page.evaluate(() => {
      try { return (window as any).Tone?.getTransport()?.seconds ?? -1; } catch { return -1; }
    });
    if (typeof transportSeconds === 'number' && transportSeconds >= 0) {
      expect(Math.abs(transportSeconds - target)).toBeLessThan(0.25);
    }
  });
});


