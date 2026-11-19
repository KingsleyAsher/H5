const playExhibitScene = (() => {
  const drift = 'cubic-bezier(.44, 0, .24, 1)';
  const settle = 'cubic-bezier(.19, 1, .22, 1)';
  const pressure = 'cubic-bezier(.2, .63, .25, 1)';

  function play(shot, target, frames, duration, easing = drift, delay = 0) {
    const pace = shot.compact ? .83 : 1;
    const animation = target.animate(frames, { duration: duration * pace, easing, delay: delay * pace, fill: 'both' });
    shot.animations.push(animation);
    const finished = animation.finished;
    finished.catch(() => {});
    return finished;
  }

  function center(rect) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function paperGeometry(node) {
    const markers = [[0, 0], [100, 0], [0, 100]].map(([x, y]) => {
      const mark = document.createElement('i');
      mark.className = 'paper-measure';
      mark.style.left = `${x}%`;
      mark.style.top = `${y}%`;
      return mark;
    });
    node.append(...markers);
    const [corner, right, bottom] = markers.map((mark) => mark.getBoundingClientRect());
    for (const mark of markers) mark.remove();
    const across = [right.x - corner.x, right.y - corner.y];
    const down = [bottom.x - corner.x, bottom.y - corner.y];
    return {
      x: corner.x + (across[0] + down[0]) / 2,
      y: corner.y + (across[1] + down[1]) / 2,
      width: Math.hypot(...across), height: Math.hypot(...down),
      angle: Math.atan2(across[1], across[0]) * 180 / Math.PI,
    };
  }

  function pose(actor, frame) {
    const sx = frame.width / actor.width;
    const sy = frame.height / actor.height;
    return `translate3d(${frame.x}px, ${frame.y}px, 0) translate(-50%, -50%) rotateZ(${frame.angle}deg) scale(${sx}, ${sy})`;
  }

  function alignSpine(actor, frame) {
    const shift = (actor.hinge - .5) * frame.width;
    const radians = frame.angle * Math.PI / 180;
    return { ...frame, x: frame.x - shift * Math.cos(radians), y: frame.y - shift * Math.sin(radians) };
  }

  function duplicatePaper(source) {
    const copy = source.cloneNode(true);
    copy.classList.add('paper-scene-copy');
    const originalStyle = getComputedStyle(source);
    copy.style.padding = [originalStyle.paddingTop, originalStyle.paddingRight, originalStyle.paddingBottom, originalStyle.paddingLeft].join(' ');
    for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');
    const originals = [...source.querySelectorAll('canvas')];
    for (const [index, canvas] of [...copy.querySelectorAll('canvas')].entries()) {
      if (originals[index].width && originals[index].height) canvas.getContext('2d').drawImage(originals[index], 0, 0);
    }
    return copy;
  }

  function mountPaper(shot, source, start, fold) {
    const root = document.createElement('div');
    root.className = 'paper-actor';
    const hingePosition = parseFloat(getComputedStyle(source).getPropertyValue('--paper-hinge')) / 100;
    const actor = { root, width: source.offsetWidth, height: source.offsetHeight, hinge: hingePosition, sides: [] };
    Object.assign(root.style, { width: `${actor.width}px`, height: `${actor.height}px`, transform: pose(actor, fold ? alignSpine(actor, start) : start) });
    for (const sign of [-1, 1]) {
      const page = document.createElement('div');
      page.className = sign === -1 ? 'paper-half paper-left' : 'paper-half paper-right';
      page.style.width = `${(sign === -1 ? hingePosition : 1 - hingePosition) * 100}%`;
      if (sign === 1) page.style.left = `${hingePosition * 100}%`;
      page.style.transform = `rotateY(${sign * fold}deg)`;
      const copy = duplicatePaper(source);
      copy.style.width = `${actor.width}px`;
      if (sign === 1) copy.style.left = `${-actor.width * hingePosition}px`;
      page.append(copy);
      const shade = document.createElement('span');
      shade.className = 'paper-half-shade';
      shade.style.opacity = fold ? '.76' : '0';
      page.append(shade);
      actor.sides.push({ page, shade, sign });
      root.append(page);
    }
    shot.objects.append(root);
    return actor;
  }

  function hinge(shot, actor, angles, duration, opening = false) {
    const easing = opening ? settle : drift;
    for (const { page, shade, sign } of actor.sides) {
      play(shot, page, angles.map(([at, angle]) => ({ offset: at, transform: `rotateY(${angle * sign}deg)` })), duration, easing);
      play(shot, shade, angles.map(([at, angle]) => ({ offset: at, opacity: Math.abs(angle) / 109 })), duration, easing);
    }
  }

  function darken(shot, duration) {
    return play(shot, shot.scrim, [{ opacity: 0 }, { opacity: .64, offset: .52 }, { opacity: 1 }], duration);
  }

  function lightUp(shot, duration) {
    return play(shot, shot.scrim, [{ opacity: 1 }, { opacity: .24, offset: .55 }, { opacity: 0 }], duration, pressure);
  }

  function bringCaption(shot, caption, delay, distance = 12) {
    const pieces = getComputedStyle(caption).display === 'contents' ? [...caption.children] : [caption];
    return Promise.all(pieces.map((piece) => play(shot, piece, [
      { opacity: 0, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'none' },
    ], 325, settle, delay)));
  }

  function concealPaper(shot, paper) {
    paper.classList.add('paper-in-flight');
    shot.cleanups.push(() => paper.classList.remove('paper-in-flight'));
  }

  async function liftLetter(shot, letter) {
    await Promise.allSettled(letter.getAnimations().map((animation) => animation.finished));
    if (shot.cancelled) return;
    const resting = getComputedStyle(letter).transform;
    const travel = Math.round(Math.min(87, letter.clientHeight * .255));
    await play(shot, letter, [
      { transform: resting },
      { transform: `translate3d(-9px, -${travel}px, 0) rotateZ(-2deg) ${resting}` },
    ], 275, settle);
  }

  async function approachSpine(shot, paper) {
    const from = paperGeometry(paper);
    const actor = mountPaper(shot, paper, from, 0);
    concealPaper(shot, paper);
    const width = Math.min(innerWidth * .63, 950);
    const spine = { x: innerWidth * .53, y: innerHeight * .48, width, height: Math.min(innerHeight * .65, width * .60), angle: -7 };
    const closer = { ...spine, x: from.x * .52 + spine.x * .48, y: (from.y + spine.y) / 2 - 14, width: (from.width + width) / 2, height: (from.height + spine.height) / 2, angle: -2 };
    const duration = 555;
    hinge(shot, actor, [[0, 0], [.33, 8], [.58, 34], [1, 86]], duration);
    darken(shot, duration);
    await play(shot, actor.root, [
      { transform: pose(actor, from) }, { transform: pose(actor, closer), offset: .38 }, { transform: pose(actor, alignSpine(actor, spine)) },
    ], duration);
    return { actor, spine };
  }

  async function unfoldPaper(shot, paper, folded) {
    // The destination has already laid out, so the last frame is the real paper's position.
    await new Promise(requestAnimationFrame);
    if (shot.cancelled) return;
    const { spine } = folded;
    const target = paperGeometry(paper);
    const actor = mountPaper(shot, paper, spine, 86);
    folded.actor.root.remove();
    concealPaper(shot, paper);
    const near = { ...target, x: target.x - 25, y: target.y - 17, width: target.width * 1.037, height: target.height * 1.037, angle: target.angle - 1.3 };
    hinge(shot, actor, [[0, 86], [.54, 23], [.86, -2.5], [1, 0]], 675, true);
    lightUp(shot, 695);
    const chapter = paper.closest('.screen');
    const caption = chapter.querySelector('.chapter-copy, .opening-copy');
    const reframe = play(shot, actor.root, [
      { transform: pose(actor, alignSpine(actor, spine)) }, { transform: pose(actor, near), offset: .64 }, { transform: pose(actor, target) },
    ], 695, settle);
    await Promise.all([reframe, bringCaption(shot, caption, 335)]);
  }

  function enterDocuments(shot, direction, firstDelay = 0, interval = 64) {
    const cards = [...document.querySelectorAll('.letter-card')];
    return Promise.all(cards.map((card, i) => {
      const side = i === 0 ? -1 : 1;
      const edge = side === -1 ? '0 0 0 25%' : '0 25% 0 0';
      return play(shot, card, [
        { opacity: 0, transform: `perspective(1200px) translate3d(${-side * 68}px, 27px, 0) rotateY(${side * 11}deg) scale(.95)`, ...(!shot.compact && { clipPath: `inset(${edge})` }) },
        { opacity: 1, transform: 'none', ...(!shot.compact && { clipPath: 'inset(0 0 0 0)' }) },
      ], 490, settle, firstDelay + (i === Number(direction < 0) ? 0 : interval));
    }));
  }

  function paperFor(chapter) {
    if (chapter === 'envelope') return document.querySelector('.letter-display.is-open .letter-sheet');
    if (chapter === 'silver') return document.querySelector('.silver-spread');
    return null;
  }

  async function paperScene(shot, previous, reveal) {
    const source = paperFor(previous);
    if (previous === 'envelope' && source) await liftLetter(shot, source);
    if (shot.cancelled) return;
    const folded = source ? await approachSpine(shot, source) : null;
    if (!folded) await darken(shot, 285);
    const next = reveal();
    const target = paperFor(next);
    if (target && folded) {
      await unfoldPaper(shot, target, folded);
    } else if (next === 'letters') {
      folded?.actor.root.remove();
      await Promise.all([lightUp(shot, 510), enterDocuments(shot, shot.direction)]);
    } else {
      folded?.actor.root.remove();
      await lightUp(shot, 410);
    }
  }

  function makeActor(shot, className, frame, width = frame.width, height = frame.height) {
    const root = document.createElement('div');
    root.className = className;
    const actor = { root, width, height };
    Object.assign(root.style, { width: `${width}px`, height: `${height}px`, transform: pose(actor, frame) });
    shot.objects.append(root);
    return actor;
  }

  function detailFrame(rect, crop) {
    const width = rect.width * crop.width;
    const height = rect.height * crop.height;
    return { x: rect.left + rect.width * crop.left + width / 2, y: rect.top + rect.height * crop.top + height / 2, width, height, angle: 0 };
  }

  function placeImageDetail(actor, copy, rect, crop) {
    copy.classList.add('detail-source');
    Object.assign(copy.style, {
      width: `${rect.width}px`, height: `${rect.height}px`,
      left: `${-crop.left * rect.width}px`, top: `${-crop.top * rect.height}px`,
    });
    actor.root.append(copy);
  }

  async function familyLettersScene(shot, reveal) {
    const spread = document.querySelector('.silver-spread');
    const bounds = spread.getBoundingClientRect();
    const crop = { left: .018, top: .213, width: .473, height: .624 };
    const start = detailFrame(bounds, crop);
    const actor = makeActor(shot, 'scene-detail reading-detail', start);
    placeImageDetail(actor, duplicatePaper(spread), bounds, crop);
    const reading = { ...start, x: innerWidth * .315, y: innerHeight * .49, width: start.width * 1.05, height: start.height * 1.05, angle: -2.2 };
    await Promise.all([darken(shot, 505), play(shot, actor.root, [
      { transform: pose(actor, start) }, { transform: pose(actor, reading) },
    ], 505)]);

    const next = reveal();
    const depart = play(shot, actor.root, [
      { transform: `${pose(actor, reading)} rotateY(0deg)`, opacity: 1 },
      { transform: `${pose(actor, { ...reading, x: reading.x - 36 })} perspective(1000px) rotateY(73deg)`, opacity: 0 },
    ], 315);
    const entrance = next === 'letters' ? enterDocuments(shot, 1, 245, 155) : Promise.resolve();
    await Promise.all([depart, lightUp(shot, 575), entrance]);
  }

  function photoArea(image) {
    const box = image.getBoundingClientRect();
    const ratio = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * ratio;
    const height = image.naturalHeight * ratio;
    const middle = center(box);
    return { left: middle.x - width / 2, top: middle.y - height / 2, width, height };
  }

  async function envelopeEvidenceScene(shot, reveal) {
    const image = document.querySelector('.letter-card .document-mount img');
    if (!image.naturalWidth) {
      await darken(shot, 225);
      reveal();
      await lightUp(shot, 360);
      return;
    }

    // On the exhibit photograph the letter is at left, with both envelope faces at right.
    const bounds = photoArea(image);
    const crop = { left: .622, top: .047, width: .35, height: .89 };
    const start = detailFrame(bounds, crop);
    const height = Math.min(innerHeight * .6, 510, (innerWidth - 44) * start.height / start.width);
    const width = height * start.width / start.height;
    const x = Math.min(innerWidth * .54, innerWidth - width / 2 - 22);
    const evidence = { ...start, x, y: innerHeight * .48, width, height, angle: -2 };
    const actor = makeActor(shot, 'scene-detail envelope-detail', start);
    placeImageDetail(actor, image.cloneNode(false), bounds, crop);
    await Promise.all([darken(shot, 530), play(shot, actor.root, [
      { transform: pose(actor, start) }, { transform: pose(actor, evidence) },
    ], 530)]);

    const next = reveal();
    const withdrawn = { ...evidence, x: evidence.x - 34 };
    const depart = play(shot, actor.root, shot.compact ? [
      { transform: pose(actor, evidence), opacity: 1 },
      { transform: pose(actor, withdrawn) + ' scaleX(.08)', opacity: 0 },
    ] : [
      { transform: pose(actor, evidence), clipPath: 'inset(0)' },
      { transform: pose(actor, withdrawn), clipPath: 'inset(0 100% 0 0)' },
    ], 285);
    if (next !== 'journey') {
      await Promise.all([depart, lightUp(shot, 365)]);
      return;
    }

    // The 1944 route is a separate case. The next map takes over the documentary frame.
    const atlas = document.querySelector('#atlas');
    const atlasCenter = center(atlas.getBoundingClientRect());
    const reframe = play(shot, atlas, [
      { transform: `translate3d(${evidence.x - atlasCenter.x}px, ${evidence.y - atlasCenter.y}px, 0) scale(${shot.compact ? '.72, .93' : '.93'})`, opacity: 0, ...(!shot.compact && { clipPath: 'inset(6% 37% 6% 37%)' }) },
      { transform: 'none', opacity: 1, ...(!shot.compact && { clipPath: 'inset(0)' }) },
    ], 620, settle, 210);
    const caption = bringCaption(shot, document.querySelector('.journey-copy'), 430);
    const timeline = bringCaption(shot, document.querySelector('.route-footer'), 550, 8);
    await Promise.all([lightUp(shot, 590), depart, reframe, caption, timeline]);
  }

  function packetStock() {
    const stock = document.createElement('div');
    stock.className = 'packet-stock';
    const address = document.createElement('span');
    address.textContent = '台山收';
    stock.append(address);
    return stock;
  }

  function foldMap(shot, atlas, start) {
    const actor = makeActor(shot, 'map-fold-actor', start, atlas.offsetWidth, atlas.offsetHeight);
    const upper = document.createElement('div');
    upper.className = 'map-fold-upper';
    const lower = document.createElement('div');
    lower.className = 'map-fold-lower';
    const front = document.createElement('div');
    front.className = 'map-fold-front';
    const verso = document.createElement('div');
    verso.className = 'map-fold-verso';
    verso.append(packetStock());
    for (const panel of [upper, front]) {
      const face = duplicatePaper(atlas);
      face.classList.add('map-fold-face');
      face.style.width = `${actor.width}px`;
      face.style.height = `${actor.height}px`;
      panel.append(face);
    }
    lower.append(front, verso);
    actor.root.append(upper, lower);
    return { ...actor, upper, lower };
  }

  async function foldAndPackScene(shot, reveal) {
    const oldAtlas = document.querySelector('#atlas');
    const bounds = oldAtlas.querySelector('.map-paper').getBoundingClientRect();
    const start = { ...center(bounds), width: bounds.width, height: bounds.height, angle: 0 };
    const folded = foldMap(shot, oldAtlas, start);
    concealPaper(shot, oldAtlas);

    const archive = document.querySelector('.archive');
    archive.classList.add('archive-take', 'archive-packing');
    shot.cleanups.push(() => archive.classList.remove('archive-take', 'archive-packing'));
    const aboveTable = { ...start, x: innerWidth * .602, y: innerHeight * .53, width: start.width * .78, height: start.height * .78, angle: -4.5 };
    const flight = play(shot, folded.root, [
      { transform: pose(folded, start) }, { transform: pose(folded, aboveTable) },
    ], 620);
    const fold = play(shot, folded.lower, [
      { transform: 'rotateX(0deg)' }, { transform: 'rotateX(20deg)', offset: .27 },
      { transform: 'rotateX(153deg)', offset: .78 }, { transform: 'rotateX(180deg)' },
    ], 620);
    await Promise.all([flight, fold, darken(shot, 620)]);

    const packetStart = paperGeometry(folded.upper);
    const packet = makeActor(shot, 'loose-packet', packetStart, folded.width, folded.height / 2);
    packet.root.append(packetStock());
    folded.root.remove();
    const next = reveal();
    if (next !== 'archive') {
      packet.root.remove();
      await lightUp(shot, 400);
      return;
    }

    const envelope = archive.querySelector('.archive-display .envelope');
    const flap = envelope.querySelector('.envelope-flap');
    const resting = getComputedStyle(envelope).transform;
    const held = `translateY(${Math.max(57, innerHeight * .093)}px) scale(.86) ${resting}`;
    play(shot, envelope, [{ transform: held }, { transform: held }], 1);

    const insert = document.createElement('div');
    insert.className = 'envelope-insert';
    insert.append(packetStock());
    envelope.append(insert);
    insert.style.visibility = 'hidden';
    shot.cleanups.push(() => insert.remove());
    const mouth = paperGeometry(insert);
    const hover = { ...mouth, y: mouth.y - 24, x: mouth.x - 19, angle: mouth.angle - 3 };
    await Promise.all([lightUp(shot, 435), play(shot, packet.root, [
      { transform: pose(packet, packetStart) }, { transform: pose(packet, hover), offset: .68 },
      { transform: pose(packet, mouth) },
    ], 585, settle)]);

    // Transfer to a real child of the envelope, below its pocket but above its lining.
    insert.style.visibility = 'visible';
    packet.root.remove();
    await play(shot, insert, [
      { transform: 'translateY(0)' }, { transform: 'translateY(159%)', offset: .66 },
      { transform: 'translateY(202%)' },
    ], 470, pressure);

    await play(shot, flap, [
      { transform: 'rotateX(153deg)', zIndex: 1 },
      { transform: 'rotateX(94deg)', zIndex: 1, offset: .43 },
      { transform: 'rotateX(85deg)', zIndex: 4, offset: .49 },
      { transform: 'rotateX(0deg)', zIndex: 4 },
    ], 555);
    insert.remove();
    const envelopeSettled = play(shot, envelope, [{ transform: held }, { transform: resting }], 438, settle);
    await Promise.all([
      envelopeSettled.then(() => pressArchiveSeal(shot, archive)),
      bringCaption(shot, archive.querySelector('.chapter-copy'), 145),
      bringCaption(shot, archive.querySelector('.archive-display figcaption'), 265, 5),
      bringCaption(shot, archive.querySelector('.archive-sources'), 310, 4),
    ]);
  }

  async function pressArchiveSeal(shot, archive) {
    if (shot.cancelled) return;
    const imprint = archive.querySelector('.archive-seal');
    const tool = archive.querySelector('.archive-stamp-tool');
    const shadow = archive.querySelector('.archive-stamp-shadow');
    const rise = Math.round(Math.min(94, Math.max(44, imprint.offsetHeight * 1.06)));
    tool.hidden = false;
    shadow.hidden = false;
    shot.cleanups.push(() => { tool.hidden = shadow.hidden = true; });

    await Promise.all([
      play(shot, tool, [
        { opacity: 0, transform: `translateY(-${rise}px) scale(1.16)` },
        { opacity: 1, transform: `translateY(-${rise * .67}px) scale(1.09)`, offset: .34 },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ], 390, drift),
      play(shot, shadow, [
        { opacity: 0, transform: 'scale(1.19, 1.28)' },
        { opacity: .62, transform: 'scale(1.015, .97)' },
      ], 390, drift),
    ]);

    // The raised face and the printed mark share one position on the envelope.
    await Promise.all([
      play(shot, tool, [
        { transform: 'scale(1)' },
        { transform: 'scale(1.006, .977)', offset: .4 },
        { transform: 'scale(1)' },
      ], 118, pressure),
      play(shot, imprint, [
        { opacity: 0, ...(!shot.compact && { clipPath: 'inset(0 0 100% 0)' }) },
        { opacity: .92, ...(!shot.compact && { clipPath: 'inset(0)' }) },
      ], 118, pressure),
    ]);

    await Promise.all([
      play(shot, tool, [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 1, transform: `translateY(-${rise * .64}px) scale(1.085)`, offset: .56 },
        { opacity: 0, transform: `translateY(-${rise}px) scale(1.15)` },
      ], 375, settle),
      play(shot, shadow, [
        { opacity: .62, transform: 'scale(1.015, .97)' },
        { opacity: 0, transform: 'scale(1.15, 1.21)' },
      ], 310, pressure),
    ]);
    tool.hidden = shadow.hidden = true;
  }

  async function archiveScene(shot, reveal) {
    const archive = document.querySelector('.archive');
    archive.classList.add('archive-take');
    shot.cleanups.push(() => archive.classList.remove('archive-take'));
    await darken(shot, 345);
    const next = reveal();
    const incomingLight = lightUp(shot, 555);
    if (next === 'archive') {
      const packet = archive.querySelector('.envelope');
      const packetPose = getComputedStyle(packet).transform;
      const heldShot = play(shot, packet, [
        { transform: `translate3d(-24px, 14px, 0) scale(1.065) ${packetPose}` },
        { transform: packetPose },
      ], 670, settle);
      await heldShot;
      await pressArchiveSeal(shot, archive);
    }
    await incomingLight;
  }

  return async (shot, previous, requested, reveal) => {
    if (previous === 'silver' && requested === 'letters') {
      await familyLettersScene(shot, reveal);
    } else if (previous === 'letters' && requested === 'journey') {
      await envelopeEvidenceScene(shot, reveal);
    } else if (previous === 'journey' && requested === 'archive') {
      await foldAndPackScene(shot, reveal);
    } else if (requested === 'archive') {
      await archiveScene(shot, reveal);
    } else if (['envelope', 'silver'].includes(previous) && ['envelope', 'silver', 'letters'].includes(requested)) {
      await paperScene(shot, previous, reveal);
    } else {
      await darken(shot, 265);
      const next = reveal();
      const entrance = next === 'letters' ? enterDocuments(shot, shot.direction) : Promise.resolve();
      await Promise.all([lightUp(shot, 390), entrance]);
    }
  };
})();
