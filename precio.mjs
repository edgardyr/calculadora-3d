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

// Accesorios (0.26.0): clicker, cadenita y los que se añadan en Ajustes. `input.accessories` dice cuántos lleva cada
// unidad, { id: cantidad }, y cada uno se cobra a su precio de `s.accessories` tal cual, sin margen: cuenta como costo
// y como precio a la vez, así que no deja ganancia propia ni la quita. Edgardy, 21/10/2026: el clicker a 0,50 $,
// «no por 3», porque hay piezas con 2 y con 4. Un accesorio que ya no está en la lista no suma.
// Antes de 0.26.0 solo existía el clicker, como `clickers` y `clickerPrice`: se siguen leyendo como el accesorio
// «clicker», para que un pedido o un presupuesto viejo dé la misma cuenta.
export function accessoryLines(input, s, quantity = 1) {
  const counts = input.accessories ?? {};
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new AppError('Accesorios no válidos.');
  const catalog = Array.isArray(s.accessories) ? s.accessories : [];
  const lines = [];
  for (const a of catalog) {
    const count = numeric(counts[a.id], `${a.name} por unidad`, { max: 50, integer: true, fallback: 0 });
    if (count && Number(a.price) > 0) lines.push({ id: a.id, name: a.name, count, price: Number(a.price), total: round(count * quantity * Number(a.price)) });
  }
  if (input.clickers !== undefined && counts.clicker === undefined) {
    const count = numeric(input.clickers, 'Clickers por unidad', { max: 50, integer: true, fallback: 0 });
    const known = catalog.find(a => a.id === 'clicker');
    const price = numeric(input.clickerPrice, 'Precio de un clicker', { max: 1e4, fallback: Number(known?.price ?? s.clickerPrice) || 0 });
    if (count && price > 0) lines.push({ id: 'clicker', name: known?.name || 'Clicker', count, price, total: round(count * quantity * price) });
  }
  return lines;
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
  const acc = accessoryLines(input, s, quantity);
  const accessoriesTotal = round(acc.reduce((t, a) => t + a.total, 0));
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
  const marked = materialCost + machineCost + energyCost + failureProvision + laborCost + packagingCost + extras;
  const cost = marked + accessoriesTotal;
  // El precio es el que pide el margen, sin precio mínimo por pedido: desde 0.22.0 (19/10/2026) una pieza de 1 $ de
  // costo sale a lo que da su margen y no salta a 5, porque Edgardy vende piezas pequeñas al mayor, varias a la vez.
  const suggested = round(ceilMoney(marked / (1 - (marginPercent + feePercent) / 100)) + accessoriesTotal);
  const suggestedTotal = round(suggested + round(suggested * taxPercent / 100));
  const total = agreedPrice > 0 ? round(agreedPrice) : suggestedTotal;
  const subtotal = agreedPrice > 0 ? round(total / (1 + taxPercent / 100)) : suggested;
  const tax = round(total - subtotal);
  const fees = round(subtotal * feePercent / 100);
  const profit = round(subtotal - cost - fees);
  // El mismo trabajo a precio de público, de aliado y de mayorista, sin precio acordado.
  const tiers = priceTiers(s).filter(t => t.marginPercent + feePercent < 100).map(t => {
    const sub = round(ceilMoney(marked / (1 - (t.marginPercent + feePercent) / 100)) + accessoriesTotal), all = round(sub + round(sub * taxPercent / 100));
    return { ...t, subtotal: sub, total: all, unitPrice: round(all / quantity), profit: round(sub - cost - round(sub * feePercent / 100)) };
  });
  return {
    materialCost: round(materialCost), machineCost: round(machineCost), energyCost: round(energyCost),
    failureProvision: round(failureProvision), laborCost: round(laborCost), packagingCost: round(packagingCost),
    extras: round(extras), accessoryLines: acc, accessoriesTotal, cost: round(cost), subtotal, tax, total, unitPrice: round(total / quantity),
    profit, marginPercent, fees, currency: s.currency, grams, hours, quantity, feePercent, taxPercent,
    failureFactor, actualMarginPercent: subtotal ? round(profit / subtotal * 100) : 0,
    pricingConfigured: s.configured, agreedPrice: agreedPrice > 0 ? total : 0, suggestedTotal, tiers,
  };
}

// Varios colores sin saber los gramos de cada uno (0.23.0, 21/10/2026). MakerWorld da los gramos totales: se supone
// que cada color lleva lo mismo. Por eso el precio por kilo es el promedio simple de los colores, y en Taller 3D los
// gramos se reparten por igual (splitEvenly, en public/js/filament-lines.js). Se eligió frente a cobrar todo al color más caro porque en una pieza de 40 g con un
// Silk+ de 33 $ entre tres de 18 $ el promedio cae entre los dos casos reales (5 g o 20 g de Silk+) y el más caro
// subía el precio 1,40 $, que pesa en las piezas chicas al mayor.
export const averageKg = prices => {
  const list = (prices || []).map(Number).filter(n => n > 0);
  return list.length ? round(list.reduce((a, b) => a + b, 0) / list.length) : 0;
};
