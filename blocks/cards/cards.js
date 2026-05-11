import { createOptimizedPicture } from '../../scripts/aem.js';

const CMD_GROUPS = {
  'da auth': 'group-foundation',
  'da config': 'group-foundation',
  'da content': 'group-data',
  'da preview': 'group-delivery',
  'da publish': 'group-delivery',
  'da route': 'group-management',
  'da index': 'group-management',
  'da migrate': 'group-quality',
  'da audit': 'group-quality',
  'da pipeline': 'group-orchestration',
};

export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    const heading = li.querySelector('h3');
    if (heading) {
      const group = CMD_GROUPS[heading.textContent.trim().toLowerCase()];
      if (group) li.classList.add(group);
    }
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));
  block.replaceChildren(ul);
}
