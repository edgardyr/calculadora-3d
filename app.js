// Calculadora 3D de Karelyn. Dos pestañas: Calcular (gramos, tiempo y piezas; da el precio de venta en dólares y en
// BCV y lo que nos cuesta) y Colores (la carta de colores de Taller 3D, para mostrarla o mandarla por WhatsApp). Las tarifas llegan de Taller 3D por un gist secreto (la clave va en el enlace, después de #); las
// tasas, de ve.dolarapi.com. Todo se guarda en el celular para abrir sin señal. Lo que ella escribe no se guarda.
import { cotizar, leer, PLA_KG, idFil, kgDe, accesoriosDe } from './calculo.js';
import { FORMATS, CARD_FONTS, layoutCard, drawCard } from './carta.js';

const RATES_URL = 'https://ve.dolarapi.com/v1/dolares';
const K = { clave: 'calc3d.clave', tarifas: 'calc3d.tarifas', tasas: 'calc3d.tasas' };
const $ = s => document.querySelector(s);
const app = $('#app');
const leerLocal = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* sin espacio: sigue sin memoria */ } };
const fmt = n => new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }).format(n);
const usd = n => `${fmt(n)} $`;
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dia = iso => iso ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : '';

// Un gist se llama con 32 caracteres hexadecimales. «demo» lee tarifas-demo.json, que solo existe en la Mac.
const claveDe = texto => { const m = /(?:#|^)([0-9a-f]{20,40}|demo)\s*$/i.exec(String(texto || '').trim()); return m ? m[1].toLowerCase() : ''; };

let clave = claveDe(location.hash) || localStorage.getItem(K.clave) || '';
if (claveDe(location.hash)) guardar(K.clave, clave);
let datos = leerLocal(K.tarifas), tasas = leerLocal(K.tasas), aviso = '';
// Los filamentos del inventario con su precio por kilo (0.23.0). Los marcados se promedian; si no hay ninguno marcado,
// vale el precio escrito a mano, que por defecto es el del PLA.
const filamentos = () => Array.isArray(datos?.filamentos) ? datos.filamentos : [];
const marcados = () => filamentos().filter(f => entrada.colores.includes(idFil(f)));
const kgEnUso = () => kgDe(marcados(), entrada.precioKg);
const nombreFil = f => [f.type, f.name, f.finish].filter(Boolean).join(' ');
const kgTexto = () => {
  const sel = marcados(), kg = kgEnUso();
  if (sel.length === 1) return `${nombreFil(sel[0])} a ${fmt(kg)} $ el kilo · cambiar`;
  if (sel.length > 1) return `${sel.length} colores, promedio de ${fmt(kg)} $ el kilo · cambiar`;
  return kg === PLA_KG ? `PLA a ${fmt(kg)} $ el kilo · cambiar` : `Filamento a ${fmt(kg)} $ el kilo · cambiar`;
};
let refrescar = null;
// El tiempo va por defecto en horas con decimales (1,1 h), como lo da Bambu Studio; un botón lo pasa a horas y minutos.
const NUEVA = { gramos: '', modo: 'dec', horasDec: '', horas: '', minutos: '', piezas: 1, precioKg: String(PLA_KG), colores: [], accesorios: {}, para: 'public' };
const entrada = { ...NUEVA, colores: [] };
const horasDe = e => e.modo === 'dec' ? leer(e.horasDec) : (leer(e.horas) || 0) + (leer(e.minutos) || 0) / 60;
const duracion = h => { const t = Math.round(h * 60), hh = Math.floor(t / 60), mm = t % 60; return hh && mm ? `${hh} h ${mm} min` : hh ? `${hh} h` : `${mm} min`; };

async function traerTarifas() {
  if (!clave) return;
  const url = clave === 'demo' ? './tarifas-demo.json' : `https://api.github.com/gists/${clave}`;
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { accept: 'application/vnd.github+json' } });
    if (res.status === 404) { aviso = 'Este enlace ya no sirve. Pídele a Edgardy el enlace nuevo de la calculadora.'; if (!datos) { clave = ''; localStorage.removeItem(K.clave); } return; }
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()).files?.['tarifas.json'];
    if (!file?.content) throw new Error('sin tarifas');
    const nuevo = JSON.parse(file.content);
    if (!nuevo?.tarifas) throw new Error('tarifas vacías');
    datos = nuevo; guardar(K.tarifas, datos); aviso = '';
  } catch {
    aviso = datos ? '' : 'No pude traer las tarifas. Revisa la conexión y vuelve a abrir la calculadora.';
  }
}
async function traerTasas() {
  try {
    const res = await fetch(RATES_URL, { cache: 'no-store' });
    const rows = await res.json(), of = f => rows.find(r => r?.fuente === f);
    const bcv = of('oficial')?.promedio, usdt = of('paralelo')?.promedio;
    if (bcv > 0 && usdt > 0) { tasas = { bcv, usdt, bcvDate: String(of('oficial').fechaActualizacion || '').slice(0, 10) || null }; guardar(K.tasas, tasas); }
  } catch { /* sin señal: quedan las guardadas o las de Taller 3D */ }
}
const tasasEnUso = () => tasas || datos?.tasas || null;

/* ---------- pantallas ---------- */
function pantallaEnlace(error = '') {
  app.innerHTML = `${cabecera}<section class="card welcome">
    <p>Pega aquí el enlace de la calculadora que te mandó Edgardy. Se hace una sola vez.</p>
    <label class="box"><span class="sr">Enlace</span><input id="enlace" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://edgardyr.github.io/calculadora-3d/#…"></label>
    ${error ? `<p class="error">${error}</p>` : ''}
    <button type="button" class="primary" id="usar">Usar este enlace</button></section>`;
  $('#usar').onclick = async () => {
    const c = claveDe($('#enlace').value);
    if (!c) return pantallaEnlace('Ese no parece el enlace de la calculadora. Cópialo completo del chat.');
    clave = c; guardar(K.clave, c); datos = null;
    app.innerHTML = '<p class="empty">Cargando tus tarifas…</p>';
    await traerTarifas();
    datos ? mostrar() : pantallaEnlace(aviso);
  };
}

// Íconos de Taller 3D (app/public/js/ui.js), para que las dos se vean de la misma familia.
const ICONOS = {
  bobina: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v5.5M12 15v5.5"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  cubo: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  flecha: '<path d="m6 9 6 6 6-6"/>',
};
const icono = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n]}</svg>`;
// El logo de corinne (la tienda de Karelyn), horizontal a color. La palabra va al 60% dentro del SVG porque Edgardy
// la pidió más pequeña; el isotipo queda al mismo tamaño que en el logo horizontal a 260 px.
const cabecera = `<header class="brand"><img class="logo" src="corinne-logo.svg" alt="corinne" width="181" height="39"><h1>Calculadora 3D</h1></header>`;
let vista = 'calcular';
// El costo va plegado: si la pantalla se le enseña a un cliente, no lo ve. No se recuerda: al abrir, siempre plegado.
let verCosto = false;
const pestanas = () => `<nav class="tabs" role="tablist" aria-label="Secciones">${[['calcular', 'Calcular'], ['colores', 'Colores']].map(([id, n]) => `<button type="button" role="tab" data-vista="${id}" aria-selected="${vista === id}">${n}</button>`).join('')}</nav>`;
const mostrar = () => (vista === 'colores' ? pantallaColores() : pantallaCalculadora());
app.addEventListener('click', e => {
  const b = e.target.closest('[data-vista]');
  if (!b || b.dataset.vista === vista) return;
  vista = b.dataset.vista; mostrar(); scrollTo(0, 0);
});
const titulo = (n, texto) => `<span class="t"><span class="badge ${n}">${icono(n)}</span>${texto}</span>`;

// Los colores van agrupados por material, como en la carta. Tocar uno lo marca o lo desmarca.
function lista() {
  const fs = filamentos();
  if (!fs.length) return '';
  const tipos = [...new Set(fs.map(f => f.type))];
  return `<p class="kg-ayuda">Marca los colores que lleva la pieza. Si son varios, se promedia su precio.</p>${tipos.map(t => `<div class="fils" role="group" aria-label="${esc(t)}"><b class="fils-t">${esc(t)}</b>${fs.filter(f => f.type === t).map(f => {
    const id = idFil(f);
    return `<button type="button" class="fil" data-fil="${esc(id)}" aria-pressed="${entrada.colores.includes(id)}"><span class="circulo" style="background:${hexValido(f.hex)}"></span><span class="fil-n">${esc(f.name)}${f.finish ? ` <small>${esc(f.finish)}</small>` : ''}</span><span class="fil-p">${fmt(f.precioKg)} $</span></button>`;
  }).join('')}</div>`).join('')}`;
}

// El resultado va arriba y se queda a la vista mientras se escriben los datos de abajo, como en Taller 3D.
function pantallaCalculadora() {
  app.innerHTML = `${cabecera}${pestanas()}
  ${aviso ? `<p class="warn">${aviso}</p>` : ''}
  <section class="card result" id="resultado"></section>
  <section class="card datos">
    <div class="field bobina">${titulo('bobina', 'Filamento de una pieza')}
      <span class="box"><input id="gramos" inputmode="decimal" autocomplete="off" enterkeyhint="next" placeholder="0" value="${entrada.gramos}" aria-label="Gramos de filamento de una pieza"><em>gramos</em></span><small class="lee" id="lee-gramos"></small>
      <button type="button" class="link" id="cambiar-kg">${kgTexto()}</button>
      <div class="kg" id="kg-box" hidden>${lista()}<label>${filamentos().length ? '<span class="otro">Otro precio</span>' : ''}<span class="box"><input id="precioKg" inputmode="decimal" autocomplete="off" value="${esc(entrada.precioKg)}" aria-label="Precio del filamento por kilo"><em>$ el kilo</em></span></label>${filamentos().length ? '<button type="button" class="listo" id="kg-listo">Listo</button>' : ''}</div>
    </div>
    <div class="field reloj"><div class="t-fila">${titulo('reloj', 'Tiempo de una pieza')}<div class="seg mini" id="modo" role="group" aria-label="Cómo escribes el tiempo"><button type="button" data-modo="dec" aria-pressed="${entrada.modo === 'dec'}">1,1 h</button><button type="button" data-modo="hm" aria-pressed="${entrada.modo === 'hm'}">h y min</button></div></div><div id="tiempo"></div><small class="lee" id="lee-total"></small></div>
    <div class="field cubo">${titulo('cubo', 'Piezas')}<div class="stepper"><button type="button" id="menos" aria-label="Una pieza menos">−</button><output id="piezas" aria-live="polite">${entrada.piezas}</output><button type="button" id="mas" aria-label="Una pieza más">+</button></div><div id="acc-filas"></div></div>
    <div class="for" id="para"></div>
  </section>
  <div class="foot"><div id="pie"></div><button type="button" class="reset" id="borrar">Empezar de nuevo</button></div>`;
  const pie = () => {
    const t = tasasEnUso();
    $('#pie').innerHTML = `${t ? `<p>Tasas${t.bcvDate ? ` del ${dia(t.bcvDate)}` : ''}: BCV ${fmt(t.bcv)} y USDT ${fmt(t.usdt)} Bs.</p>` : '<p>Sin tasas del dólar todavía: el precio en BCV sale cuando haya señal.</p>'}${datos?.actualizado ? `<p>Tarifas del taller al ${dia(datos.actualizado)}.</p>` : ''}`;
  };
  const tipos = [['public', 'Público'], ['ally', 'Aliado'], ['wholesale', 'Mayorista']];
  const leerHoras = () => { const h = leer(entrada.horasDec); $('#lee-horas').textContent = h ? `Son ${duracion(h)}.` : 'Como lo da Bambu Studio, por ejemplo 1,1.'; };
  // Gramos y tiempo son de una pieza (23/10/2026): con varias, se dice cuánto suman todas, para que la multiplicación se vea.
  const leerTotales = () => {
    const n = entrada.piezas, g = leer(entrada.gramos), h = horasDe(entrada);
    $('#lee-gramos').textContent = n > 1 && g ? `Las ${n} piezas: ${new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(g * n)} g.` : '';
    const t = $('#lee-total'); if (t) t.textContent = n > 1 && h ? `Las ${n} piezas: ${duracion(h * n)} de máquina.` : '';
  };
  const tiempo = () => {
    $('#tiempo').innerHTML = entrada.modo === 'dec'
      ? `<span class="box"><input id="horasDec" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0" value="${esc(entrada.horasDec)}" aria-label="Horas con decimales"><em>horas</em></span><small class="lee" id="lee-horas"></small>`
      : `<div class="pair"><span class="box"><input id="horas" inputmode="numeric" autocomplete="off" enterkeyhint="next" placeholder="0" value="${esc(entrada.horas)}" aria-label="Horas"><em>h</em></span>
        <span class="box"><input id="minutos" inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="0" value="${esc(entrada.minutos)}" aria-label="Minutos"><em>min</em></span></div>`;
    if (entrada.modo === 'dec') leerHoras();
  };
  // Accesorios por pieza (0.26.0): un contador por cada accesorio con precio en Taller 3D (clicker, cadenita…). No dice
  // cuánto cuesta: si la pantalla se le enseña a un cliente, el costo sigue plegado.
  const accFilas = () => {
    const lista = accesoriosDe(datos?.tarifas);
    entrada.accesorios = Object.fromEntries(Object.entries(entrada.accesorios).filter(([id]) => lista.some(a => a.id === id)));
    $('#acc-filas').innerHTML = lista.map(a => `<div class="clickers"><span>${esc(a.name)} por pieza</span><div class="stepper mini"><button type="button" data-acc="${esc(a.id)}" data-d="-1" aria-label="Quitar: ${esc(a.name)}">−</button><output data-acc-n="${esc(a.id)}" aria-live="polite">${entrada.accesorios[a.id] || 0}</output><button type="button" data-acc="${esc(a.id)}" data-d="1" aria-label="Agregar: ${esc(a.name)}">+</button></div></div>`).join('');
  };
  const pintar = () => {
    leerTotales();
    const horas = horasDe(entrada);
    const r = cotizar({ gramos: entrada.gramos, horas, piezas: entrada.piezas, precioKg: kgEnUso(), accesorios: entrada.accesorios, para: entrada.para }, datos.tarifas, tasasEnUso());
    $('#para').innerHTML = `<span class="t">Precio para</span><div class="seg" role="group" aria-label="Precio para">${tipos.map(([id, n]) => `<button type="button" data-para="${id}" aria-pressed="${entrada.para === id}">${n}</button>`).join('')}</div>`;
    // Aliado y mayorista casi no se usan: si está puesto uno, el título del precio lo dice para que no pase sin verse.
    const nombre = { public: 'Precio de venta', ally: 'Precio aliado', wholesale: 'Precio mayorista' }[entrada.para];
    const hayBcv = !!tasasEnUso();
    const v = r || {}, cero = usd(0);
    $('#resultado').innerHTML = `<div class="stripe" aria-hidden="true"></div>
      <div class="prices${r ? '' : ' vacio'}"><div class="venta"><div class="label">${nombre}</div><div class="big">${r ? usd(v.precio) : cero}</div></div>${hayBcv ? `<div class="bcv"><div class="label">En BCV</div><div class="big">${r && v.bcv != null ? usd(v.bcv) : cero}</div></div>` : ''}</div>
      ${r && v.piezas > 1 ? `<p class="each">Cada pieza: ${usd(v.porPieza)}${v.bcvPorPieza != null ? ` · ${usd(v.bcvPorPieza)} BCV` : ''}</p>` : ''}
      <button type="button" class="cost${verCosto ? ' abierto' : ''}${r ? '' : ' vacio'}" id="ver-costo" aria-expanded="${verCosto}"><span>Costo</span>${verCosto ? `<strong>${r ? usd(v.costo) : cero}${r && v.piezas > 1 ? `<small>${usd(v.costoPorPieza)} cada pieza</small>` : ''}</strong>` : ''}<i>${icono('flecha')}</i></button>
      ${r ? '' : '<p class="hint">Escribe abajo los gramos y el tiempo de una pieza, como los da Bambu Studio.</p>'}`;
  };
  // Escribir otro precio desmarca los colores: vale lo último que se tocó.
  const marcar = () => { for (const b of document.querySelectorAll('[data-fil]')) b.setAttribute('aria-pressed', String(entrada.colores.includes(b.dataset.fil))); $('#cambiar-kg').textContent = kgTexto(); };
  for (const id of ['gramos', 'precioKg']) $(`#${id}`).addEventListener('input', e => {
    entrada[id] = e.target.value;
    if (id === 'precioKg') { entrada.colores = []; marcar(); }
    pintar();
  });
  $('#kg-box').addEventListener('click', e => {
    // La lista es larga: «Listo» la cierra y vuelve al filamento, sin subir a buscar «cambiar».
    if (e.target.closest('#kg-listo')) { $('#kg-box').hidden = true; $('.field.bobina').scrollIntoView({ block: 'center' }); return; }
    const b = e.target.closest('[data-fil]'); if (!b) return;
    const id = b.dataset.fil;
    entrada.colores = entrada.colores.includes(id) ? entrada.colores.filter(x => x !== id) : [...entrada.colores, id];
    marcar(); pintar();
  });
  $('#tiempo').addEventListener('input', e => {
    entrada[e.target.id] = e.target.value;
    if (e.target.id === 'horasDec') leerHoras();
    pintar();
  });
  // El tiempo escrito pasa de una forma a la otra, para no tener que escribirlo de nuevo.
  $('#modo').addEventListener('click', e => {
    const b = e.target.closest('[data-modo]');
    if (!b || b.dataset.modo === entrada.modo) return;
    const h = horasDe(entrada), t = Math.round(h * 60);
    if (b.dataset.modo === 'hm') Object.assign(entrada, { horas: h ? String(Math.floor(t / 60)) : '', minutos: h ? String(t % 60) : '' });
    else entrada.horasDec = h ? String(Math.round(h * 100) / 100).replace('.', ',') : '';
    entrada.modo = b.dataset.modo;
    for (const x of $('#modo').children) x.setAttribute('aria-pressed', String(x === b));
    tiempo(); pintar();
  });
  $('#cambiar-kg').onclick = () => { const box = $('#kg-box'); box.hidden = !box.hidden; if (!box.hidden) $('#precioKg').focus(); };
  const piezas = n => { entrada.piezas = Math.max(1, Math.min(999, n)); $('#piezas').textContent = entrada.piezas; pintar(); };
  $('#acc-filas').addEventListener('click', e => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const id = b.dataset.acc, n = Math.max(0, Math.min(20, (entrada.accesorios[id] || 0) + Number(b.dataset.d)));
    entrada.accesorios = { ...entrada.accesorios, [id]: n };
    for (const o of document.querySelectorAll('[data-acc-n]')) if (o.dataset.accN === id) o.textContent = n;
    pintar();
  });
  $('#menos').onclick = () => piezas(entrada.piezas - 1);
  $('#mas').onclick = () => piezas(entrada.piezas + 1);
  $('#resultado').addEventListener('click', e => { if (e.target.closest('#ver-costo')) { verCosto = !verCosto; pintar(); } });
  $('#para').addEventListener('click', e => { const b = e.target.closest('[data-para]'); if (b) { entrada.para = b.dataset.para; pintar(); } });
  $('#borrar').onclick = () => { verCosto = false; Object.assign(entrada, NUEVA, { colores: [], accesorios: {} }); pantallaCalculadora(); $('#gramos').focus(); };
  tiempo(); accFilas(); pie(); pintar();
  refrescar = () => { accFilas(); pie(); pintar(); $('#cambiar-kg').textContent = kgTexto(); };
}

/* ---------- carta de colores ---------- */
// La imagen es la misma que hace Taller 3D (carta.js es su color-card.js). Se prepara al abrir la pestaña y no al
// tocar el botón: el iPhone solo deja abrir «Compartir» justo después del toque, sin esperas de por medio.
const hexValido = h => /^#[0-9a-f]{6}$/i.test(h || '') ? h : '#a89a8c';
const fechaLarga = iso => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(iso ? new Date(iso) : new Date());
let imagen = { huella: '', archivo: null };
async function imagenCarta(grupos) {
  try { await Promise.all(CARD_FONTS.map(f => document.fonts.load(f))); } catch { /* se dibuja con la de reserva */ }
  // Cuadrada si cabe, que es la que mejor se ve en un chat; con muchos colores, vertical o historia.
  let layout;
  for (const id of ['square', 'portrait', 'story']) { const [, , W, H] = FORMATS.find(f => f[0] === id); layout = layoutCard(grupos, W, H); if (layout.fits) break; }
  const canvas = document.createElement('canvas');
  canvas.width = layout.W; canvas.height = layout.H;
  drawCard(canvas.getContext('2d'), layout, { title: 'Colores disponibles', date: fechaLarga(datos.actualizado) });
  const blob = await new Promise((ok, mal) => canvas.toBlob(b => (b ? ok(b) : mal(new Error('sin imagen'))), 'image/png'));
  return new File([blob], 'carta-de-colores.png', { type: 'image/png' });
}

function pantallaColores() {
  const grupos = Array.isArray(datos.carta) ? datos.carta.map(g => ({ ...g, colors: (g.colors || []).map(c => ({ ...c, hex: hexValido(c.hex) })) })).filter(g => g.colors.length) : null;
  const total = grupos ? grupos.reduce((n, g) => n + g.colors.length, 0) : 0;
  const cuerpo = !grupos ? '<p class="empty card">La carta llega la próxima vez que se abra Taller 3D en la Mac.</p>'
    : !total ? '<p class="empty card">Ahora no hay colores con filamento libre.</p>'
    : grupos.map(g => `<section class="card grupo"><h2>${esc(g.type)}${g.hint ? ` <small>${esc(g.hint)}</small>` : ''}</h2><ul class="colores">${g.colors.map(c => `<li><span class="circulo" style="background:${c.hex}"></span><b>${esc(c.name)}</b>${c.finish ? `<small>${esc(c.finish)}</small>` : ''}</li>`).join('')}</ul></section>`).join('');
  app.innerHTML = `${cabecera}${pestanas()}
  ${aviso ? `<p class="warn">${aviso}</p>` : ''}
  ${total ? '<button type="button" class="primary compartir" id="compartir" disabled>Preparando la imagen…</button>' : ''}
  ${cuerpo}
  ${total ? `<div class="foot"><p>${total} ${total === 1 ? 'color' : 'colores'} con filamento libre, al ${esc(dia(datos.actualizado))}.</p><p>El tono real puede variar según la pantalla.</p></div>` : ''}`;
  refrescar = () => pantallaColores();
  if (!total) return;
  const boton = $('#compartir'), huella = JSON.stringify([grupos, datos.actualizado]);
  const listo = archivo => { if (!boton.isConnected) return; boton.disabled = false; boton.textContent = 'Compartir la carta'; boton.onclick = () => compartir(archivo); };
  if (imagen.huella === huella && imagen.archivo) return listo(imagen.archivo);
  imagenCarta(grupos).then(archivo => { imagen = { huella, archivo }; listo(archivo); }).catch(() => { if (boton.isConnected) boton.textContent = 'No se pudo preparar la imagen'; });
}
async function compartir(archivo) {
  if (navigator.canShare?.({ files: [archivo] })) { try { await navigator.share({ files: [archivo] }); } catch { /* la cerró sin mandar */ } return; }
  // Sin «Compartir» (una computadora): se descarga.
  const a = document.createElement('a'); a.href = URL.createObjectURL(archivo); a.download = archivo.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function arrancar() {
  if (!clave) return pantallaEnlace();
  if (datos) mostrar(); else app.innerHTML = '<p class="empty">Cargando tus tarifas…</p>';
  await Promise.all([traerTarifas(), traerTasas()]);
  if (!clave) return pantallaEnlace(aviso);
  if (!datos) { app.innerHTML = `${cabecera}<p class="warn">${aviso}</p>`; return; }
  // Con la pantalla ya abierta, solo se recalcula: lo que esté escribiendo no se pierde ni pierde el foco.
  refrescar ? refrescar() : mostrar();
}
arrancar();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
