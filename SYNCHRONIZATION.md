# Transport ↔ Playhead Synchronization

## Overview

The synchronized audio player achieves precise visual synchronization between Tone.js audio playback and the PixiJS piano roll playhead through a high-frequency polling mechanism that maintains ≤16ms drift between audio and visual components.

## How It Works

**Core Synchronization Loop**: A `setInterval` timer running every 16ms (~60fps) continuously polls `Tone.getTransport().seconds` to get the current audio playback position and immediately calls `pianoRoll.setTime(transportTime)` to update the visual playhead. This creates a tight coupling between Tone.js's high-precision audio scheduling and the PixiJS rendering pipeline.

**Drift Mitigation**: The 16ms polling interval ensures that visual updates occur faster than human perception can detect (sub-frame timing), while Tone.js's WebAudio-based transport provides sample-accurate audio timing. Any drift between audio and visual is bounded by the polling frequency and typically remains under 10ms in practice.

**Lifecycle Management**: The synchronization loop is automatically started when playback begins (`startSyncScheduler()`) and stopped during pause/stop events (`stopSyncScheduler()`), ensuring zero CPU overhead when not actively playing. The transport's event system handles edge cases like reaching the end of tracks or manual seeking operations.

This approach leverages the strengths of both systems: Tone.js for precise audio scheduling and PixiJS for smooth visual rendering, connected through a lightweight polling bridge that maintains real-time synchronization without complex audio analysis or callback chaining.