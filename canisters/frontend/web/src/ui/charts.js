function toNumber(value) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  return Number(value ?? 0);
}

function pointsForSeries(values, width, height, padding) {
  const numeric = values.map(toNumber).filter(Number.isFinite);
  if (numeric.length === 0) return { numeric, points: '' };
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = max - min || 1;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const points = numeric.map((value, index) => {
    const x = numeric.length === 1
      ? width / 2
      : padding + (index / (numeric.length - 1)) * innerWidth;
    const y = padding + (1 - ((value - min) / span)) * innerHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return { numeric, points };
}

export function createSparkline(values = [], { width = 180, height = 54 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', values.length ? 'Metric trend' : 'No trend data');
  const { numeric, points } = pointsForSeries(values, width, height, 6);
  if (numeric.length === 0) {
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', '6');
    line.setAttribute('x2', String(width - 6));
    line.setAttribute('y1', String(height / 2));
    line.setAttribute('y2', String(height / 2));
    line.setAttribute('class', 'sparkline-empty');
    svg.append(line);
    return svg;
  }
  const polyline = document.createElementNS(svg.namespaceURI, 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('class', 'sparkline-line');
  svg.append(polyline);
  return svg;
}

export function createMiniAreaChart(values = [], options = {}) {
  const svg = createSparkline(values, options);
  svg.classList.add('mini-area-chart');
  const line = svg.querySelector('.sparkline-line');
  if (!line) return svg;
  const width = options.width ?? 180;
  const height = options.height ?? 54;
  const area = document.createElementNS(svg.namespaceURI, 'polygon');
  const points = line.getAttribute('points') ?? '';
  area.setAttribute('points', `6,${height - 6} ${points} ${width - 6},${height - 6}`);
  area.setAttribute('class', 'sparkline-area');
  svg.insertBefore(area, line);
  return svg;
}

export function createStackedBar(segments = []) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, toNumber(segment.value)), 0);
  const bar = document.createElement('div');
  bar.className = 'stacked-bar';
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', total > 0 ? 'Readiness breakdown' : 'No readiness values');
  for (const segment of segments) {
    const value = Math.max(0, toNumber(segment.value));
    const item = document.createElement('span');
    item.className = `stacked-bar-segment ${segment.tone ?? 'info'}`;
    item.style.width = total > 0 ? `${((value / total) * 100).toFixed(4)}%` : '0%';
    item.title = `${segment.label}: ${value}`;
    bar.append(item);
  }
  return bar;
}
