/**
 * Performance monitoring test for piano roll playback
 * Run this to measure FPS and identify performance bottlenecks
 */

// Add this code temporarily to your main app to monitor performance
export class PerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 0;
  private renderTimes: number[] = [];
  private updateTimes: number[] = [];
  private isMonitoring = false;
  
  // Metrics
  private metrics = {
    avgFps: 0,
    minFps: 999,
    maxFps: 0,
    avgRenderTime: 0,
    maxRenderTime: 0,
    frameDrops: 0,
    totalFrames: 0,
    slowFrames: 0, // Frames taking > 20ms
  };

  start() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;
    this.lastTime = performance.now();
    this.measureFrame();
    
    // Log metrics every 2 seconds
    setInterval(() => {
      if (this.isMonitoring) {
        this.logMetrics();
      }
    }, 2000);
  }

  stop() {
    this.isMonitoring = false;
    this.logFinalReport();
  }

  private measureFrame = () => {
    if (!this.isMonitoring) return;

    const now = performance.now();
    const delta = now - this.lastTime;
    
    this.frameCount++;
    this.metrics.totalFrames++;
    
    // Calculate FPS every second
    if (delta >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / delta);
      this.metrics.avgFps = (this.metrics.avgFps + this.fps) / 2;
      this.metrics.minFps = Math.min(this.metrics.minFps, this.fps);
      this.metrics.maxFps = Math.max(this.metrics.maxFps, this.fps);
      
      // Check for frame drops (< 30 fps)
      if (this.fps < 30) {
        this.metrics.frameDrops++;
      }
      
      this.frameCount = 0;
      this.lastTime = now;
    }
    
    requestAnimationFrame(this.measureFrame);
  };

  measureRender(callback: () => void): void {
    const start = performance.now();
    callback();
    const renderTime = performance.now() - start;
    
    this.renderTimes.push(renderTime);
    if (this.renderTimes.length > 100) {
      this.renderTimes.shift();
    }
    
    // Track slow frames
    if (renderTime > 20) {
      this.metrics.slowFrames++;
    }
    
    this.metrics.avgRenderTime = this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;
    this.metrics.maxRenderTime = Math.max(this.metrics.maxRenderTime, renderTime);
  }

  measureUpdate(callback: () => void): void {
    const start = performance.now();
    callback();
    const updateTime = performance.now() - start;
    
    this.updateTimes.push(updateTime);
    if (this.updateTimes.length > 100) {
      this.updateTimes.shift();
    }
  }

  private logMetrics() {
    console.log(`
=== Performance Metrics ===
FPS: ${this.fps} (avg: ${this.metrics.avgFps.toFixed(1)}, min: ${this.metrics.minFps})
Render Time: ${this.metrics.avgRenderTime.toFixed(2)}ms (max: ${this.metrics.maxRenderTime.toFixed(2)}ms)
Update Time: ${this.updateTimes.length ? (this.updateTimes.reduce((a, b) => a + b, 0) / this.updateTimes.length).toFixed(2) : 0}ms
Frame Drops: ${this.metrics.frameDrops}
Slow Frames: ${this.metrics.slowFrames}/${this.metrics.totalFrames} (${(this.metrics.slowFrames / this.metrics.totalFrames * 100).toFixed(1)}%)
    `.trim());
  }

  private logFinalReport() {
    console.log(`
=== Final Performance Report ===
Total Frames: ${this.metrics.totalFrames}
Average FPS: ${this.metrics.avgFps.toFixed(1)}
Min FPS: ${this.metrics.minFps}
Max FPS: ${this.metrics.maxFps}
Frame Drops (<30fps): ${this.metrics.frameDrops}
Slow Frames (>20ms): ${this.metrics.slowFrames} (${(this.metrics.slowFrames / this.metrics.totalFrames * 100).toFixed(1)}%)
Avg Render Time: ${this.metrics.avgRenderTime.toFixed(2)}ms
Max Render Time: ${this.metrics.maxRenderTime.toFixed(2)}ms
    `.trim());
  }
}

// Usage example:
// const monitor = new PerformanceMonitor();
// monitor.start();
// 
// // Wrap your render calls:
// monitor.measureRender(() => {
//   pianoRoll.render();
// });
//
// // Stop monitoring:
// monitor.stop();