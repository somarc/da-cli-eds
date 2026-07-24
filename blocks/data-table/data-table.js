function nearestSectionHeading(block) {
  const sectionHeading = block.closest('.section')?.querySelector('h2, h3');
  if (sectionHeading) return sectionHeading.textContent.trim();

  let current = block.previousElementSibling;
  while (current) {
    const heading = current.matches('h2, h3') ? current : current.querySelector('h2, h3');
    if (heading) return heading.textContent.trim();
    current = current.previousElementSibling;
  }
  return 'Reference';
}

function tableCell(source, tagName, scope) {
  const cell = document.createElement(tagName);
  if (scope) cell.scope = scope;
  while (source.firstChild) cell.append(source.firstChild);
  return cell;
}

export default function decorate(block) {
  const sourceRows = [...block.children];
  if (!sourceRows.length) return;

  const label = nearestSectionHeading(block);
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const header = document.createElement('tr');
  const headerRow = sourceRows.shift();

  caption.className = 'visually-hidden';
  caption.textContent = `${label} reference table`;
  [...headerRow.children].forEach((cell) => header.append(tableCell(cell, 'th', 'col')));
  thead.append(header);

  sourceRows.forEach((sourceRow) => {
    const row = document.createElement('tr');
    [...sourceRow.children].forEach((cell, index) => {
      row.append(tableCell(cell, index === 0 ? 'th' : 'td', index === 0 ? 'row' : null));
    });
    tbody.append(row);
  });

  table.append(caption, thead, tbody);
  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', `${label} table; scroll horizontally when needed`);
  block.tabIndex = 0;
  block.replaceChildren(table);
}
