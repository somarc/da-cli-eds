export default function decorate(block) {
  const link = block.querySelector('a[href$=".mp4"], a[href$=".webm"]');
  if (!link) return;

  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');

  const source = document.createElement('source');
  source.src = link.href;
  source.type = link.href.endsWith('.webm') ? 'video/webm' : 'video/mp4';
  video.appendChild(source);

  link.closest('p')?.replaceWith(video);
}
