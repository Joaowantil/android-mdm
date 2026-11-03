// Tradução dos valores internos (que vêm do banco/API em inglês) para o que a pessoa lê.
export type Tone = 'success' | 'warning' | 'error' | 'info' | 'default'

const STATUS: Record<string, { label: string; tone: Tone }> = {
  enrolled: { label: 'Ativo', tone: 'success' },
  active: { label: 'Ativo', tone: 'success' },
  locked: { label: 'Bloqueado', tone: 'warning' },
  pending: { label: 'Aguardando cadastro', tone: 'default' },
  releasing: { label: 'Liberando', tone: 'info' },
  wiped: { label: 'Apagado', tone: 'error' },
}
export function statusInfo(status: string): { label: string; tone: Tone } {
  return STATUS[status] ?? { label: status, tone: 'default' }
}

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  'auth.login': { label: 'Login', tone: 'success' },
  'auth.login_failed': { label: 'Login recusado', tone: 'error' },
  'auth.login_blocked': { label: 'Login bloqueado', tone: 'error' },
  'user.create': { label: 'Usuário criado', tone: 'info' },
  'user.update': { label: 'Usuário editado', tone: 'info' },
  'user.password_change': { label: 'Senha alterada', tone: 'info' },
  'user.delete': { label: 'Usuário excluído', tone: 'error' },
  'device.lock': { label: 'Dispositivo bloqueado', tone: 'warning' },
  'device.wipe': { label: 'Dispositivo apagado', tone: 'error' },
  'device.reboot': { label: 'Dispositivo reiniciado', tone: 'warning' },
  'device.message': { label: 'Mensagem enviada', tone: 'default' },
  'device.command': { label: 'Comando enviado', tone: 'default' },
  'device.delete': { label: 'Dispositivo removido', tone: 'error' },
  'policy.create': { label: 'Política criada', tone: 'info' },
  'policy.update': { label: 'Política editada', tone: 'info' },
  'policy.delete': { label: 'Política excluída', tone: 'error' },
  'policy.assign': { label: 'Política atribuída', tone: 'info' },
  'session.revoke': { label: 'Sessão revogada', tone: 'warning' },
}
export function actionInfo(action: string): { label: string; tone: Tone } {
  return ACTIONS[action] ?? { label: action, tone: 'default' }
}
export const ACTION_OPTIONS = Object.entries(ACTIONS).map(([value, v]) => ({ value, label: v.label }))

const TARGET: Record<string, string> = {
  user: 'Usuário',
  device: 'Dispositivo',
  policy: 'Política',
  session: 'Sessão',
  group: 'Grupo',
}
export function targetLabel(type: string | null, id: string | null): string {
  if (!type) return '—'
  const name = TARGET[type] ?? type
  return id ? `${name} ${id}` : name
}

export const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', operator: 'Operador' }
