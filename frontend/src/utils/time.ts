// A API pode mandar datas SEM indicação de fuso ("2026-11-03T16:08:23", comum com SQLite).
// Elas são UTC; sem o "Z" o navegador as leria como horário local e todo "há X min" sairia
// errado pela diferença de fuso (3 h no Brasil).
export function parseServerDate(iso: string): Date {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso)
  return new Date(hasZone ? iso : `${iso}Z`)
}

// "agora mesmo" / "há 3 min" / "há 2 h" / "há 1 d" a partir de uma data ISO.
export function relativeTime(iso: string | null): string {
  if (!iso) return 'nunca'
  const then = parseServerDate(iso).getTime()
  if (Number.isNaN(then)) return 'nunca'
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (diffSec < 60) return 'agora mesmo'
  if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)} h`
  return `há ${Math.floor(diffSec / 86400)} d`
}

// "03/11/2026 16:08" (sem vírgula e sem segundos: cabe numa linha só).
export function formatDateTime(iso: string | null, withSeconds = false): string {
  if (!iso) return '—'
  const d = parseServerDate(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  const base = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  return withSeconds ? `${base}:${p(d.getSeconds())}` : base
}

// Texto longo usado onde há espaço: "há 3 h (03/11/2026, 12:53:25)". Mantido por compatibilidade.
export function lastOnlineText(iso: string | null): string {
  if (!iso) return 'Nunca'
  const then = parseServerDate(iso).getTime()
  if (Number.isNaN(then)) return 'Nunca'
  return `${relativeTime(iso)} (${parseServerDate(iso).toLocaleString('pt-BR')})`
}
