#!/bin/bash

# Build script for GitHub Pages deployment

echo "Building WaveRoll for GitHub Pages..."

# Build the library
npm run build

# Create deployment directory
rm -rf gh-pages
mkdir -p gh-pages

# Copy the production HTML
cp docs/index-local.html gh-pages/index.html

# Copy built files
cp -r dist gh-pages/

# Copy sample MIDI files
mkdir -p gh-pages/sample_midi
cp -r src/sample_midi/* gh-pages/sample_midi/

echo "Build complete! Files are in gh-pages/"
echo "To test locally, run: npx serve gh-pages"