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
copy this function's markup. `pageBlocksEditor.js`'s Player block Reel
field uses this exact same combination (`createUrlInputRow` +
`onPickerClick: openReelPicker` + a `createClearButton` once something's
picked) - if you add another "pick one of X" field anywhere, follow that
one, not a new hand-rolled row.

# Collapse/expand: one shared animation, one shared alt-click-all convention

`domUtils.js`'s `animateCollapseHeight(body, open)` is the single
collapse/expand height animation, used by both `makeSectionCollapsible()`
(settings-group fieldsets, every tab) and `pageBlocksEditor.js`'s
`createCollapseButton()` (page blocks). It's a JS-measured `scrollHeight`
pixel transition, deliberately NOT the CSS Grid `0fr/1fr` trick used
elsewhere (`css/card.css`'s `.project-card-extra`) - that trick collapses
to 0 regardless of value against this codebase's actual settings-row
content (color pickers, value-control sliders, nested rows break the
grid intrinsic-sizing algorithm's height contribution; confirmed by hand).
If you add a third collapsible context, reuse `animateCollapseHeight()`,
don't re-implement the pin-then-transition dance a third time - and note
its own doc comment: only call it for a user-triggered toggle on an
already-attached element, never to set a collapsed/expanded element's
*initial* state (`scrollHeight` reads 0 while detached from the document,
which is exactly why both existing call sites set their first-render state
directly instead of through this function).

Both call sites also stash their own per-element `setOpen(open)` as a
property on the element itself (`fieldset._setCollapsibleOpen` /
`row._setBlockCollapseOpen`) - this is what an alt/option-click on any
chevron uses to drive every SIBLING section/block (same parent element) to
the same open/closed state the plain click would have applied to just the
one clicked, without either element needing to know about the other beyond
being siblings. A third collapsible context wanting the same alt-click-all
behavior should follow this identical stash-a-setOpen-on-the-element
pattern, not invent a separate mechanism.

# Adding a new page block type

A new block type (see `pageBlocksEditor.js`'s Spacer block for a real,
minimal example) touches five spots across two files - miss one and the
block either can't be added from the UI, can't be configured, or silently
fails to render:

1. `pageBlocksEditor.js`'s `BLOCK_TYPE_LABELS` - the display name shown in
   the "Add Block" dropdown and the block's own header.
2. `pageBlocksEditor.js`'s `ICONS` - the SVG shown next to that label (see
   that file's own comment: inline Iconoir SVGs, matching this codebase's
   convention of embedding icon markup directly rather than an icon font).
3. `pageBlocksEditor.js`'s `createEmptyBlock()` - the new block's default
   data shape (always include `blockId`/`type`, seeded by the caller).
4. `pageBlocksEditor.js`'s `createConfigForm()` switch, plus a new
   `create<Type>Config(block, onChange, refreshPreview)` function it calls
   - the block's own settings form. Call `refreshPreview()` (re-renders
   just this row's own preview) and `onChange()` (persists) from each
   field's `change`/`blur` handler, matching every existing block's
   pattern.
5. `pageBlockRenderer.js`'s `RENDERERS` map, plus a new `render<Type>(block,
   page)` function it calls - the ONE render implementation shared by both
   the block editor's own row preview and the public `page.html` renderer
   (see that file's own header comment for why: this is the exact
   mechanism that keeps page blocks from repeating the
   `player.html`/`player.js` drift bug documented at the top of this
   repo's own `CLAUDE.md`). Never add a second, editor-only rendering path
   here, even for something that seems purely cosmetic in the editor (e.g.
   a placeholder for an "empty" state) - if it needs to look different in
   the editor than on the public page, that's a sign the block's data model
   needs a real field, not a fork of this function.
