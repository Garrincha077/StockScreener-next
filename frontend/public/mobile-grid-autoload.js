(() => {
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  let busy = false;

  function parseCounts(grid) {
    const text = grid.querySelector('header span')?.textContent || '';
    const match = text.match(/([\d,]+)\s+of\s+([\d,]+)/i);
    if (!match) return null;
    return {
      shown: Number(match[1].replace(/,/g, '')),
      total: Number(match[2].replace(/,/g, '')),
    };
  }

  function loadMoreIfNeeded() {
    if (!isMobile() || busy) return;
    const grid = document.querySelector('.dv-gridview');
    if (!grid) return;

    const counts = parseCounts(grid);
    if (!counts || counts.shown >= counts.total) return;

    const distanceToBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
    if (distanceToBottom > 1200) return;

    const select = grid.querySelector('header select');
    if (!select) return;

    const next = Math.min(counts.total, counts.shown + 16);
    busy = true;

    let option = Array.from(select.options).find(o => Number(o.value) === next);
    if (!option) {
      option = document.createElement('option');
      option.value = String(next);
      option.textContent = next === counts.total ? `All (${next})` : String(next);
      select.appendChild(option);
    }

    select.value = String(next);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    window.setTimeout(() => { busy = false; loadMoreIfNeeded(); }, 500);
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      loadMoreIfNeeded();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', loadMoreIfNeeded, { passive: true });

  const observer = new MutationObserver(() => loadMoreIfNeeded());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('DOMContentLoaded', loadMoreIfNeeded);
})();
