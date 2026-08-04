export default function decorate(block) {
  const list = document.createElement('ol');

  [...block.children].forEach((row, index) => {
    const cells = [...row.children];
    const item = document.createElement('li');
    const marker = document.createElement('span');
    const body = document.createElement('div');
    const command = document.createElement('div');

    marker.className = 'operator-loop-marker';
    marker.textContent = cells[0]?.textContent.trim() || String(index + 1).padStart(2, '0');
    marker.setAttribute('aria-hidden', 'true');

    body.className = 'operator-loop-body';
    if (cells[1]) {
      while (cells[1].firstChild) body.append(cells[1].firstChild);
    }

    command.className = 'operator-loop-command';
    if (cells[2]) {
      while (cells[2].firstChild) command.append(cells[2].firstChild);
    }

    const heading = body.querySelector('h2, h3, h4');
    const stage = heading?.textContent.trim().toLowerCase() || '';
    if (stage.includes('publish')) {
      const gate = document.createElement('span');
      gate.className = 'operator-loop-gate';
      gate.textContent = 'Human approval required';
      heading?.append(gate);
      item.classList.add('is-gated');
    }
    if (stage) item.dataset.stage = stage;

    item.append(marker, body);
    if (command.hasChildNodes()) item.append(command);
    list.append(item);
  });

  block.replaceChildren(list);
}
