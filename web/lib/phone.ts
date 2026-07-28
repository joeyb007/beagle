// One phone normalizer for every surface that treats a number as identity.
// "6475550132" / "(647) 555-0132" / "+1 647..." -> "+16475550132"
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}
