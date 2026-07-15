/**
 * currency.js — currency formatting helpers.
 * The active workshop currency is cached from AuthContext (workshop.currency).
 */
export function getWorkshopCurrency() {
  try {
    const w = JSON.parse(localStorage.getItem('auth_workshop'));
    return w?.currency || 'AED';
  } catch {
    return 'AED';
  }
}

export function fmtCurrency(amount, currency, locale) {
  const cur = currency || getWorkshopCurrency();
  const num = Number(amount || 0);
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${cur} ${num.toFixed(2)}`;
  }
}

export default fmtCurrency;
