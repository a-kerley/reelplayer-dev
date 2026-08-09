# Media browsing: one shared component, two contexts

`mediaBrowser.js` (`renderMediaBrowser(container, options)`) is
the single UI for both:
- the Media Library tab (`mediaLibrary.js`, `mode: 'manage'`)
- the file-picker modal (`filePicker.js`, `mode: 'select'`),
  used everywhere a track/background file needs picking.

Don't fork this into two implementations again — extend the shared
component and thread through `mode`/options instead.

Sizing: both contexts size off the viewport, not off however many files are
in the current folder — see `.file-picker-content` (modal) and
`#mediaLibraryView` (tab) in their respective CSS. `.media-browser-body`
itself is `flex: 1; min-height: 0` and relies on internal `overflow-y: auto`
scrolling on the sidebar/main panes, not on the outer container growing.
