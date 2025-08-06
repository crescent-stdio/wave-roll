# Wave Roll

A modern web component for visualizing and comparing multiple MIDI files with synchronized piano roll display, designed specifically for Music Information Retrieval (MIR) research and analysis.

![npm version](https://img.shields.io/npm/v/wave-roll)
![license](https://img.shields.io/npm/l/wave-roll)

## Features

- 🎹 **Multi-MIDI Visualization**: Display and compare multiple MIDI files simultaneously
- 🎨 **Customizable Colors**: Automatic color assignment with customizable palettes
- 🔄 **A-B Loop Playback**: Set loop points for focused analysis
- 🎛️ **Advanced Controls**: Tempo adjustment, volume control, pan control per file
- 🎯 **Precision Seeking**: Frame-accurate seeking with visual feedback
- 📊 **Overlap Detection**: Visual feedback for overlapping notes across files

## Installation

```bash
npm install wave-roll
```

## Usage

### As a Web Component

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import 'wave-roll';
  </script>
</head>
<body>
  <wave-roll
  style="width: 100%; height: 600px;"
  files='[
    {"path": "path/to/baseline.mid", "name": "Baseline"},
    {"path": "path/to/model1.mid", "name": "Model 1"},
    {"path": "path/to/model2.mid", "name": "Model 2"}
  ]'>
  </wave-roll>
</body>
</html>
```

### In React

```jsx
import 'wave-roll';

function MidiComparison() {
  const files = [
    { path: "/midi/baseline.mid", name: "Baseline" },
    { path: "/midi/model1.mid", name: "Model 1" },
    { path: "/midi/model2.mid", name: "Model 2" }
  ];

  return (
    <wave-roll 
      style={{ width: '100%', height: '600px' }}
      files={JSON.stringify(files)}
    />
  );
}
```

## API

### Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `files` | `string` | JSON string array of file objects with `path` and `name` properties |
| `style` | `string` | CSS styles for the component container |

### File Object Structure

```typescript
interface MidiFile {
path: string;  // URL or path to the MIDI file
name: string;  // Display name for the file
}
```

## Advanced Features

### A-B Loop Playback
Click the A button to set the start point and B button to set the end point. The selected region will loop continuously during playback.

### Per-File Controls
- **Mute**: Silence individual MIDI files while keeping them visible
- **Solo**: Play only the selected file
- **Color**: Customize the color for each file
- **Pan**: Adjust stereo positioning (-100 to +100)

### Tempo Control
Adjust playback speed from 50% to 200% without affecting pitch.

### Visual Settings
- **Note Height**: Adjust the height of notes in the piano roll
- **Highlight Mode**: Various options for emphasizing specific files
- **Sustain Pedal**: Show/hide sustain pedal (CC64) visualization


## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Acknowledgments

This library includes functionality ported from:
- [mir_eval](https://github.com/mir-evaluation/mir_eval) - Music Information Retrieval evaluation library

## License

MIT License - see [LICENSE](LICENSE) file for details

## Citation

If you use Wave Roll in your research, please cite:

```bibtex

```