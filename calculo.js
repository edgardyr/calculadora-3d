// La cuenta de la calculadora de Karelyn: la misma de Taller 3D (precio.mjs), con lo que ella no ve ya puesto.
// El trabajo es el mínimo de 15 minutos por pedido que fijó Edgardy el 06/10/2026; el filamento, PLA a 18 $/kg salvo
// que ella lo cambie. Sin nada del navegador: se prueba en node.
import { quote, priceTiers, round } from './precio.mjs';

export const PLA_KG = 18;
export const TRABAJO_MIN = 15;

// Números como los escribe una persona: «2,5», «2.5», «1.250» no; aquí solo hay gramos, horas y piezas pequeñas.
export const leer = v => { const n = Number(String(v ?? '').trim().replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };

// En dólares BCV: lo que cuesta en bolívares a la tasa del USDT más el colchón, dividido entre la tasa oficial.
// Es la misma cuenta de public/js/fx.js en Taller 3D.
export function enBcv(usd, tasas, colchon = 0) {
  if (!(tasas?.bcv > 0 && tasas?.usdt > 0)) return null;
  return round(usd * tasas.usdt * (1 + colchon / 100) / tasas.bcv);
}

export function cotizar({ gramos, horas, piezas = 1, precioKg = PLA_KG, para = 'public' }, tarifas, tasas) {
  const g = leer(gramos), h = leer(horas), n = Math.max(1, Math.round(leer(piezas) || 1)), kg = leer(precioKg) || PLA_KG;
  if (!tarifas || !g || !h) return null;
  const tipo = priceTiers(tarifas).find(t => t.id === para) || priceTiers(tarifas)[0];
  const q = quote({ quantity: n, grams: g, hours: h, laborMinutes: TRABAJO_MIN, marginPercent: tipo.marginPercent, packagingPerUnit: tarifas.packagingPerUnit, feePercent: tarifas.feePercent, taxPercent: tarifas.taxPercent }, { configured: true, ...tarifas }, { priceKg: kg });
  const costo = round(q.cost + q.fees), colchon = Number(tarifas.fxBufferPercent) || 0;
  return {
    piezas: n, costo, costoPorPieza: round(costo / n), precio: q.total, porPieza: q.unitPrice,
    bcv: enBcv(q.total, tasas, colchon), bcvPorPieza: enBcv(q.unitPrice, tasas, colchon),
    minimo: q.atMinimum ? q.minimumPrice : null, para: tipo.id, nombre: tipo.name,
  };
}
