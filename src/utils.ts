/** Pure helpers copied from backend App/Helpers (no DB/system access). */

export function combineArray(...data: any[]): any[] {
  const set = new Set();
  data.map((i) => {
    i = Array.isArray(i) ? i : [];
    i.map((j: any) => set.add(j));
  });
  return Array.from(set);
}

export function formatPercent(hvn: number, total: number, digit: number = 1): number {
  const percent_ = (total !== 0 ? hvn / total : 0) * 100;

  const factor = Math.pow(10, digit);

  const rounded1 = Math.round(percent_ * factor) / factor;

  if (digit > 1) return rounded1;

  const intPart = Math.floor(rounded1);
  const decimalPart = (rounded1 - intPart) * factor;

  const finalValue = decimalPart >= 5 ? intPart + 1 : intPart;

  return finalValue;
}
