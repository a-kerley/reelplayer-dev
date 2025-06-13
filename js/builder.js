// builder.js

import { playerApp } from "./player.js";

// Keep track of Pickr instances to destroy them between renders
let pickrInstances = [];

export function createEmptyReel() {
  return {
    id: "reel-" + Date.now(),
    title: "",
    accent: "#2a0026",
    showTitle: true, // <-- add this
    playlist: [{ title: "", url: "" }],
  };
}

export function renderBuilder(reel, onChange) {
  // Form elements
  const titleInput = document.getElementById("reelTitle");
  const showTitleCheckbox = document.getElementById("reelShowTitle");
  const reelForm = document.getElementById("reelForm");

  // Destroy old Pickr instances before rendering new ones
  if (pickrInstances.length) {
    pickrInstances.forEach((p) => p.destroy());
    pickrInstances = [];
  }

  // ----- BUILD OR UPDATE THE COLOR PICKER ROWS -----
  const pickrConfigs = [
    {
      id: "pickr-ui-accent",
      var: "--ui-accent",
      default: reel.varUiAccent || "#2a0026",
      reelKey: "varUiAccent",
    },
    {
      id: "pickr-waveform-unplayed",
      var: "--waveform-unplayed",
      default: reel.varWaveformUnplayed || "#929292",
      reelKey: "varWaveformUnplayed",
    },
    {
      id: "pickr-waveform-hover",
      var: "--waveform-hover",
      default: reel.varWaveformHover || "#001f67",
      reelKey: "varWaveformHover",
      alpha: 0.13, // special, handled below
    },
  ];

  function hexToRgba(hex, alpha = 1) {
    let c = hex.replace("#", "");
    if (c.length === 3)
      c = c
        .split("")
        .map((x) => x + x)
        .join("");
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255},${(num >> 8) & 255},${
      num & 255
    },${alpha})`;
  }

  // --- Remove old tracks section and color pickers fieldset if present ---
  // Remove old tracksSection fieldset if it exists
  const oldTracksSection = document.getElementById("tracksSection");
  if (oldTracksSection) oldTracksSection.remove();
  // Remove old color pickers fieldset if present (the first fieldset in the form)
  let oldColorFieldset = Array.from(reelForm.querySelectorAll("fieldset")).find(
    (fs) =>
      fs.querySelector("legend") &&
      fs.querySelector("legend").textContent.includes("Player Color")
  );
  if (oldColorFieldset) oldColorFieldset.remove();

  // --- Insert new tracksSection fieldset before color pickers fieldset ---
  // Build tracksSection fieldset
  const tracksSection = document.createElement("fieldset");
  tracksSection.id = "tracksSection";
  tracksSection.style.marginTop = "2rem";
  tracksSection.style.border = "1px solid #eee";
  tracksSection.style.borderRadius = "8px";
  tracksSection.style.padding = "1rem";
  tracksSection.innerHTML = `
    <legend style="font-size:1.1rem;font-weight:600;color:var(--builder-accent)">Tracks</legend>
    <div id="tracksEditor"></div>
  `;
  // Insert tracksSection before color pickers fieldset (which we will add next)
  // Find where to insert: before the next fieldset (which is for Player Colors)
  // We'll insert at the end for now; after that, color pickers will be inserted after tracksSection
  // Find export button to insert before, if any
  const exportBtn = document.getElementById("exportEmbedBtn");
  if (exportBtn) {
    reelForm.insertBefore(tracksSection, exportBtn);
  } else {
    reelForm.appendChild(tracksSection);
  }

  // --- Insert new color pickers fieldset after tracksSection ---
  const colorFieldset = document.createElement("fieldset");
  colorFieldset.style.marginTop = "2rem";
  colorFieldset.style.border = "1px solid #eee";
  colorFieldset.style.borderRadius = "8px";
  colorFieldset.style.padding = "1rem";
  colorFieldset.innerHTML = `
    <legend style="font-size:1.1rem;font-weight:600;color:var(--builder-accent)">Player Colours</legend>
    <div class="color-row">
      <span>UI Accent Colour:</span>
      <button id="pickr-ui-accent" class="pickr-button" type="button"></button>
    </div>
    <div class="color-row">
      <span>Waveform Unplayed Colour:</span>
      <button id="pickr-waveform-unplayed" class="pickr-button" type="button"></button>
    </div>
    <div class="color-row">
      <span>Waveform Hover Colour:</span>
      <button id="pickr-waveform-hover" class="pickr-button" type="button"></button>
    </div>
  `;
  // Insert colorFieldset after tracksSection and before export button
  if (exportBtn) {
    reelForm.insertBefore(colorFieldset, exportBtn);
  } else {
    reelForm.appendChild(colorFieldset);
  }

  // Now, proceed with the Pickr setTimeout as before
  setTimeout(() => {
    // console.log("[Pickr] Starting color picker setup...");
    pickrConfigs.forEach((cfg) => {
      const btn = document.getElementById(cfg.id);
      if (!btn) {
        // console.warn("[Pickr] Button not found for id:", cfg.id);
        return;
      }
      // --- CLEANUP: Remove Pickr artifacts from previous instance ---
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      btn.className = "pickr-button";
      btn.removeAttribute("aria-haspopup");
      btn.removeAttribute("aria-expanded");
      btn.removeAttribute("aria-owns");
      btn.removeAttribute("tabindex");
      Object.keys(btn.dataset).forEach((key) => delete btn.dataset[key]);
      delete btn._pickr;
      btn.style.background = cfg.default;
      // console.log(`[Pickr] Cleaned up and ready to attach Pickr for ${cfg.id}`);
      try {
        const pickr = Pickr.create({
          el: btn,
          theme: "nano",
          default: cfg.default,
          swatches: [
            "#2a0026",
            "#001f67",
            "#219e36",
            "#b00000",
            "#f4cd2a",
            "#ffffff",
            "#000000",
          ],
          components: {
            preview: true,
            opacity: true,
            hue: true,
            interaction: {
              hex: true,
              rgba: true,
              input: true,
              save: true,
            },
          },
        });
        pickrInstances.push(pickr);
        // console.log(`[Pickr] Created Pickr for ${cfg.id}`, pickr);
        pickr.on("change", (color, instance) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
          document.documentElement.style.setProperty(cfg.var, value);
          reel[cfg.reelKey] = value;
          onChange();
        });
        pickr.on("init", (instance) => {
          const value = pickr.getColor().toRGBA().toString();
          btn.style.background = value;
          // console.log(`[Pickr] Initialized for ${cfg.id}`);
        });
        pickr.on("save", (color) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
          pickr.hide();
        });
        pickr.on("swatchselect", (color) => {
          const value = color.toRGBA().toString();
          btn.style.background = value;
        });
      } catch (e) {
        // console.error(`[Pickr] Error creating Pickr for ${cfg.id}:`, e);
      }
    });
    // console.log("[Pickr] Finished color picker setup.");
  }, 0);

  // Set values, but do NOT clear or replace form HTML!
  titleInput.value = reel.title || "";
  showTitleCheckbox.checked = !!reel.showTitle;
  showTitleCheckbox.onchange = () => {
    reel.showTitle = showTitleCheckbox.checked;
    onChange();
  };
  // Update on input (but don't call onChange on every keystroke to avoid rerender)
  titleInput.oninput = () => {
    reel.title = titleInput.value;
  };
  titleInput.onblur = () => {
    onChange();
  };

  // Playlist track editing
  function updateTracksEditor() {
    function extractFileName(url) {
      if (!url) return "";
      return url
        .split("/")
        .pop()
        .split("?")[0]
        .replace(/[_-]/g, " ")
        .replace(/\.[^/.]+$/, "");
    }
    // Only clear the tracksEditor section inside the new fieldset
    const tracksEditor = document.getElementById("tracksEditor");
    if (!tracksEditor) return;
    tracksEditor.innerHTML = "";
    reel.playlist.forEach((track, i) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "0.5rem";
      row.style.marginBottom = "0.5rem";
      // Only the drag handle can make this row draggable
      row.draggable = false;

      const dragHandle = document.createElement("span");
      dragHandle.className = "track-drag-handle";
      dragHandle.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:22px;height:22px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
        </svg>
      `;
      dragHandle.style.cursor = "grab";

      const titleField = document.createElement("input");
      titleField.type = "text";
      titleField.setAttribute("inputmode", "text");
      titleField.setAttribute("autocomplete", "off");
      titleField.placeholder = "Track title (optional, overrides file name)";
      titleField.value = track.title;
      titleField.size = 32;
      titleField.oninput = (e) => {
        track.title = e.target.value;
        // Do not call onChange on every input to avoid rerender
      };
      titleField.onblur = () => {
        onChange();
      };

      // Filename "fake" display span
      const fileNameSpan = document.createElement("span");
      fileNameSpan.classList.add("filename-display");
      const filenameText = extractFileName(track.url) || "Dropbox link";
      fileNameSpan.textContent = filenameText;
      if (filenameText === "Dropbox link") {
        fileNameSpan.classList.add("placeholder");
      } else {
        fileNameSpan.classList.remove("placeholder");
      }
      fileNameSpan.style.flex = "2";
      // Additional consistent styling for fileNameSpan
      fileNameSpan.style.minWidth = "14rem";
      fileNameSpan.style.maxWidth = "100%";
      fileNameSpan.style.boxSizing = "border-box";
      fileNameSpan.style.padding = "0.35em 0.7em";
      fileNameSpan.style.fontFamily = "inherit";
      fileNameSpan.style.fontSize = "0.8rem";
      fileNameSpan.style.fontWeight = "400";
      fileNameSpan.tabIndex = 0;

      // The actual input field (hidden by default)
      const urlField = document.createElement("input");
      urlField.type = "text";
      urlField.value = track.url;
      urlField.style.flex = "2";
      // Additional consistent styling for urlField
      urlField.style.minWidth = "14rem";
      urlField.style.maxWidth = "100%";
      urlField.style.boxSizing = "border-box";
      urlField.style.padding = "0.35em 0.7em";
      urlField.style.fontFamily = "inherit";
      urlField.style.fontSize = "0.8rem";
      urlField.style.fontWeight = "400";
      urlField.style.display = "none";

      // When you click the filename, show the input and focus it
      fileNameSpan.onclick = () => {
        fileNameSpan.style.display = "none";
        urlField.style.display = "";
        urlField.focus();
      };

      // When input loses focus, go back to the span
      urlField.onblur = () => {
        const filenameText = extractFileName(urlField.value) || "Dropbox link";
        fileNameSpan.textContent = filenameText;
        if (filenameText === "Dropbox link") {
          fileNameSpan.classList.add("placeholder");
        } else {
          fileNameSpan.classList.remove("placeholder");
        }
        fileNameSpan.style.display = "";
        urlField.style.display = "none";
        track.url = urlField.value;
        onChange();
      };

      urlField.oninput = (e) => {
        track.url = e.target.value;
      };

      urlField.addEventListener("keydown", (e) => {
        if (e.key === "Enter") urlField.blur();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "track-remove-btn";
      removeBtn.type = "button";
      removeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      `;
      removeBtn.onclick = () => {
        reel.playlist.splice(i, 1);
        updateTracksEditor();
        onChange();
      };

      row.appendChild(dragHandle);
      row.appendChild(titleField);
      // Instead of row.appendChild(urlField), do:
      row.appendChild(fileNameSpan);
      row.appendChild(urlField);
      if (reel.playlist.length > 1) row.appendChild(removeBtn);

      // Drag handle events for drag enable/disable (only handle triggers drag)
      dragHandle.addEventListener("mousedown", (e) => {
        row.draggable = true;
      });

      // Restrict drag to only when started from dragHandle
      row.addEventListener("dragstart", (e) => {
        if (e.target !== dragHandle && !dragHandle.contains(e.target)) {
          e.preventDefault(); // Prevent drag if not from handle
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", i);
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        row.draggable = false;
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        row.classList.add("drag-over");
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over");
      });
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drag-over");
        const fromIndex = +e.dataTransfer.getData("text/plain");
        const toIndex = i;
        if (fromIndex !== toIndex) {
          const [moved] = reel.playlist.splice(fromIndex, 1);
          reel.playlist.splice(toIndex, 0, moved);
          updateTracksEditor();
          onChange();
        }
      });
      tracksEditor.appendChild(row);
    });

    // Phantom "Add" row
    const addRow = document.createElement("div");
    addRow.className = "phantom-track-row";
    addRow.style.display = "flex";
    addRow.style.gap = "0.5rem";
    addRow.style.alignItems = "center";
    addRow.style.marginBottom = "0.5rem";
    addRow.style.height = "32px"; // Match button height for alignment
    addRow.style.justifyContent = "space-between"; // align button right

    const flexFiller = document.createElement("span");
    flexFiller.style.flex = "1";
    addRow.appendChild(flexFiller);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "track-remove-btn add-btn";
    addBtn.setAttribute("aria-label", "Add track");
    addBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="track-btn-svg">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    `;
    addBtn.onclick = () => {
      reel.playlist.push({ title: "", url: "" });
      updateTracksEditor();
      onChange();
    };
    addRow.appendChild(addBtn);

    tracksEditor.appendChild(addRow);
  }

  updateTracksEditor();
}
