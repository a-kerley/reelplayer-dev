export function loadReels() {
  const json = localStorage.getItem('reelList');
  return json ? JSON.parse(json) : [];
}

export function saveReels(reels) {
  localStorage.setItem('reelList', JSON.stringify(reels));
}

export function renderSidebar(reels, currentId, onSelect, onNew, onDelete) {
  const list = document.getElementById('reelList');
  list.innerHTML = '';

  // Sort reels by most recent (descending createdAt), fallback to 0
  const sortedReels = Object.entries(
    reels.reduce((acc, reel) => {
      acc[reel.id] = reel;
      return acc;
    }, {})
  ).sort((a, b) => {
    return (b[1].createdAt || 0) - (a[1].createdAt || 0);
  });

  sortedReels.forEach(([id, reel]) => {
    const li = document.createElement('li');
    li.className = reel.id === currentId ? 'active' : '';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = reel.title || '(untitled reel)';
    titleSpan.onclick = () => onSelect(reel.id);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-reel-btn';
    delBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px;">
        <path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z" clip-rule="evenodd" />
      </svg>
    `;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (e.target.closest('.delete-reel-btn')) {
        if (confirm('Delete this reel?')) onDelete(reel.id);
      }
    };

    li.appendChild(titleSpan);
    li.appendChild(delBtn);
    list.appendChild(li);
  });
  const newReelBtn = document.getElementById('newReelBtn');
  if (newReelBtn) {
    newReelBtn.textContent = 'New Player';
    newReelBtn.onclick = onNew;
  }
}