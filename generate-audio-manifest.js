#!/usr/bin/env node

/**
 * Generates a JSON manifest of all audio files in the assets/audio directory
 * This allows the file picker to work without requiring directory listing
 */

const fs = require('fs');
const path = require('path');

const AUDIO_DIR = './assets/audio';
const OUTPUT_FILE = './assets/audio-manifest.json';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.opus', '.flac', '.aac', '.m4a', '.webm', '.alac'];

function scanDirectory(dir, baseDir = dir) {
  const files = [];
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        // Recursively scan subdirectories
        files.push(...scanDirectory(fullPath, baseDir));
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (AUDIO_EXTENSIONS.includes(ext)) {
          // Store relative path from baseDir
          const relativePath = path.relative(baseDir, fullPath);
          files.push({
            name: item.name,
            path: path.join(path.relative('.', baseDir), relativePath).replace(/\\/g, '/')
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dir}:`, error.message);
  }
  
  return files;
}

// Generate manifest
console.log('Scanning audio files...');
const audioFiles = scanDirectory(AUDIO_DIR);
console.log(`Found ${audioFiles.length} audio files`);

// Sort by path
audioFiles.sort((a, b) => a.path.localeCompare(b.path));

// Write manifest
const manifest = {
  generated: new Date().toISOString(),
  directory: AUDIO_DIR,
  extensions: AUDIO_EXTENSIONS,
  files: audioFiles
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
console.log(`Manifest written to ${OUTPUT_FILE}`);
console.log('Files:');
audioFiles.forEach(f => console.log(`  - ${f.path}`));
