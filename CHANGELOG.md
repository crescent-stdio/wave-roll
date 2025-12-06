# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note**: This library is published at [ISMIR 2025 LBD](https://ismir2025program.ismir.net/lbd_459.html). See [Citation](#citation) for reference.

## [0.4.0] - 2025-12-06

### Added

- Multi-instrument MIDI support with GM program detection and auto soundfont mapping
- Per-track controls for visibility, mute, volume, sustain, and waveform/piano-roll toggles
- Track-aware instrument icons, palettes, and color handling for multi-track MIDI files

### Changed

- Updated player, visualization, and loop controls to handle multi-track state across audio and UI
- Refreshed file list and wave list UI to expose per-track toggles and multi-file controls
- Improved MIDI parser and sampler manager to keep track metadata consistent across playback and rendering

### Tests

- Added coverage for multi-MIDI manager behaviors and instrument family mapping


## [0.3.0] - 2025-12-02

### Added

- Appearance API and solo mode for single MIDI visualization
- Tempo control with popover input for precise BPM adjustment
- Flexible MIDI export options
- Pitch hover indicator to piano roll
- VS Code extension support (`wave-roll-studio`, formerly `wave-roll-solo`) for viewing MIDI files directly in the editor
- GitHub Actions workflow for automated release creation from tags

### Changed

- Improved MIDI export and settings UI
- Improved audio synchronization and tempo handling
- Improved tempo handling for multi-MIDI playback
- Enhanced piano roll pitch hover and piano key visuals
- Improved UI controls and audio handling

### Refactored

- Refactored settings modal
- Removed console logs and stabilized the tests


## [0.2.5] - 2025-10-09

### Changed

- Updates package version and demo notebook name

## [0.2.4] - 2025-10-09

### Added

- Jupyter notebook demo with usage examples
- Dynamic file config for Google Colab

### Changed

- Improved audio file handling and UI
- Updates label to reflect single WAV file limit

## [0.2.3] - 2025-09-24

### Fixed

- False Negative highlight mode

## [0.2.2] - 2025-09-22

### Added

- Legacy highlight modes for compatibility
- Piano roll zoom in mobile
- Performance analysis

### Fixed

- FP highlight mode
- TP highlight mode

## [0.2.1] - 2025-09-21

### Fixed

- Correct sample file paths for GitHub Pages deployment

## [0.2.0] - 2025-09-21

### Added

- Read-only mode (`readonly` attribute) to disable file addition/deletion
- Standalone demo with drag-and-drop file upload interface
- UMD and ES module CDN distribution
- Custom web component `<wave-roll>` for easy embedding

### Changed

- Refactored examples and updates deployment
- Updated import path and links in documentation
- Renamed `displayName` to `name` for file labeling

### Removed

- Unused v1 player codes
- Unused comments and packages

## [0.1.5] - 2025-08-06

### Fixed

- Marker error

## [0.1.4] - 2025-08-06

### Changed

- Node versions in `npm_publish.yml`

## Citation

If you use WaveRoll in your research, please cite:

```bibtex
@inproceedings{waveroll2025,
  title={WaveRoll: JavaScript Library for Comparative MIDI Piano-Roll Visualization},
  author={Park, Hannah and Jeong, Dasaem},
  booktitle={Proceedings of 26th International Society for Music Information Retrieval Conference (ISMIR)},
  year={2025}
}
```

---

[Unreleased]: https://github.com/crescent-stdio/wave-roll/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/crescent-stdio/wave-roll/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/crescent-stdio/wave-roll/compare/v0.2.5...v0.3.0
[0.2.5]: https://github.com/crescent-stdio/wave-roll/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/crescent-stdio/wave-roll/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/crescent-stdio/wave-roll/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/crescent-stdio/wave-roll/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/crescent-stdio/wave-roll/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/crescent-stdio/wave-roll/compare/v0.1.5...v0.2.0
[0.1.5]: https://github.com/crescent-stdio/wave-roll/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/crescent-stdio/wave-roll/releases/tag/v0.1.4
