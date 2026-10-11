import { useEffect } from 'react';

// На телефоне строки таблиц показываются карточками, и каждой ячейке нужна
// подпись колонки: берём её из шапки таблицы и кладём в data-label.
function labelTable(table) {
  const head = table.tHead?.rows[0];
  if (!head) return;
  const names = [];
  for (const th of head.cells) {
    for (let i = 0; i < (th.colSpan || 1); i += 1) names.push(th.textContent.trim());
  }
  for (const body of [...table.tBodies, table.tFoot].filter(Boolean)) {
    for (const row of body.rows) {
      let col = 0;
      for (const cell of row.cells) {
        const label = cell.colSpan > 1 ? '' : names[col] || '';
        if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
        col += cell.colSpan || 1;
      }
    }
  }
}

export default function useTableLabels(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let frame = 0;
    const run = () => {
      frame = 0;
      root.querySelectorAll('.table-wrap .table').forEach(labelTable);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
