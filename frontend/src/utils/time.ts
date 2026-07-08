// Human-friendly "last time online" text based on the last heartbeat.
export function lastOnlineText(iso: string | null): string {
  if (!iso) return 'Nunca'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'Nunca'
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000))
  let rel: string
  if (diffSec < 60) rel = 'agora mesmo'
  else if (diffSec < 3600) rel = `há ${Math.floor(diffSec / 60)} min`
  else if (diffSec < 86400) rel = `há ${Math.floor(diffSec / 3600)} h`
  else rel = `há ${Math.floor(diffSec / 86400)} d`
  return `${rel} (${new Date(iso).toLocaleString('pt-BR')})`
}
