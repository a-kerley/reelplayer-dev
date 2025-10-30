# Asset File Picker System

## Overview

The file picker system uses JSON manifest files to list available assets. This approach works reliably across different web servers and doesn't require directory listing to be enabled.

## Generating Manifests

Whenever you add, remove, or rename files in the asset directories, you need to regenerate the manifests:

```bash
node generate-manifests.js
```

This will scan and create manifests for:
- `assets/audio/` → `assets/audio-manifest.json`
- `assets/images/backgrounds/` → `assets/images/backgrounds-manifest.json`
- `assets/images/project-titles/` → `assets/images/project-titles-manifest.json`

## Running the Application

The application must be served over HTTP (not opened as a local file) for the file picker to work:

```bash
# Start the live server
live-server

# Or use the VS Code task: "Live Server"
```

Then access the application at `http://127.0.0.1:8080` (or whatever port live-server assigns).

## File Structure

```
assets/
├── audio/
│   ├── ExampleReel01/
│   │   ├── 01. Event Horizon.ogg
│   │   └── ...
│   └── [other subdirectories]
├── audio-manifest.json          # Generated manifest
├── images/
│   ├── backgrounds/
│   │   └── [background images]
│   ├── backgrounds-manifest.json # Generated manifest
│   ├── project-titles/
│   │   └── [title images]
│   └── project-titles-manifest.json # Generated manifest
```

## Workflow

1. Add your audio/image files to the appropriate directories
2. Run `node generate-manifests.js` to update the manifests
3. Commit both your new assets AND the updated manifest files to git
4. The file picker will automatically use the manifests when browsing files

## Supported File Types

### Audio Files
`.mp3`, `.wav`, `.ogg`, `.opus`, `.flac`, `.aac`, `.m4a`, `.webm`, `.alac`

### Image Files
`.jpg`, `.jpeg`, `.png`, `.gif`, `.svg`, `.webp`

## Troubleshooting

**File picker shows "No files found":**
- Make sure you ran `node generate-manifests.js` after adding files
- Ensure the manifest JSON files are committed to git
- Verify you're accessing via HTTP (`http://127.0.0.1:8080`) not file protocol (`file://`)

**New files don't appear:**
- Regenerate manifests with `node generate-manifests.js`
- Refresh your browser (hard refresh: Cmd+Shift+R on Mac)
