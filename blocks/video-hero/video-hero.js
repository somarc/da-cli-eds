function afterWindowLoad(callback) {
  const run = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 1800 });
    else window.setTimeout(callback, 250);
  };

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

function videoMimeType(src) {
  try {
    const extension = new URL(src, window.location.href).pathname.split('.').pop().toLowerCase();
    return {
      mp4: 'video/mp4',
      webm: 'video/webm',
      ogg: 'video/ogg',
    }[extension] || '';
  } catch {
    return '';
  }
}

export default function decorate(block) {
  let videoSrc;
  let poster;

  [...block.children].forEach((row) => {
    const link = row.querySelector('a[href]');
    if (!videoSrc && link && /\.(mp4|webm|ogg)(\?|#|$)/i.test(link.href)) {
      videoSrc = link.href;
      row.remove();
      return;
    }

    const media = row.querySelector('picture, img');
    if (!poster && media && !row.querySelector('h1, h2, h3, h4, h5, h6')) {
      if (media.tagName === 'PICTURE') poster = media;
      else {
        poster = document.createElement('picture');
        poster.append(media);
      }
      row.remove();
    }
  });

  const content = document.createElement('div');
  content.className = 'video-hero-content';
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => {
      while (cell.firstChild) content.append(cell.firstChild);
    });
  });

  const heroHeading = content.querySelector('h1');
  const authoredKicker = heroHeading?.previousElementSibling;
  if (authoredKicker?.matches('p')) authoredKicker.classList.add('release-kicker');

  block.textContent = '';

  if (poster) {
    poster.classList.add('video-hero-poster');
    poster.setAttribute('aria-hidden', 'true');
    const image = poster.querySelector('img');
    if (image) {
      image.alt = '';
      image.loading = 'eager';
      image.setAttribute('fetchpriority', 'high');
    }
    block.append(poster);
    block.classList.add('has-poster');
  }

  if (videoSrc) {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('aria-hidden', 'true');
    block.append(video);
    block.classList.add('has-video');

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      afterWindowLoad(() => {
        const source = document.createElement('source');
        source.src = videoSrc;
        const type = videoMimeType(videoSrc);
        if (type) source.type = type;
        video.append(source);
        video.preload = 'metadata';
        video.addEventListener('playing', () => block.classList.add('is-playing'), { once: true });
        video.load();
        video.play().catch(() => {
          // The poster and field fallback remain the complete static experience.
        });
      });
    }
  }

  block.append(content);
}
