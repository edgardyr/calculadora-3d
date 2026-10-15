// Motor de precios (0.20.0). Sin dependencias ni nada de Node: lo usan el servidor de Taller 3D (business.mjs lo
// reexporta) y la calculadora de Karelyn en el navegador, que lo recibe copiado al publicarse. Una sola cuenta para
// los dos, así nunca dan precios distintos.
export class AppError extends Error {
  constructor(message, status = 400, code = 'INVALID_INPUT') { super(message); this.status = status; this.code = code; }
}

export function numeric(value, name, { min = 0, max = 1e9, integer = false, fallback } = {}) {
  if (value === undefined && fallback !== undefined) value = fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new AppError(`${name}: introduce un número válido entre ${min} y ${max}.`);
  }
  return value;
}

// Redondeo a centavos, medio centavo hacia arriba. Multiplicar por 100 en binario deja
// 10.075 en 1007.4999…; toPrecision(15) recupera el decimal que la persona escribió.
export const round = value => {
  const n = Number(value);
  const scaled = Number((Math.abs(n) * 100).toPrecision(15));
  return (Math.sign(n) * Math.round(scaled)) / 100 + 0;
};
export const ceilMoney = value => Math.ceil((value - 1e-9) * 100) / 100;

// Precios por tipo de comprador (0.19.0). Multiplicar el costo por N es un margen de 100 × (1 - 1/N): por 3 es
// 66,67 %, por 2,5 es 60 %, por 2 es 50 %. El margen se redondea a dos decimales para que el precio de la tabla sea
// el mismo que sale al elegir ese tipo en el formulario. La misma cuenta vive en public/js/tiers.js.
export const marginOfMultiplier = n => Math.round((1 - 1 / n) * 10000) / 100;
export function priceTiers(settings = {}) {
  const s = { allyMultiplier: 2.5, wholesaleMultiplier: 2, ...settings };
  return [['public', 'Público', s.marginPercent], ['ally', 'Aliado', marginOfMultiplier(s.allyMultiplier)], ['wholesale', 'Mayorista', marginOfMultiplier(s.wholesaleMultiplier)]]
    .map(([id, name, marginPercent]) => ({ id, name, marginPercent, multiplier: Math.round(10000 / (100 - marginPercent)) / 100 }));
}

/** Grams and hours describe the WHOLE order, including supports/purges. */
// `lines` (0.14.0): una fila por filamento, { grams, priceKg }. Sin ella, todo el peso va al precio de `material`.
// `input.agreedPrice` (0.14.0): el precio final que se acordó con el cliente, impuesto incluido. Si llega, manda
// sobre el calculado, sin mínimo; el sugerido queda en `suggestedTotal` y el beneficio sale de lo acordado.
// `s` son las tarifas ya validadas: en Taller 3D las pasa `calculateQuote` (business.mjs) por validateSettings; en la
// calculadora de Karelyn llegan del gist que publica Taller 3D, que ya salieron validadas de ahí.
export function quote(input, s, material, lines = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Presupuesto no válido.');
  if (!material) throw new AppError('Selecciona un material registrado.');
  const quantity = numeric(input.quantity, 'Cantidad', { min: 1, max: 1e6, integer: true, fallback: 1 });
  const grams = numeric(input.grams, 'Gramos totales', { max: 1e8, fallback: 0 });
  const hours = numeric(input.hours, 'Horas totales', { max: 1e6, fallback: 0 });
  const laborMinutes = numeric(input.laborMinutes, 'Minutos de trabajo', { max: 1e6, fallback: 0 });
  const packagingPerUnit = numeric(input.packagingPerUnit, 'Embalaje por unidad', { max: 1e6, fallback: s.packagingPerUnit });
  const extras = numeric(input.extras, 'Otros costes', { max: 1e8, fallback: 0 });
  const marginPercent = numeric(input.marginPercent, 'Margen', { max: 99.99, fallback: s.marginPercent });
  const feePercent = numeric(input.feePercent, 'Comisiones', { max: 99.99, fallback: s.feePercent });
  const taxPercent = numeric(input.taxPercent, 'Impuesto', { max: 100, fallback: s.taxPercent });
  if (marginPercent + feePercent >= 100) throw new AppError('El margen y las comisiones deben sumar menos del 100 %.');
  const agreedPrice = numeric(input.agreedPrice, 'Precio acordado', { max: 1e9, fallback: 0 });
  const materialCost = Array.isArray(lines) && lines.length
    ? lines.reduce((sum, l, i) => sum + numeric(l.grams, `Gramos del filamento ${i + 1}`, { max: 1e8, fallback: 0 }) * numeric(l.priceKg, 'Precio por kg') / 1000, 0)
    : grams * numeric(material.priceKg, 'Precio por kg') / 1000;
  const machineCost = hours * s.machineRate;
  const energyCost = hours * s.powerWatts / 1000 * s.electricityRate;
  const failureRate = s.failureRatePercent / 100;
  const failureFactor = 1 + (s.failureWastePercent / 100) * failureRate / (1 - failureRate);
  const failureProvision = (materialCost + machineCost + energyCost) * (failureFactor - 1);
  const laborCost = laborMinutes / 60 * s.laborRate;
  const packagingCost = quantity * packagingPerUnit;
  const cost = materialCost + machineCost + energyCost + failureProvision + laborCost + packagingCost + extras;
  // Lo que pide el margen, antes del precio mínimo por pedido (0.19.1): la tarjeta lo muestra cuando el mínimo manda.
  const byMargin = ceilMoney(cost / (1 - (marginPercent + feePercent) / 100));
  const suggested = ceilMoney(Math.max(s.minimumPrice, byMargin));
  const suggestedTotal = round(suggested + round(suggested * taxPercent / 100));
  const total = agreedPrice > 0 ? round(agreedPrice) : suggestedTotal;
  const subtotal = agreedPrice > 0 ? round(total / (1 + taxPercent / 100)) : suggested;
  const tax = round(total - subtotal);
  const fees = round(subtotal * feePercent / 100);
  const profit = round(subtotal - cost - fees);
  // El mismo trabajo a precio de público, de aliado y de mayorista: sin precio acordado y sin el mínimo por pedido
  // (0.19.1), porque tapaba el precio por unidad de quien compra cantidad. `atMinimum` avisa cuando el pedido, solo,
  // no llegaría al mínimo.
  const tiers = priceTiers(s).filter(t => t.marginPercent + feePercent < 100).map(t => {
    const sub = ceilMoney(cost / (1 - (t.marginPercent + feePercent) / 100)), all = round(sub + round(sub * taxPercent / 100));
    return { ...t, subtotal: sub, total: all, unitPrice: round(all / quantity), profit: round(sub - cost - round(sub * feePercent / 100)), atMinimum: sub < s.minimumPrice };
  });
  return {
    materialCost: round(materialCost), machineCost: round(machineCost), energyCost: round(energyCost),
    failureProvision: round(failureProvision), laborCost: round(laborCost), packagingCost: round(packagingCost),
    extras: round(extras), cost: round(cost), subtotal, tax, total, unitPrice: round(total / quantity),
    profit, marginPercent, fees, currency: s.currency, grams, hours, quantity, feePercent, taxPercent,
    failureFactor, actualMarginPercent: subtotal ? round(profit / subtotal * 100) : 0,
    pricingConfigured: s.configured, agreedPrice: agreedPrice > 0 ? total : 0, suggestedTotal, tiers,
    atMinimum: !(agreedPrice > 0) && byMargin < s.minimumPrice, byMarginTotal: round(byMargin + round(byMargin * taxPercent / 100)), minimumPrice: s.minimumPrice,
  };
}
