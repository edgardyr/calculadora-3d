// Carta de colores (0.18.0): los colores que hoy se pueden ofrecer, agrupados por material, en una imagen para
// mandar por WhatsApp o subir a Instagram. Sale sola de las bobinas: entra un filamento si le quedan gramos libres
// y no se ocultó en su ficha. Este archivo no importa nada: son las cuentas y el dibujo, y así se prueban sin navegador.

export const FORMATS = [
  ['square', 'Cuadrada', 1080, 1080, 'Publicación de Instagram o chat de WhatsApp'],
  ['portrait', 'Vertical', 1080, 1350, 'Publicación vertical de Instagram'],
  ['story', 'Historia', 1080, 1920, 'Historia de Instagram o estado de WhatsApp'],
  ['wide', 'Horizontal', 1600, 900, 'Para pegar en un catálogo o junto a un presupuesto'],
];
export const formatOf = id => FORMATS.find(f => f[0] === id) || FORMATS[0];

// Lo que el cliente entiende de cada material, sin prometer lo que nadie certificó.
const TYPE_HINTS = { PLA: 'Decoración y uso diario', PETG: 'Más resistente a golpes y al calor', TPU: 'Flexible' };
const TYPE_ORDER = ['PLA', 'PETG', 'TPU'];
const FINISHES = [[/silk|seda/i, 'seda'], [/matte|\bmate\b/i, 'mate'], [/wood|madera/i, 'madera'], [/marble|m[aá]rmol/i, 'mármol'], [/transl[uú]cid|transparent|clear/i, 'translúcido'], [/metal/i, 'metalizado']];
export const finishOf = m => FINISHES.find(([re]) => re.test(m?.name || ''))?.[1] || '';

// «PLA Basic Red (Rojo)» es Rojo; «PLA Silk+ Mint» es Mint. Si la ficha trae un nombre para el cliente, manda ese.
const LINE_WORDS = /\b(pla|petg|tpu|abs|asa|pa|pc|pvb|nylon|basic|refill|hf|plus|pro|cr|hyper|rapid|silk|matte|mate|wood|seda|madera|muestra)\b|[+]/gi;
const capital = t => t ? t[0].toLocaleUpperCase('es') + t.slice(1) : t;
export function colorNameOf(m) {
  const own = String(m?.colorName || '').trim();
  if (own) return own;
  const name = String(m?.name || ''), inside = name.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (inside) return capital(inside);
  const rest = name.replace(LINE_WORDS, ' ').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
  return capital(rest || name.trim());
}

const hexOf = c => /^#[\da-f]{6}$/i.test(c || '') ? c.toLowerCase() : '#a89a8c';
// Tono, croma y luz. El croma (no la saturación) dice si un color es neutro: un blanco roto tiene saturación alta y casi nada de color.
function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, d, l];
}
// Primero blancos, grises y negros, del más claro al más oscuro; después los colores, en el orden del arcoíris.
const byHue = (a, b) => {
  const [ha, sa, la] = hsl(a.hex), [hb, sb, lb] = hsl(b.hex), na = sa < 0.1, nb = sb < 0.1;
  return na !== nb ? (na ? -1 : 1) : na ? lb - la : ha - hb || lb - la;
};

export const typesOf = materials => [...new Set((materials || []).map(m => m.type || 'PLA'))].sort((a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b, 'es'));

// freeOf dice cuántos gramos libres le quedan a un filamento: la pantalla pasa los que no están reservados.
export function cardGroups(materials, { type = 'all', freeOf = m => Number(m.stockGrams) || 0 } = {}) {
  const groups = new Map(), out = { groups: [], total: 0, empty: [], hidden: [] };
  for (const m of materials || []) {
    const t = m.type || 'PLA';
    if (type !== 'all' && t !== type) continue;
    if (m.cardHidden === true) { out.hidden.push(m); continue; }
    if (!(freeOf(m) > 0)) { out.empty.push(m); continue; }
    const color = { name: colorNameOf(m), finish: finishOf(m), hex: hexOf(m.color) }, list = groups.get(t) || [];
    // Dos bobinas del mismo color son un solo círculo.
    if (!list.some(c => c.hex === color.hex && c.finish === color.finish && c.name.toLocaleLowerCase('es') === color.name.toLocaleLowerCase('es'))) list.push(color);
    groups.set(t, list);
  }
  out.groups = typesOf([...groups.keys()].map(t => ({ type: t }))).map(t => ({ type: t, hint: TYPE_HINTS[t] || '', colors: groups.get(t).sort(byHue) }));
  out.total = out.groups.reduce((n, g) => n + g.colors.length, 0);
  return out;
}

// Los filamentos para presupuestar en la calculadora de Karelyn (0.23.0): los mismos colores de la carta, cada uno con
// su precio por kilo y nada más (decidido con Edgardy el 21/10/2026, para que en la calle no tenga que recordarlo).
// Dos bobinas del mismo color con precios distintos son una sola, al precio más alto: así no se cobra de menos.
export function filamentPrices(materials, { freeOf = m => Number(m.stockGrams) || 0 } = {}) {
  const byKey = new Map();
  for (const m of materials || []) {
    const kg = Number(m.priceKg) || 0;
    if (m.cardHidden === true || !(freeOf(m) > 0) || !(kg > 0)) continue;
    const f = { type: m.type || 'PLA', name: colorNameOf(m), finish: finishOf(m), hex: hexOf(m.color), precioKg: Math.round(kg * 100) / 100 };
    const key = [f.type, f.name.toLocaleLowerCase('es'), f.finish, f.hex].join('|'), seen = byKey.get(key);
    if (!seen || seen.precioKg < f.precioKg) byKey.set(key, f);
  }
  const list = [...byKey.values()], order = typesOf(list);
  return list.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || byHue(a, b));
}

// Busca el círculo más grande con el que todo cabe en el lienzo. Todas las medidas salen de `s`, para que la carta
// se vea igual en cualquier formato. Si ni con el círculo mínimo cabe, fits es false y la pantalla lo dice.
// Los materiales con pocos colores comparten franja (PETG y TPU, uno al lado del otro) cuando caben en una fila con
// sus títulos: así no se gasta una fila entera en dos círculos y los demás salen más grandes.
export function layoutCard(groups, W, H) {
  const s = Math.min(W, H) / 1080, pad = 72 * s, bodyTop = pad + 150 * s, bodyBottom = H - pad - 78 * s, bodyW = W - 2 * pad, bodyH = bodyBottom - bodyTop;
  const withFinish = groups.some(g => g.colors.some(c => c.finish)), most = Math.max(1, ...groups.map(g => g.colors.length));
  const titleH = 66 * s, groupGap = 30 * s, rowGap = 26 * s;
  const titleWidth = g => (g.type.length * 19 + (g.hint ? g.hint.length * 11.5 + 40 : 0)) * s;
  const measure = d => {
    const fs = Math.max(19 * s, Math.min(30 * s, d * 0.2)), labelH = fs * 1.5 + (withFinish ? fs * 0.95 : 0);
    const fit = Math.max(1, Math.floor((bodyW + d * 0.3) / (d * 1.3))), cols = Math.min(most, fit), rowH = d + labelH + rowGap;
    const step = fit > 1 ? Math.min((bodyW - d) / (fit - 1), d * 1.5) : 0, bands = [];
    for (const g of groups) {
      const n = g.colors.length, span = step ? Math.max(n, Math.ceil(titleWidth(g) / step)) : fit + 1, last = bands.at(-1);
      if (last?.single && n <= fit && last.used + 1 + span <= fit) { last.parts.push({ g, offset: last.used + 1 }); last.used += 1 + span; }
      else bands.push({ parts: [{ g, offset: 0 }], rows: Math.ceil(n / cols), single: n <= fit && span <= fit, used: span });
    }
    const height = bands.reduce((h, b) => h + titleH + b.rows * rowH, 0) + Math.max(0, bands.length - 1) * groupGap - rowGap;
    return { d, fs, cols, rowH, step, bands, height };
  };
  let m = measure(52 * s);
  const fits = m.height <= bodyH;
  if (fits) for (let d = 210 * s; d > 52 * s; d -= 2 * s) { const t = measure(d); if (t.height <= bodyH) { m = t; break; } }
  const titles = [], items = [];
  let y = bodyTop + Math.max(0, (bodyH - m.height) / 2) * 0.6;
  for (const band of m.bands) {
    for (const { g, offset } of band.parts) {
      titles.push({ x: pad + offset * m.step, y: y + 34 * s, text: g.type, hint: g.hint });
      // Filas parejas: doce colores en dos filas son seis y seis, no once y uno.
      const per = Math.ceil(g.colors.length / Math.ceil(g.colors.length / m.cols));
      g.colors.forEach((c, i) => {
        const col = i % per, row = Math.floor(i / per);
        items.push({ ...c, cx: pad + m.d / 2 + (offset + col) * m.step, cy: y + titleH + row * m.rowH + m.d / 2, r: m.d / 2, maxWidth: (m.step || bodyW) - 10 * s });
      });
    }
    y += titleH + band.rows * m.rowH + groupGap;
  }
  return { W, H, s, pad, fits, d: m.d, fs: m.fs, cols: m.cols, bands: m.bands.length, titles, items };
}

const INK = '#2B221D', INK2 = '#5C5048', INK3 = '#766A60', PAPER = '#FAF7F2', LINE = '#E7DFD3';
const DISPLAY = "'Fraunces', 'Iowan Old Style', Georgia, serif", UI = "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const CARD_FONTS = [`600 60px ${DISPLAY}`, `700 30px ${UI}`, `500 24px ${UI}`];

// Un nombre largo se achica hasta el 72 % y, si aun así no cabe, se corta con puntos suspensivos.
function fitText(ctx, text, weight, size, family, maxWidth) {
  for (let f = size; f >= size * 0.72; f -= 1) { ctx.font = `${weight} ${f}px ${family}`; if (ctx.measureText(text).width <= maxWidth) return text; }
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function drawCard(ctx, layout, { title = 'Colores disponibles', signature = '', date = '' } = {}) {
  const { W, H, s, pad } = layout;
  ctx.save();
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = INK; ctx.fillText(fitText(ctx, title, 600, 62 * s, DISPLAY, W - 2 * pad), pad, pad + 56 * s);
  ctx.font = `500 ${25 * s}px ${UI}`; ctx.fillStyle = INK2;
  if (date) ctx.fillText(`Actualizada el ${date}`, pad, pad + 100 * s);
  for (const t of layout.titles) {
    ctx.font = `700 ${30 * s}px ${UI}`; ctx.fillStyle = INK; ctx.fillText(t.text, t.x, t.y);
    const w = ctx.measureText(t.text).width;
    if (t.hint) { ctx.font = `500 ${23 * s}px ${UI}`; ctx.fillStyle = INK3; ctx.fillText(t.hint, t.x + w + 16 * s, t.y); }
  }
  ctx.textAlign = 'center';
  for (const c of layout.items) {
    ctx.save();
    ctx.shadowColor = 'rgba(43, 34, 29, 0.16)'; ctx.shadowBlur = 16 * s; ctx.shadowOffsetY = 5 * s;
    ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2); ctx.fillStyle = c.hex; ctx.fill();
    ctx.restore();
    // El borde deja ver el blanco sobre el fondo claro.
    ctx.beginPath(); ctx.arc(c.cx, c.cy, c.r - s, 0, Math.PI * 2); ctx.lineWidth = 2 * s; ctx.strokeStyle = 'rgba(43, 34, 29, 0.14)'; ctx.stroke();
    ctx.fillStyle = INK; const name = fitText(ctx, c.name, 650, layout.fs, UI, c.maxWidth); ctx.fillText(name, c.cx, c.cy + c.r + layout.fs * 1.25);
    if (c.finish) { ctx.fillStyle = INK3; ctx.font = `500 ${layout.fs * 0.78}px ${UI}`; ctx.fillText(c.finish, c.cx, c.cy + c.r + layout.fs * 2.2); }
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = LINE; ctx.fillRect(pad, H - pad - 44 * s, W - 2 * pad, 2 * s);
  ctx.font = `500 ${21 * s}px ${UI}`; ctx.fillStyle = INK3; ctx.fillText('El tono real puede variar según la pantalla.', pad, H - pad);
  if (signature) { ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.fillText(fitText(ctx, signature, 700, 26 * s, UI, W * 0.42), W - pad, H - pad); }
  ctx.restore();
}
