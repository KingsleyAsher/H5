(() => {
  const surfaces = [...document.querySelectorAll('.paper-relief')];
  const cachedSizes = new WeakMap();
  let fontsReady = false;

  function lineOffset(node, paper) {
    let x = 0;
    let y = 0;
    for (let part = node; part && part !== paper; part = part.offsetParent) {
      x += part.offsetLeft;
      y += part.offsetTop;
    }
    return { x, y, height: node.offsetHeight };
  }

  function traceFold(context, positions, vertical, shift) {
    context.beginPath();
    for (let i = 0; i < positions.length; i += 2) {
      const position = positions[i] + shift;
      const point = vertical ? [position, i] : [i, position];
      if (i === 0) context.moveTo(...point);
      else context.lineTo(...point);
    }
  }

  function shadeFold(context, positions, vertical, density) {
    // A broad cast shadow and two close, uneven edges make a shallow paper ridge.
    const bands = [
      [21, 1.2, '#62412413'], [11, 1.9, '#6f461c22'],
      [4.6, -2.1, '#fff5d440'], [3.0, 1.65, '#6c3b1c31'],
      [1.05, -1.05, '#fff3d086'], [0.7, 1.05, '#653b2142'],
    ];
    for (const [weight, offset, color] of bands) {
      traceFold(context, positions, vertical, offset * density);
      context.lineWidth = weight * density;
      context.strokeStyle = color;
      context.stroke();
    }
  }

  function shiftInk(distance, reach, amount) {
    const influence = Math.max(0, 1 - Math.abs(distance) / reach);
    return amount * influence * influence;
  }

  function warpInk(context, source, vertical, horizontal, density) {
    const { width, height, data } = source;
    const result = context.createImageData(width, height);
    const output = result.data;
    const reach = 24 * density;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Sample the pen strokes on the same ridges used to shade the paper.
        const sourceX = x - shiftInk(x - vertical[y], reach, 7 * density);
        const sourceY = y - shiftInk(y - horizontal[x], reach, 8.5 * density);
        if (sourceX < 0 || sourceY < 0 || sourceX >= width - 1 || sourceY >= height - 1) continue;

        const left = Math.floor(sourceX);
        const top = Math.floor(sourceY);
        const dx = sourceX - left;
        const dy = sourceY - top;
        const a = (top * width + left) * 4;
        const b = a + 4;
        const c = a + width * 4;
        const d = c + 4;
        const aa = data[a + 3] * (1 - dx) * (1 - dy);
        const ab = data[b + 3] * dx * (1 - dy);
        const ac = data[c + 3] * (1 - dx) * dy;
        const ad = data[d + 3] * dx * dy;
        const alpha = aa + ab + ac + ad;
        if (alpha < 1) continue;

        const target = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          output[target + channel] = (data[a + channel] * aa + data[b + channel] * ab +
            data[c + channel] * ac + data[d + channel] * ad) / alpha;
        }
        const grain = ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 17, 19349663)) >>> 0) % 41;
        output[target + 3] = alpha * (.77 + grain / 210);
      }
    }
    context.putImageData(result, 0, 0);
  }

  function drawPaper(canvas) {
    if (!fontsReady) return;
    const paper = canvas.parentElement;
    const { clientWidth, clientHeight } = paper;
    const density = Math.min(window.devicePixelRatio || 1, 1.65);
    const width = Math.round(clientWidth * density);
    const height = Math.round(clientHeight * density);
    const size = `${width}x${height}`;
    if (width < 40 || height < 40 || cachedSizes.get(canvas) === size) return;

    const ink = document.createElement('canvas');
    ink.width = width;
    ink.height = height;
    const pen = ink.getContext('2d', { willReadFrequently: true });
    const relief = canvas.getContext('2d');
    if (!pen || !relief) return;
    canvas.width = width;
    canvas.height = height;
    pen.scale(density, density);
    const lines = [...paper.querySelectorAll('[data-paper-ink]')];

    for (const line of lines) {
      const style = getComputedStyle(line);
      const box = lineOffset(line, paper);
      pen.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const spacing = parseFloat(style.letterSpacing) || 0;
      pen.fillStyle = style.getPropertyValue('--ink-color');
      const metrics = pen.measureText(line.textContent);
      const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
      const baseline = box.y + (box.height + (ascent ?? parseFloat(style.fontSize) * .82) - (descent ?? 0)) / 2;
      if ('letterSpacing' in pen || spacing === 0) {
        pen.letterSpacing = `${spacing}px`;
        pen.fillText(line.textContent, box.x, baseline);
      } else {
        let x = box.x;
        for (const character of line.textContent) {
          pen.fillText(character, x, baseline);
          x += pen.measureText(character).width + spacing;
        }
      }
    }

    const isSpread = canvas.dataset.paper === 'spread';
    const center = parseFloat(getComputedStyle(paper).getPropertyValue('--paper-hinge')) / 100;
    const crossingLine = lineOffset(lines[isSpread ? 2 : 1], paper);
    const creaseHeight = (crossingLine.y + crossingLine.height * .52) * density;
    const vertical = Float32Array.from({ length: height }, (_, y) => {
      const progress = y / height;
      return width * (center + .015 * (progress - .5) + .004 * Math.sin(progress * 8)) +
        density * .7 * Math.sin(progress * 34);
    });
    const horizontal = Float32Array.from({ length: width }, (_, x) => {
      const progress = x / width;
      return creaseHeight + height * (.046 * (.5 - progress) + .007 * Math.sin(progress * 10)) +
        density * .9 * Math.sin(progress * 38);
    });

    const foldDensity = density * Math.min(1, Math.max(.63, clientWidth / 540));
    warpInk(relief, pen.getImageData(0, 0, width, height), vertical, horizontal, foldDensity);
    shadeFold(relief, vertical, true, foldDensity);
    shadeFold(relief, horizontal, false, foldDensity);
    paper.classList.add('paper-painted');
    cachedSizes.set(canvas, size);
  }

  if (!document.fonts || !('ResizeObserver' in window)) return;
  const resize = new ResizeObserver((entries) => {
    for (const { target } of entries) drawPaper(target.querySelector('.paper-relief'));
  });
  for (const canvas of surfaces) resize.observe(canvas.parentElement);
  Promise.all([
    document.fonts.load('22px "Letter Hand"', '一'),
    document.fonts.load('22px "Ledger Brush"', '伍'),
  ]).then(() => {
    fontsReady = true;
    surfaces.forEach(drawPaper);
  }).catch(() => {});
})();
