const events = [
  {
    date: '1944.06.09', datetime: '1944-06-09', title: '纽约寄出',
    description: '这封银信在纽约挂号寄出，目的地是广东台山。次日，它在纽约接受检查并留下封口记录。',
    next: '沿邮路前行', distance: 0,
  },
  {
    date: '1944—1945', title: '飞越驼峰',
    description: '战时邮路曲折。这封银信辗转经驼峰航线进入中国，途经重庆，继续寄往台山。',
    next: '抵达台山', distance: 2,
  },
  {
    date: '1945.04.05', datetime: '1945-04-05', title: '到达台山',
    description: '从纽约挂号寄出到第一次抵达台山，已经过去将近十个月。信到了台山，投递却还没有完成。',
    next: '查看退回记录', distance: 3,
  },
  {
    date: '1945.04.05 之后', title: '到台山，退回',
    description: '台山当时仍处于沦陷中。这封已经抵达台山的银信被退回，收件人还要继续等。',
    next: '查看「再送台山」', distance: 3, stamp: '退回',
  },
  {
    date: '1946.11.09', datetime: '1946-11-09', title: '再送台山',
    description: '广州邮局写下「再送台山」，将信交给中国银行台山分行。自纽约寄出约两年五个月后，这封银信终于送到收件人手上。',
    next: '重走邮路', distance: 3, stamp: '再送台山',
  },
];

const exhibit = document.querySelector('.exhibit');
const chapters = new Map([...document.querySelectorAll('[data-chapter]')].map((section) => [section.dataset.chapter, section]));
const chapterOrder = [...chapters.keys()];
const navigation = [...document.querySelectorAll('nav a')];
const letterDisplay = document.querySelector('#letter-display');
const letterAnnouncement = document.querySelector('#letter-announcement');
const unseal = document.querySelector('#unseal');
const reseal = document.querySelector('#reseal');
const openedActions = document.querySelector('#opened-actions');
const followLetter = openedActions.querySelector('a');
const atlas = document.querySelector('#atlas');
const eventDate = document.querySelector('#event-date');
const eventTitle = document.querySelector('#event-title');
const eventDescription = document.querySelector('#event-description');
const nextEvent = document.querySelector('#next-event');
const nextLabel = nextEvent.firstElementChild;
const journeyFinish = document.querySelector('#journey-finish');
const timeline = [...document.querySelectorAll('.timeline button')];
const stamp = document.querySelector('#map-stamp');
const chapterFilm = document.querySelector('#chapter-film');
const filmScrim = chapterFilm.querySelector('.film-scrim');
const filmObjects = chapterFilm.querySelector('.film-objects');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = 'cubic-bezier(.23, 1, .32, 1)';

let currentStep = 0;
let copyAnimation;
let stampAnimation;
let routeFrame;
let drawnDistance = 0;
let activeCut;

function setEnvelopeOpen(open, keyboard) {
  letterDisplay.classList.toggle('is-open', open);
  openedActions.hidden = !open;
  unseal.hidden = open;
  letterAnnouncement.textContent = open ? '已开封。一九四四年六月九日，纽约寄出，广东台山收。' : '';
  if (keyboard) (open ? followLetter : unseal).focus();
}

unseal.addEventListener('click', (event) => setEnvelopeOpen(true, event.detail === 0));
reseal.addEventListener('click', (event) => setEnvelopeOpen(false, event.detail === 0));

function requestedChapter() {
  const requested = location.hash.slice(1);
  return chapters.has(requested) ? requested : 'envelope';
}

function showScreen(screen, focusHeading = false) {
  const previous = exhibit.dataset.screen;
  cancelAnimationFrame(routeFrame);
  if (screen === 'journey') {
    if (previous !== 'journey' && currentStep !== 0) chooseEvent(0, false);
    else drawRoute(events[currentStep].distance);
  }

  exhibit.dataset.screen = screen;
  for (const [name, chapter] of chapters) chapter.hidden = name !== screen;
  for (const link of navigation) {
    if (link.hash === `#${screen}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  if (focusHeading) {
    window.scrollTo(0, 0);
    const chapter = chapters.get(screen);
    document.getElementById(chapter.getAttribute('aria-labelledby')).focus({ preventScroll: true });
  }
}

function clearChapterCut() {
  const cut = activeCut;
  if (!cut) return;
  activeCut = undefined;
  cut.cancelled = true;
  chapterFilm.hidden = true;
  cut.animations.forEach((animation) => animation.cancel());
  cut.cleanups.forEach((cleanup) => cleanup());
  filmObjects.replaceChildren();
}

async function playChapterCut(cut, previous, requested) {
  try {
    await playExhibitScene(cut, previous, requested, () => {
      if (activeCut !== cut) throw new DOMException('Scene closed', 'AbortError');
      const screen = requestedChapter();
      showScreen(screen, true);
      return screen;
    });
  } catch (error) {
    if (activeCut === cut && error.name !== 'AbortError') {
      console.warn('Chapter motion could not complete', error);
      showScreen(requestedChapter(), true);
    }
  } finally {
    if (activeCut === cut) {
      clearChapterCut();
      turnToChapter();
    }
  }
}

function turnToChapter() {
  const requested = requestedChapter();
  const previous = exhibit.dataset.screen;
  if (reduceMotion.matches || document.hidden) {
    clearChapterCut();
    if (requested !== previous) showScreen(requested, true);
    return;
  }
  if (activeCut || requested === previous) return;

  const direction = chapterOrder.indexOf(requested) > chapterOrder.indexOf(previous) ? 1 : -1;
  activeCut = { direction, animations: [], cleanups: [], scrim: filmScrim, objects: filmObjects };
  chapterFilm.hidden = false;
  void playChapterCut(activeCut, previous, requested);
}

function chooseEvent(index, animate = true) {
  const entry = events[index];
  if (index === currentStep) return;

  currentStep = index;
  atlas.dataset.step = index;
  eventDate.textContent = entry.date;
  if (entry.datetime) eventDate.setAttribute('datetime', entry.datetime);
  else eventDate.removeAttribute('datetime');
  eventTitle.textContent = entry.title;
  eventDescription.textContent = entry.description;
  nextLabel.textContent = entry.next;
  journeyFinish.hidden = index !== events.length - 1;
  nextEvent.parentElement.classList.toggle('is-complete', !journeyFinish.hidden);
  for (const [position, button] of timeline.entries()) {
    if (position === index) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
    button.parentElement.classList.toggle('is-past', position < index);
    button.parentElement.classList.toggle('before-return', index === 3 && position === 2);
  }

  stamp.textContent = entry.stamp ?? '';
  stamp.classList.toggle('is-inked', Boolean(entry.stamp));
  copyAnimation?.cancel();
  stampAnimation?.cancel();
  if (animate && !reduceMotion.matches) {
    copyAnimation = eventTitle.parentElement.animate(
      [{ opacity: .46, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }],
      { duration: 250, easing: easeOut },
    );
    if (entry.stamp) {
      const angle = getComputedStyle(stamp).getPropertyValue('--stamp-angle').trim();
      stampAnimation = stamp.animate([
        { opacity: 0, transform: `rotate(${angle}) scale(1.13)` },
        { opacity: 1, transform: `rotate(${angle}) scale(.987)`, offset: .4 },
        { opacity: .92, transform: `rotate(${angle}) scale(1)` },
      ], { duration: 295, easing: easeOut });
    }
  }
  moveRoute(entry.distance, animate);
}

nextEvent.addEventListener('click', (event) => chooseEvent((currentStep + 1) % events.length, event.detail !== 0));
for (const button of timeline) {
  button.addEventListener('click', (event) => chooseEvent(Number(button.dataset.step), event.detail !== 0));
}

// The basemap and interactive overlay share one fixed geographic extent.
const canvas = document.querySelector('#map-ink');
const ink = canvas.getContext('2d');
const mapWidth = 1000;
const mapHeight = 584;
const density = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = mapWidth * density;
canvas.height = mapHeight * density;
ink.scale(density, density);

function project(lon, lat) {
  return [30 + (lon + 127) / 277 * 940, 30 + (77 - lat) / 115 * 495];
}

const newYork = project(-74.01, 40.71);
const hump = project(94.7, 27.35);
const chongqing = project(106.55, 29.56);
const taishan = project(112.8, 22.25);
const legs = [
  { start: newYork, bend: [[366, 68], [630, 143]], end: hump, dashed: true },
  { start: hump, bend: [[797, 238], [807, 235]], end: chongqing },
  { start: chongqing, bend: [[831, 238], [840, 251]], end: taishan },
];

function cubicPoint(leg, t) {
  const u = 1 - t;
  return [0, 1].map((axis) => (
    u ** 3 * leg.start[axis] + 3 * u * u * t * leg.bend[0][axis] +
    3 * u * t * t * leg.bend[1][axis] + t ** 3 * leg.end[axis]
  ));
}

function drawLeg(leg, amount) {
  const sampleCount = Math.ceil(amount * (leg.dashed ? 80 : 24));
  ink.beginPath();
  ink.moveTo(...leg.start);
  for (let i = 1; i <= sampleCount; i += 1) ink.lineTo(...cubicPoint(leg, amount * i / sampleCount));
  ink.setLineDash(leg.dashed ? [7, 8] : []);
  ink.strokeStyle = '#893021';
  ink.lineWidth = leg.dashed ? 2.8 : 3.8;
  ink.lineCap = 'round';
  ink.stroke();
  ink.setLineDash([]);
}

function drawPoint(point, active, destination = false) {
  ink.beginPath();
  ink.arc(...point, destination ? 7 : 5.5, 0, Math.PI * 2);
  ink.fillStyle = active ? '#8e2c1f' : '#b98e62';
  ink.strokeStyle = active ? '#f6dfb4' : '#6e5036';
  ink.lineWidth = 1.85;
  ink.fill();
  ink.stroke();
}

function drawRoute(distance) {
  drawnDistance = distance;
  ink.clearRect(0, 0, mapWidth, mapHeight);
  for (const [index, leg] of legs.entries()) {
    const progress = Math.min(1, distance - index);
    if (progress > 0) drawLeg(leg, progress);
  }
  drawPoint(newYork, true);
  drawPoint(hump, distance >= 1);
  drawPoint(chongqing, distance >= 2);
  drawPoint(taishan, distance >= 3, true);

  const advancingLeg = Math.floor(distance);
  const progress = distance - advancingLeg;
  if (progress > .035 && progress < .97 && legs[advancingLeg]) {
    const [x, y] = cubicPoint(legs[advancingLeg], progress);
    ink.beginPath();
    ink.arc(x, y, 11, 0, Math.PI * 2);
    ink.fillStyle = '#983d242e';
    ink.fill();
    drawPoint([x, y], true);
  }

  if (currentStep === 3) {
    ink.beginPath();
    ink.arc(...taishan, 14, 0, Math.PI * 2);
    ink.strokeStyle = '#992d20';
    ink.lineWidth = 1.9;
    ink.setLineDash([3, 3]);
    ink.stroke();
    ink.setLineDash([]);
  }
}

function moveRoute(target, animate) {
  cancelAnimationFrame(routeFrame);
  const start = drawnDistance;
  if (!animate || reduceMotion.matches || target <= start) {
    drawRoute(target);
    return;
  }

  const duration = start < 1 ? 900 : 500;
  const started = performance.now();
  function drawFrame(now) {
    const time = Math.min((now - started) / duration, 1);
    const progress = time * time * (3 - 2 * time);
    drawRoute(start + (target - start) * progress);
    if (time < 1) routeFrame = requestAnimationFrame(drawFrame);
  }
  routeFrame = requestAnimationFrame(drawFrame);
}

window.addEventListener('hashchange', turnToChapter);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && activeCut) turnToChapter();
});
reduceMotion.addEventListener('change', () => {
  if (!reduceMotion.matches) return;
  turnToChapter();
  cancelAnimationFrame(routeFrame);
  copyAnimation?.cancel();
  stampAnimation?.cancel();
  drawRoute(events[currentStep].distance);
});
showScreen(requestedChapter());
