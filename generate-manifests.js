#!/usr/bin/env node

/**
 * Generates JSON manifests for all asset directories
 */

const fs = require('fs');
const path = require('path');

const ASSET_TYPES = [
  {
    dir: './assets/audio',
    manifest: './assets/audio-manifest.json',
    extensions: ['.mp3', '.wav', '.ogg', '.opus', '.flac', '.aac', '.m4a', '.webm', '.alac']
  },
  {
    dir: './assets/images/backgrounds',
    manifest: './assets/images/backgrounds-manifest.json',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']
  },
  {
    dir: './assets/images/project-titles',
    manifest: './assets/images/project-titles-manifest.json',
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp']
  },
  {
    dir: './assets/video',
    manifest: './assets/video-manifest.json',
    extensions: ['.mp4', '.mov', '.avi', '.mkv', '.webm']
  }
];

function scanDirectory(dir, baseDir = dir, extensions) {
  const files = [];
  
  try {
    if (!fs.existsSync(dir)) {
      console.log(`Directory ${dir} does not exist, skipping`);
      return files;
    }
    
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        // Recursively scan subdirectories
        files.push(...scanDirectory(fullPath, baseDir, extensions));
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (extensions.includes(ext)) {
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

// Generate manifests for all asset types
ASSET_TYPES.forEach(assetType => {
  console.log(`\nScanning ${assetType.dir}...`);
  const files = scanDirectory(assetType.dir, assetType.dir, assetType.extensions);
  console.log(`Found ${files.length} files`);
  
  // Sort by path
  files.sort((a, b) => a.path.localeCompare(b.path));
  
  // Write manifest
  const manifest = {
    generated: new Date().toISOString(),
    directory: assetType.dir.replace('./', ''),
    extensions: assetType.extensions,
    files: files
  };
  
  fs.writeFileSync(assetType.manifest, JSON.stringify(manifest, null, 2));
  console.log(`Manifest written to ${assetType.manifest}`);
  if (files.length > 0) {
    console.log('Files:');
    files.forEach(f => console.log(`  - ${f.path}`));
  }
});

console.log('\n✅ All manifests generated successfully!');
