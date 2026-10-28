export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(days: number, date = new Date()): string {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
