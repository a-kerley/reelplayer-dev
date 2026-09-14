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

# Text styling: one shared toolkit, four contexts

`styleToolbarWidgets.js` isn't just Font/Size/Weight/Color widgets — it
also owns `createTextStyleToolbar()` (the role-dropdown-plus-Custom-
controls row) and `openTextStyleDefsDialog()` (the full "Style/Font/Size/
Weight/Color/Reset" table). Between them these back:
- the text block's own Font/Weight controls and "Apply style..." menu
  (`pageBlocksEditor.js`'s `createTextConfig()`, `styleMenuItems()`)
- the button block's "Text Style" row (`pageBlocksEditor.js`'s
  `createButtonConfig()`)
- the reel builder's Title/Track Name/Playlist toolbars
  (`playerTextStyles.js`)
- the page builder's "Customize Text Styles" dialog and the reel
  builder's "Edit Fallback Text Styles" dialog (`pageBlocksEditor.js`'s
  `openCustomizeStylesDialog()` and `playerTextStyles.js`, both just thin
  wrappers supplying their own `defs` object and `onCommit`)

Same reasoning as the mediaBrowser.js note above: extend this shared
toolkit and thread through the relevant getter/setter/`defs` params,
don't re-fork the table- or toolbar-building code a third or fourth time.

# One shared "label + text field + browse button" row, not per-field markup

`domUtils.js`'s `createUrlInputRow()` is the single row builder behind
every "label: [value.........] [📁]" field in both builders - reel
background image/video, a Project Card's logo/banner/listen-image fields,
*and* (via the `onPickerClick` option) the Project Card's reel picker
field (`cardsController.js`), even though that last one opens
`reelPicker.js`'s dialog instead of the media `openFilePicker()` the
`pickerOptions` param wires up by default. `onPickerClick` exists
specifically so a new "pick something that isn't a media file" row can
still get the identical row layout for free, rather than hand-rolling the
label/input/button markup again - if you need a browse button that opens
something else entirely, add another `onPickerClick`-style caller, don't
copy this function's markup.
