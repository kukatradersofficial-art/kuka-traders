export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: safe % 1 === 0 ? 0 : 2,
  }).format(safe);
}

export function formatISTDateTime(value: unknown): string {
  if (!value) return '—';
  let date: Date;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    date = (value as { toDate: () => Date }).toDate();
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else {
    return '—';
  }
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function buildWhatsAppLink(phoneDigits: string, message: string): string {
  const cleanDigits = phoneDigits.replace(/[^0-9]/g, '') || '917006183435';
  const normalized = cleanDigits.startsWith('91') ? cleanDigits : `91${cleanDigits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function slugifyId(text: string, prefix = 'id'): string {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${clean || 'item'}_${rand}`;
}

export function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let curr = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          curr += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(curr.trim());
        curr = '';
      } else {
        curr += ch;
      }
    }
    out.push(curr.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? '';
    });
    return row;
  });
}
