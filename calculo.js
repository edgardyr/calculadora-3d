// La cuenta de la calculadora de Karelyn: la misma de Taller 3D (precio.mjs), con lo que ella no ve ya puesto.
// El trabajo es el mínimo de 15 minutos por pedido que fijó Edgardy el 06/10/2026; el filamento, PLA a 18 $/kg salvo
// que ella lo cambie. Sin nada del navegador: se prueba en node.
import { quote, priceTiers, round, averageKg } from './precio.mjs';

export const PLA_KG = 18;
export const TRABAJO_MIN = 15;

// Números como los escribe una persona: «2,5», «2.5», «1.250» no; aquí solo hay gramos, horas y piezas pequeñas.
export const leer = v => { const n = Number(String(v ?? '').trim().replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };

// Un filamento de la lista de Taller 3D se reconoce por material, color, acabado y tono.
export const idFil = f => [f.type, f.name, f.finish, f.hex].join('|');
// Con colores marcados, el promedio de sus precios; sin ninguno, el precio escrito o el del PLA.
export const kgDe = (marcados, escrito) => (marcados?.length ? averageKg(marcados.map(f => f.precioKg)) : 0) || leer(escrito) || PLA_KG;

// En dólares BCV: lo que cuesta en bolívares a la tasa del USDT más el colchón, dividido entre la tasa oficial.
// Es la misma cuenta de public/js/fx.js en Taller 3D.
export function enBcv(usd, tasas, colchon = 0) {
  if (!(tasas?.bcv > 0 && tasas?.usdt > 0)) return null;
  return round(usd * tasas.usdt * (1 + colchon / 100) / tasas.bcv);
}

// Accesorios (0.26.0): clicker, cadenita y los que tenga Taller 3D en Ajustes. `accesorios` dice cuántos lleva cada
// pieza, { id: cantidad }, y cada uno suma su precio tal cual, sin el multiplicador, al costo y al precio. Edgardy,
// 21/10/2026: «ese va a ser el costo del clicker, no por 3». La cuenta la hace quote() de precio.mjs, la misma de los
// productos y pedidos de Taller 3D. Unas tarifas publicadas antes de 0.26.0 traen solo clickerPrice: se lee como la
// lista con el Clicker.
export const accesoriosDe = tarifas => Array.isArray(tarifas?.accessories) ? tarifas.accessories.filter(a => Number(a.price) > 0)
  : Number(tarifas?.clickerPrice) > 0 ? [{ id: 'clicker', name: 'Clicker', price: Number(tarifas.clickerPrice) }] : [];
// Gramos y horas son de UNA pieza (Edgardy, 23/10/2026): «si una pieza dura 1 h 18 min y lleva 21 g, en la
// misma placa 12 llevan 12 veces eso». Se multiplican por las piezas; los 15 min de trabajo siguen siendo por pedido.
// Antes eran del total de la placa y la pieza salía a la doceava parte. Multiplicar el tiempo se queda un poco largo
// (en una placa llena se comparten el calentado y la primera pasada), así que el precio no sale corto.
export function cotizar({ gramos, horas, piezas = 1, precioKg = PLA_KG, para = 'public', accesorios = {} }, tarifas, tasas) {
  const n = Math.max(1, Math.round(leer(piezas) || 1)), g = leer(gramos) * n, h = leer(horas) * n, kg = leer(precioKg) || PLA_KG;
  if (!tarifas || !g || !h) return null;
  const tipo = priceTiers(tarifas).find(t => t.id === para) || priceTiers(tarifas)[0];
  const q = quote({ quantity: n, grams: g, hours: h, laborMinutes: TRABAJO_MIN, accessories: Object.fromEntries(Object.entries(accesorios || {}).map(([id, n]) => [id, Math.max(0, Math.min(50, Math.round(Number(n) || 0)))])), marginPercent: tipo.marginPercent, packagingPerUnit: tarifas.packagingPerUnit, feePercent: tarifas.feePercent, taxPercent: tarifas.taxPercent }, { configured: true, ...tarifas, accessories: accesoriosDe(tarifas) }, { priceKg: kg });
  const costo = round(q.cost + q.fees), colchon = Number(tarifas.fxBufferPercent) || 0;
  return {
    piezas: n, costo, costoPorPieza: round(costo / n), precio: q.total, porPieza: q.unitPrice,
    bcv: enBcv(q.total, tasas, colchon), bcvPorPieza: enBcv(q.unitPrice, tasas, colchon),
    para: tipo.id, nombre: tipo.name,
  };
}
