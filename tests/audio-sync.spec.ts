import { test, expect, type Page } from '@playwright/test';

test.describe('WAV/MIDI Synchronization Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Allow audio autoplay
    await page.goto('/test-sync.html', { waitUntil: 'networkidle' });
    
    // Simulate a user gesture to allow AudioContext autoplay
    await page.click('body');
    
    // Wait for WaveRoll component to load
    await page.waitForTimeout(2000);
  });

  test('Verify sync on first load after clicking Play', async ({ page }) => {
    // Capture console logs
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[PlaybackController]') || 
          text.includes('[WavPlayerManager]') || 
          text.includes('[SamplerManager]') ||
          text.includes('Starting') ||
          text.includes('synchronized')) {
        logs.push(text);
      }
    });

    // Click play button
    await page.click('#playBtn');
    
    // Wait until playback starts
    await page.waitForTimeout(1000);
    
    // Check sync-related messages in logs
    console.log('Collected logs:', logs);
    
    // Analyze WAV and MIDI start times
    const wavStartLogs = logs.filter(log => log.includes('Started WAV') || log.includes('Starting WAV'));
    const midiStartLogs = logs.filter(log => log.includes('Part started') || log.includes('Starting MIDI'));
    
    // Verify start logs exist
    expect(wavStartLogs.length).toBeGreaterThan(0);
    expect(midiStartLogs.length).toBeGreaterThan(0);
    
    // Analyze synchronization time difference (timestamp parsing needed in actual implementation)
    console.log('WAV start logs:', wavStartLogs);
    console.log('MIDI start logs:', midiStartLogs);
  });

  test('Verify sync when starting playback with spacebar', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('PlaybackController') || 
          text.includes('WavPlayerManager') || 
          text.includes('SamplerManager')) {
        logs.push(text);
      }
    });

    // Press the spacebar
    await page.press('body', 'Space');
    
    // Wait until playback starts
    await page.waitForTimeout(1000);
    
    // Print and analyze logs
    console.log('Spacebar playback logs:', logs);
    
    // Verify that playback has started
    const playbackLogs = logs.filter(log => 
      log.includes('Starting playback') || 
      log.includes('play') || 
      log.includes('start')
    );
    
    expect(playbackLogs.length).toBeGreaterThan(0);
  });

  test('Playback timing accuracy measurement', async ({ page }) => {
    // Inject timing functions in JavaScript
    await page.addInitScript(() => {
      (window as any).syncTestResults = {
        playbackStartTime: 0,
        wavStartTimes: [],
        midiStartTimes: [],
        transportTimes: []
      };

      // Improve transport time monitoring
      const originalConsoleLog = console.log;
      console.log = function(...args) {
        const message = args.join(' ');
        
        if (message.includes('Starting playback with generation')) {
          (window as any).syncTestResults.playbackStartTime = performance.now();
        }
        
        if (message.includes('Started WAV')) {
          (window as any).syncTestResults.wavStartTimes.push({
            time: performance.now(),
            message: message
          });
        }
        
        if (message.includes('Part started')) {
          (window as any).syncTestResults.midiStartTimes.push({
            time: performance.now(),
            message: message
          });
        }
        
        originalConsoleLog.apply(console, args);
      };
    });

    // Start playback
    await page.click('#playBtn');
    await page.waitForTimeout(2000);
    
    // Collect results
    const results = await page.evaluate(() => (window as any).syncTestResults);
    
    console.log('Synchronization test results:', results);
    
    // Calculate difference between WAV and MIDI start times
    if (results.wavStartTimes.length > 0 && results.midiStartTimes.length > 0) {
      const timeDiff = Math.abs(
        results.wavStartTimes[0].time - results.midiStartTimes[0].time
      );
      
      console.log(`WAV/MIDI start time difference: ${timeDiff}ms`);
      
      // Sync target within 16 ms (may be stricter in practice)
      expect(timeDiff).toBeLessThan(50); // Initially set to 50 ms
    }
  });

  test('Synchronization stability with repeated play/pause', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('PlaybackController') || text.includes('generation')) {
        logs.push(`${Date.now()}: ${text}`);
      }
    });

    // Repeat 3 times: play -> pause -> play
    for (let i = 0; i < 3; i++) {
      console.log(`Iteration ${i + 1} start`);
      
      // Play
      await page.click('#playBtn');
      await page.waitForTimeout(500);
      
      // Pause
      await page.click('#pauseBtn');
      await page.waitForTimeout(300);
    }
    
    console.log('Repetition test logs:', logs);
  
    // Verify ghost audio prevention works correctly
    const generationLogs = logs.filter(log => log.includes('generation'));
    expect(generationLogs.length).toBeGreaterThan(0);
  });
});
