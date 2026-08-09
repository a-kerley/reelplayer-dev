// tabController.js - generic N-way sidebar/main-view tab switch, replacing
// what used to be a hardcoded two-way if/else in mediaLibrary.js. Reels,
// Pages, and Media Library each register one entry; clicking a tab hides
// every other entry's panel/mainView and applies that entry's activeClass
// (if any) to .builder-main - see CLAUDE.md's "Layout gotcha" section for
// why some views (Media Library today, Pages potentially) need to override
// .builder-main's default padding-bottom.
export function createTabController(entries) {
  const builderMain = document.querySelector(".builder-main");

  function activate(target) {
    entries.forEach((entry) => {
      const isActive = entry === target;
      entry.btn.classList.toggle("active", isActive);
      entry.panel.style.display = isActive ? "" : "none";
      if (entry.mainView) entry.mainView.style.display = isActive ? "" : "none";
      if (entry.activeClass && builderMain) {
        builderMain.classList.toggle(entry.activeClass, isActive);
      }
    });
    target.onActivate?.();
  }

  entries.forEach((entry) => {
    entry.btn.onclick = () => activate(entry);
  });

  return { activate };
}
