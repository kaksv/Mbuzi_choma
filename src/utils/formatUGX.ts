export function formatUGX(amount: number) {
  const safe = Number.isFinite(amount) ? amount : 0
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(safe)} UGX`
}

