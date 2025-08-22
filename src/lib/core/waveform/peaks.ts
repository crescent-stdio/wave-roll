/**
 * Compute min/max peaks from an AudioBuffer.
 * Returns two arrays with `numPeaks` samples each.
 */
export function getPeaksFromAudioBuffer(
  audioBuffer: AudioBuffer,
  numPeaks: number = 2000
): { min: number[]; max: number[] } {
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const blockSize = Math.max(1, Math.floor(length / numPeaks));
  const min: number[] = new Array(numPeaks).fill(0);
  const max: number[] = new Array(numPeaks).fill(0);

  for (let i = 0; i < numPeaks; i++) {
    let start = i * blockSize;
    let end = i === numPeaks - 1 ? length : start + blockSize;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let ch = 0; ch < channelCount; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let j = start; j < end; j++) {
        const v = data[j];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }

    if (!isFinite(minVal)) minVal = 0;
    if (!isFinite(maxVal)) maxVal = 0;

    // Normalize to [0,1] magnitude for drawing convenience
    min[i] = Math.abs(minVal);
    max[i] = Math.abs(maxVal);
  }

  return { min, max };
}


