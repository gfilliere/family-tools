export function normaliseName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ").replace(/s$/, "");
}

export function sameMergeBucket(
  current: { canonicalName: string; qty: number | null; unit: string | null },
  incoming: { canonicalName: string; qty: number | null; unit: string | null },
): boolean {
  return normaliseName(current.canonicalName) === normaliseName(incoming.canonicalName)
    && current.unit === incoming.unit
    && ((current.qty === null && incoming.qty === null) || (current.qty !== null && incoming.qty !== null));
}
