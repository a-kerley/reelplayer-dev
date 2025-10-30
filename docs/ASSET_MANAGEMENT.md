# Asset Management Guide

## Overview

The Reel Player uses JSON manifest files to catalog all assets (audio, images, videos) for the file picker system. This guide covers manifest generation, automatic Git integration, and best practices.

---

## Quick Start

### Adding New Assets

1. **Add files to appropriate directory:**
   ```bash
   # Audio files
   cp my-track.mp3 assets/audio/MyReel/
   
   # Background images
   cp my-bg.jpg assets/images/backgrounds/
   
   # Videos
   cp my-video.mp4 assets/video/
   ```

2. **Commit your changes:**
   ```bash
   git add assets/
   git commit -m "Add new assets"
   ```

3. **Manifests auto-update!** ✨
   
   The pre-commit hook automatically runs `generate-manifests.js` and stages updated manifests.

---

## Manifest System Architecture

### Supported Asset Types

| Asset Type | Directory | Manifest Location | Supported Formats |
|------------|-----------|-------------------|-------------------|
| **Audio** | `assets/audio/` | `assets/audio-manifest.json` | `.mp3`, `.wav`, `.ogg`, `.opus`, `.flac`, `.aac`, `.m4a`, `.webm`, `.alac` |
| **Backgrounds** | `assets/images/backgrounds/` | `assets/images/backgrounds-manifest.json` | `.jpg`, `.jpeg`, `.png`, `.gif`, `.svg`, `.webp` |
| **Titles** | `assets/images/project-titles/` | `assets/images/project-titles-manifest.json` | `.jpg`, `.jpeg`, `.png`, `.gif`, `.svg`, `.webp` |
| **Videos** | `assets/video/` | `assets/video-manifest.json` | `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm` |

### Manifest Structure

Each manifest follows this JSON schema:

```json
{
  "generated": "2025-10-30T18:40:22.960Z",
  "directory": "assets/video",
  "extensions": [".mp4", ".mov", ".avi", ".mkv", ".webm"],
  "files": [
    {
      "name": "CosmicBeauty.mp4",
      "path": "assets/video/backgrounds/Test-Videos/CosmicBeauty.mp4"
    }
  ]
}
```

**Fields:**
- `generated`: ISO timestamp of manifest creation
- `directory`: Base directory scanned
- `extensions`: Allowed file extensions
- `files`: Array of discovered files with relative paths

---

## Manual Manifest Generation

### When to Use

Run manual generation when:
- Testing asset changes before commit
- Debugging file picker issues
- Batch processing multiple asset updates

### Command

```bash
node generate-manifests.js
```

### Output Example

```
Scanning ./assets/audio...
Found 10 files
Manifest written to ./assets/audio-manifest.json
Files:
  - assets/audio/ExampleReel01/01. Event Horizon.ogg
  - assets/audio/ExampleReel01/02. Iron and Fire.ogg
  ...

Scanning ./assets/images/backgrounds...
Found 1 files
Manifest written to ./assets/images/backgrounds-manifest.json
Files:
  - assets/images/backgrounds/Test-Images/BlackHoleSim.webp

Scanning ./assets/images/project-titles...
Found 0 files
Manifest written to ./assets/images/project-titles-manifest.json

Scanning ./assets/video...
Found 1 files
Manifest written to ./assets/video-manifest.json
Files:
  - assets/video/backgrounds/Test-Videos/CosmicBeauty.mp4

✅ All manifests generated successfully!
```

---

## Git Integration

### Pre-Commit Hook Setup

The repository includes an automatic pre-commit hook that regenerates manifests before every commit.

#### Hook Installation

**Automatic (Already Configured):**

If you cloned this repo after the hook was added, it's already active at `.git/hooks/pre-commit`.

**Manual Installation (if missing):**

```bash
# Create the hook file
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
# Generate manifests before commit
node generate-manifests.js
git add assets/*-manifest.json
EOF

# Make executable
chmod +x .git/hooks/pre-commit
```

#### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  COMMIT WORKFLOW WITH AUTO-MANIFEST GENERATION              │
└─────────────────────────────────────────────────────────────┘

1. Developer runs: git commit -m "Add new audio files"
                         │
                         ↓
2. Pre-commit hook triggers: node generate-manifests.js
                         │
                         ↓
3. Script scans all asset directories
   ├─ assets/audio/         → audio-manifest.json
   ├─ assets/images/        → backgrounds-manifest.json
   ├─ assets/images/        → project-titles-manifest.json
   └─ assets/video/         → video-manifest.json
                         │
                         ↓
4. Hook stages manifests: git add assets/*-manifest.json
                         │
                         ↓
5. Commit proceeds with updated manifests included
```

#### Verifying Hook Installation

```bash
# Check if hook exists and is executable
ls -la .git/hooks/pre-commit

# Expected output:
# -rwxr-xr-x 1 user group 123 Oct 30 12:34 .git/hooks/pre-commit
```

#### Skipping Hook (Emergency Only)

If you need to commit without regenerating manifests:

```bash
git commit --no-verify -m "Emergency commit"
```

⚠️ **Warning:** This can cause file picker to show stale data!

---

## File Organization Best Practices

### Directory Structure Guidelines

✅ **Recommended:**
```
assets/
├── audio/
│   ├── ProjectName/
│   │   ├── 01. Track Name.ogg
│   │   ├── 02. Track Name.ogg
│   │   └── cover.jpg
│   └── AnotherProject/
│       └── ...
├── images/
│   ├── backgrounds/
│   │   ├── space-theme/
│   │   └── abstract/
│   └── project-titles/
│       └── logos/
└── video/
    ├── backgrounds/
    └── intros/
```

❌ **Avoid:**
```
assets/
├── audio/
│   ├── track1.mp3              # No organization
│   ├── some random file.wav    # Special characters/spaces
│   └── TEMP_test.mp3           # Temporary files
```

### Naming Conventions

**DO:**
- Use descriptive names: `cosmic-beauty.mp4`, `dark-ambient-loop.ogg`
- Group by project/theme: `ProjectName/01. Track.ogg`
- Use hyphens or underscores: `space-theme`, `epic_orchestral`

**DON'T:**
- Use spaces if possible (causes URL encoding issues)
- Include special characters: `#`, `@`, `&`, `%`
- Start with numbers: `01track.mp3` (use `track-01.mp3`)

### File Size Recommendations

| Asset Type | Max Recommended Size | Notes |
|------------|---------------------|-------|
| Audio | 10-15 MB | Use `.ogg` or `.opus` for web optimization |
| Images (BG) | 500 KB - 2 MB | Use `.webp` for best compression |
| Images (Titles) | 100-500 KB | PNG for transparency, otherwise WebP |
| Videos | 10-30 MB | Use H.264 codec, 1080p max resolution |

---

## Troubleshooting

### Assets Not Appearing in File Picker

**Problem:** Added new files but they don't show in the file picker.

**Solutions:**

1. **Check manifest was regenerated:**
   ```bash
   # Verify timestamp is recent
   cat assets/video-manifest.json | grep generated
   ```

2. **Manually regenerate:**
   ```bash
   node generate-manifests.js
   ```

3. **Clear browser cache:**
   - Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+F5` (Windows)
   - Or open DevTools → Network → "Disable cache"

4. **Verify file location:**
   ```bash
   # Check file exists and path is correct
   ls -la assets/video/your-file.mp4
   ```

### Manifest Generation Fails

**Problem:** `generate-manifests.js` throws errors.

**Common Causes:**

1. **Missing Node.js:**
   ```bash
   # Install Node.js from nodejs.org, then verify:
   node --version  # Should be v16+ or higher
   ```

2. **Permission issues:**
   ```bash
   # Make script executable
   chmod +x generate-manifests.js
   ```

3. **Missing asset directories:**
   ```bash
   # Create required directories
   mkdir -p assets/audio assets/images/backgrounds assets/images/project-titles assets/video
   ```

### Git Hook Not Running

**Problem:** Committing doesn't regenerate manifests automatically.

**Solutions:**

1. **Check hook exists:**
   ```bash
   ls -la .git/hooks/pre-commit
   ```

2. **Verify executable permissions:**
   ```bash
   chmod +x .git/hooks/pre-commit
   ```

3. **Check hook content:**
   ```bash
   cat .git/hooks/pre-commit
   ```
   
   Should contain:
   ```sh
   #!/bin/sh
   node generate-manifests.js
   git add assets/*-manifest.json
   ```

4. **Test hook manually:**
   ```bash
   .git/hooks/pre-commit
   echo $?  # Should output 0 (success)
   ```

---

## Advanced Usage

### Custom Manifest Configuration

To add new asset types, edit `generate-manifests.js`:

```javascript
const ASSET_TYPES = [
  // ... existing entries ...
  {
    dir: './assets/fonts',               // New directory
    manifest: './assets/fonts-manifest.json',  // Manifest output
    extensions: ['.woff', '.woff2', '.ttf']   // Supported formats
  }
];
```

Then update `js/modules/filePicker.js` to add the manifest mapping:

```javascript
const manifestMap = {
  // ... existing entries ...
  'assets/fonts': 'assets/fonts-manifest.json'
};
```

### Filtering Assets

To exclude certain files/folders from manifests, modify `scanDirectory()` in `generate-manifests.js`:

```javascript
if (item.isDirectory()) {
  // Skip hidden folders and temp directories
  if (item.name.startsWith('.') || item.name === 'temp') {
    continue;
  }
  files.push(...scanDirectory(fullPath, baseDir, extensions));
}
```

### Batch Asset Processing

Process multiple asset updates efficiently:

```bash
# Add all assets in one commit
cp -r ~/Downloads/new-audio-pack/* assets/audio/
cp -r ~/Downloads/new-backgrounds/* assets/images/backgrounds/
git add assets/
git commit -m "Batch import: audio pack + backgrounds"
# Manifests auto-update via pre-commit hook
```

---

## CI/CD Integration

### GitHub Actions Example

Automatically validate manifests on pull requests:

```yaml
# .github/workflows/validate-manifests.yml
name: Validate Asset Manifests

on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Generate manifests
        run: node generate-manifests.js
      
      - name: Check for uncommitted changes
        run: |
          git diff --exit-code assets/*-manifest.json || \
          (echo "❌ Manifests out of date! Run: node generate-manifests.js" && exit 1)
```

---

## Performance Considerations

### Manifest Caching

The file picker caches manifests in memory during a session. For large asset libraries:

- **< 100 files per type:** No optimization needed
- **100-500 files:** Consider lazy loading folders
- **500+ files:** Implement pagination or search filtering

### Build Optimization

For production deployments:

1. **Minify manifests:**
   ```bash
   # Remove whitespace from JSON
   cat assets/audio-manifest.json | jq -c > assets/audio-manifest.min.json
   ```

2. **Enable gzip compression** on your web server for `.json` files

3. **Set cache headers:**
   ```
   Cache-Control: public, max-age=3600
   ```

---

## Reference

### Related Documentation

- [File Picker Module](/js/modules/filePicker.js) - JavaScript implementation
- [Builder Integration](/js/builder.js) - How file picker is used in the builder UI
- [Audio Format Support](./AUDIO_FORMAT_SUPPORT.md) - Codec compatibility guide
- [Audio Hosting Guide](./AUDIO_HOSTING_GUIDE.md) - Best practices for hosting audio

### Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Review existing manifests: `cat assets/*-manifest.json`
3. Test manually: `node generate-manifests.js`
4. Open an issue on GitHub with error output

---

**Last Updated:** October 30, 2025  
**Manifest Version:** 1.0  
**Git Hook Version:** 1.0
