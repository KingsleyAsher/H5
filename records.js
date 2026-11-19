const viewer = document.querySelector('#record-viewer');
const readerTitle = document.querySelector('#reader-title');
const readerMeta = document.querySelector('#reader-meta');
const readerClose = document.querySelector('#reader-close');
const viewport = document.querySelector('#reader-viewport');
const imageFrame = document.querySelector('#reader-image-frame');
const readerImage = document.querySelector('#reader-image');
const imageNote = document.querySelector('#reader-image-note');
const readingPanel = document.querySelector('.reader-transcript');
const reading = document.querySelector('#reader-reading');
const imageViews = [...viewer.querySelectorAll('[data-image-view]')];
const paneButtons = [...viewer.querySelectorAll('[data-reader-pane]')];
const zoomOut = document.querySelector('#zoom-out');
const zoomIn = document.querySelector('#zoom-in');
const zoomReset = document.querySelector('#zoom-reset');
const zoomLevel = document.querySelector('#zoom-level');
const nativeDialog = typeof viewer.showModal === 'function';
const exhibitPanels = [...viewer.parentElement.querySelectorAll(':scope > header, :scope > main')];
const pointers = new Map();
const maximumZoom = 3;

let activeRecord;
let imageView;
let magnification = 1;
let pinch;
let fittedWidth;
let fittedHeight;

function anchorAt(clientX, clientY) {
  const image = readerImage.getBoundingClientRect();
  if (!image.width || !image.height) return null;
  return { clientX, clientY, x: (clientX - image.left) / image.width, y: (clientY - image.top) / image.height };
}

function centeredAnchor() {
  const bounds = viewport.getBoundingClientRect();
  return anchorAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
}

function sizeReaderImage(anchor = null) {
  if (!viewer.hasAttribute('open') || !readerImage.complete || !readerImage.naturalWidth) return;

  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  if (width <= 32 || height <= 32) return;
  fittedWidth = width;
  fittedHeight = height;
  const bounds = viewport.getBoundingClientRect();
  const fit = Math.min((width - 32) / readerImage.naturalWidth, (height - 32) / readerImage.naturalHeight);
  const pictureWidth = Math.round(readerImage.naturalWidth * fit * magnification);
  const pictureHeight = Math.round(readerImage.naturalHeight * fit * magnification);
  const frameWidth = Math.max(width, pictureWidth + 24);
  const frameHeight = Math.max(height, pictureHeight + 24);

  readerImage.style.width = `${pictureWidth}px`;
  readerImage.style.height = `${pictureHeight}px`;
  imageFrame.style.width = `${frameWidth}px`;
  imageFrame.style.height = `${frameHeight}px`;
  const targetX = anchor ? anchor.clientX - bounds.left : width / 2;
  const targetY = anchor ? anchor.clientY - bounds.top : height / 2;
  viewport.scrollLeft = (frameWidth - pictureWidth) / 2 + pictureWidth * (anchor?.x ?? .5) - targetX;
  viewport.scrollTop = (frameHeight - pictureHeight) / 2 + pictureHeight * (anchor?.y ?? .5) - targetY;
}

function setMagnification(value, anchor = centeredAnchor()) {
  magnification = Math.max(1, Math.min(maximumZoom, value));
  zoomLevel.textContent = `${Math.round(magnification * 100)}%`;
  zoomOut.disabled = magnification === 1;
  zoomIn.disabled = magnification === maximumZoom;
  viewport.classList.toggle('is-zoomed', magnification > 1);
  sizeReaderImage(anchor);
}

function showRecordPicture(mode) {
  imageView = mode;
  for (const control of imageViews) {
    control.setAttribute('aria-pressed', String(control.dataset.imageView === imageView));
  }
  const thumbnail = activeRecord.querySelector('img');
  const showingBoard = imageView === 'board';
  readerImage.alt = showingBoard ? `${readerTitle.textContent}的展板全图` : thumbnail.alt;
  imageNote.textContent = showingBoard ? '展览现场的整张照片。可缩放、拖动查看展签。' : '展板中家书的局部。可缩放、拖动查看笔迹。';
  readerImage.src = showingBoard ? activeRecord.dataset.board : thumbnail.getAttribute('src');
  setMagnification(1, null);
}

function selectPane(pane) {
  viewer.dataset.pane = pane;
  for (const button of paneButtons) button.setAttribute('aria-pressed', String(button.dataset.readerPane === pane));
}

function syncReaderHeight() {
  if (viewer.hasAttribute('open')) {
    viewer.style.setProperty('--reader-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
  }
}

function openReader() {
  document.documentElement.classList.add('reader-open');
  if (nativeDialog) {
    viewer.showModal();
  } else {
    viewer.dataset.dialogFallback = '';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('open', '');
    for (const panel of exhibitPanels) {
      panel.inert = true;
      panel.setAttribute('aria-hidden', 'true');
    }
    readerClose.focus({ preventScroll: true });
  }
  syncReaderHeight();
}

function afterReaderClose() {
  document.documentElement.classList.remove('reader-open');
  pointers.clear();
  pinch = undefined;
  viewport.classList.remove('is-dragging');
  activeRecord?.focus({ preventScroll: true });
}

function closeReader() {
  if (!viewer.hasAttribute('open')) return;
  if (nativeDialog) {
    viewer.close();
  } else {
    viewer.removeAttribute('open');
    for (const panel of exhibitPanels) {
      panel.inert = false;
      panel.removeAttribute('aria-hidden');
    }
    afterReaderClose();
  }
}

for (const trigger of document.querySelectorAll('.record-trigger')) {
  trigger.addEventListener('click', () => {
    activeRecord = trigger;
    const card = trigger.closest('.letter-card');
    readerTitle.textContent = card.querySelector('h3').textContent;
    readerMeta.textContent = card.querySelector('.letter-meta').innerText;
    reading.replaceChildren(card.querySelector('.record-reading').content.cloneNode(true));
    selectPane('image');
    openReader();
    readingPanel.scrollTop = 0;
    showRecordPicture('document');
  });
}

readerClose.addEventListener('click', closeReader);
viewer.addEventListener('click', (event) => {
  if (event.target === viewer) closeReader();
});
viewer.addEventListener('close', afterReaderClose);
window.addEventListener('hashchange', closeReader);
window.addEventListener('resize', syncReaderHeight);
window.visualViewport?.addEventListener('resize', syncReaderHeight);
viewer.addEventListener('keydown', (event) => {
  if (nativeDialog) return;
  if (event.key === 'Escape') closeReader();
  if (event.key !== 'Tab') return;
  const controls = [...viewer.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')]
    .filter((control) => control.getClientRects().length);
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

for (const button of paneButtons) button.addEventListener('click', () => selectPane(button.dataset.readerPane));

for (const control of imageViews) {
  control.addEventListener('click', () => {
    if (control.dataset.imageView !== imageView) showRecordPicture(control.dataset.imageView);
  });
}
readerImage.addEventListener('load', () => sizeReaderImage());
function adjustImageToViewport() {
  if (viewport.clientWidth !== fittedWidth || viewport.clientHeight !== fittedHeight) sizeReaderImage();
}
if ('ResizeObserver' in window) new ResizeObserver(adjustImageToViewport).observe(viewport);
else window.addEventListener('resize', adjustImageToViewport);

zoomOut.addEventListener('click', () => setMagnification(magnification - .5));
zoomIn.addEventListener('click', () => setMagnification(magnification + .5));
zoomReset.addEventListener('click', () => setMagnification(1, null));

function touchPair() {
  const [first, second] = pointers.values();
  return {
    x: (first.x + second.x) / 2, y: (first.y + second.y) / 2,
    distance: Math.hypot(first.x - second.x, first.y - second.y),
  };
}

viewport.addEventListener('pointerdown', (event) => {
  if (pointers.size === 2 || (event.pointerType !== 'touch' && (magnification === 1 || event.button !== 0))) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  viewport.setPointerCapture?.(event.pointerId);
  viewport.classList.add('is-dragging');
  if (pointers.size === 2) {
    const pair = touchPair();
    const anchor = anchorAt(pair.x, pair.y);
    if (anchor) pinch = { distance: Math.max(1, pair.distance), zoom: magnification, anchor };
  }
});
viewport.addEventListener('pointermove', (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch) {
    const pair = touchPair();
    setMagnification(pinch.zoom * pair.distance / pinch.distance, { ...pinch.anchor, clientX: pair.x, clientY: pair.y });
  } else if (pointers.size === 1 && magnification > 1) {
    viewport.scrollLeft += previous.x - event.clientX;
    viewport.scrollTop += previous.y - event.clientY;
  }
});
function releasePointer(event) {
  if (!pointers.delete(event.pointerId)) return;
  pinch = undefined;
  if (pointers.size === 0) viewport.classList.remove('is-dragging');
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(type, releasePointer);
