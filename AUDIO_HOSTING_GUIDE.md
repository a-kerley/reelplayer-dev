# 🎵 Audio Hosting Setup Guide

## Option 1: Cloudinary (Recommended)
1. **Sign up** at https://cloudinary.com (free tier: 25GB storage, 25GB bandwidth)
2. **Upload audio files** to your Cloudinary account
3. **Get URLs** like: `https://res.cloudinary.com/YOUR_CLOUD_NAME/audio/upload/track.mp3`
4. **Benefits:** CDN, CORS headers, audio optimization, reliable

## Option 2: GitHub Pages Audio Repository
1. **Create new repository** called `my-audio-files`
2. **Upload audio files** to the repository
3. **Enable GitHub Pages** in repository settings
4. **Access files** at: `https://USERNAME.github.io/my-audio-files/track.mp3`
5. **Benefits:** Free, version controlled, reliable

## Option 3: JSDelivr + GitHub
1. **Upload to any GitHub repository** 
2. **Access via CDN**: `https://cdn.jsdelivr.net/gh/USERNAME/REPO@main/audio/track.mp3`
3. **Benefits:** Global CDN, fast loading, GitHub integration

## CORS Headers Needed
Your audio host must send these headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: Range
```

## Testing Your Audio URLs
Before using in the reel player:
1. **Open audio URL directly** in browser - should play
2. **Check in console**: `fetch('YOUR_AUDIO_URL').then(r => console.log(r))`
3. **No CORS errors** = ready to use!

## Implementation in Reel Player
Simply replace Dropbox URLs with your new audio URLs:
- Old: `https://www.dropbox.com/scl/fi/...`
- New: `https://res.cloudinary.com/YOUR_CLOUD/audio/upload/track.mp3`
