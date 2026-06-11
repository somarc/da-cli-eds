/* metrics block
 * Each row authored as: | figure | label | note (optional) |
 * A row whose first cell is empty (note-only) becomes a full-width caveat line.
 * The first heading inside the block is treated as a terminal eyebrow.
 */
export default function decorate(block) {
  const eyebrow = block.querySelector('h2, h3, h4');
  if (eyebrow) {
    const p = document.createElement('p');
    p.className = 'metrics-eyebrow';
    p.textContent = eyebrow.textContent;
    block.parentElement.insertBefore(p, block);
    eyebrow.closest('div')?.remove();
  }

  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const figure = (cells[0]?.textContent || '').trim();
    const li = document.createElement('li');

    if (!figure) {
      // note-only row → full-width caveat
      li.className = 'metric-caveat';
      const note = document.createElement('p');
      note.className = 'metric-note';
      note.innerHTML = cells.slice(1).map((c) => c.innerHTML).join(' ').trim()
        || cells.map((c) => c.innerHTML).join(' ').trim();
      li.append(note);
    } else {
      const fig = document.createElement('span');
      fig.className = 'metric-figure';
      fig.textContent = figure;
      li.append(fig);

      if (cells[1] && cells[1].textContent.trim()) {
        const label = document.createElement('span');
        label.className = 'metric-label';
        label.innerHTML = cells[1].innerHTML;
        li.append(label);
      }
      if (cells[2] && cells[2].textContent.trim()) {
        const note = document.createElement('span');
        note.className = 'metric-note';
        note.innerHTML = cells[2].innerHTML;
        li.append(note);
      }
    }
    ul.append(li);
  });

  block.replaceChildren(ul);
}
