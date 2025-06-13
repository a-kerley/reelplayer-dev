// playlist.js
export function convertDropboxLinkToDirect(url) {
  if (!url.includes("dropbox.com")) return url;
  return url
    .replace("www.dropbox.com", "dl.dropboxusercontent.com")
    .replace("dropbox.com", "dl.dropboxusercontent.com")
    .replace("?dl=0", "?dl=1")
    .replace("&dl=0", "&dl=1");
}

export async function loadPlaylistFromFile(filePath = 'playlist.txt') {
  const res = await fetch(filePath);
  const text = await res.text();
  const links = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  return links.map(url => ({
    title: null,
    url: url
  }));
}