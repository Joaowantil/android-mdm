# CLAUDE.md

Guia para assistentes de código (Claude Code e similares) e para quem der manutenção. Leia as seções
"Armadilhas" antes de mexer: cada item abaixo já causou, ou causaria, um problema real neste projeto.
A instalação, a operação e a migração estão no `README.md`.

## O que é

**Arezzo Device Manager**: MDM para os coletores Android (Zebra) da empresa. O app exige Android 8.0 (API 26) ou mais; a frota atual roda 8.1 a 11. Três partes:
`backend/` (API FastAPI), `frontend/` (painel React) e `android-agent/` (app Kotlin Device Owner).
Interface e mensagens ao usuário em **português do Brasil**. Em produção: Docker (PostgreSQL 16 + API + nginx).

## Comandos

```bash
# API
cd backend && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.lock
SECRET_KEY=dev uvicorn app.main:app --reload             # SQLite local; DEBUG=true abre /docs
python tests/scenario.py                                 # 33 verificações ponta a ponta
python tests/seed_check.py                               # 7 verificações do administrador inicial
DATABASE_URL=postgresql://USER:SENHA@HOST/DB python tests/scenario.py    # mesmo roteiro no PostgreSQL

# Painel
cd frontend && npm ci && npm run dev                     # :5173, repassa /api para :8000
npx tsc --noEmit && npm run build                        # os dois precisam passar antes de qualquer PR

# Docker
cp .env.example .env && docker compose up -d --build
sh scripts/status.sh | backup.sh | restore.sh | importar-dump.sh | gerar-dump-producao.sh
```

## Mapa do código

| Onde | O quê |
|---|---|
| `backend/app/main.py` | Sobe a API: aviso de `SECRET_KEY` padrão, `init_db`, `seed_admin`, cabeçalhos de segurança |
| `backend/app/api/routes/` | `auth`, `devices`, `policies`, `groups`, `users`, `audit`, `sessions`, `compliance` |
| `backend/app/core/` | `config` (variáveis), `database` (engine, `get_db`, migrações leves), `security` (JWT, bcrypt, `get_current_user/admin`), `rate_limit` |
| `backend/app/services/` | `audit.log_action`, `seed.seed_admin`, `geocode` |
| `frontend/src/theme.ts` | **Única** fonte das cores/tipografia da marca |
| `frontend/src/components/` | `Layout`, `PageHeader`, `StatusChip`, `BatteryIndicator`, `BrandMark` |
| `frontend/src/utils/` | `time` (datas), `labels` (traduções de status/ações), `errors`, `csv` |
| `android-agent/.../services/` | `HeartbeatService` (consulta a cada 15 s), `CommandProcessor`, `LocationService`, `FloatingHomeService` (kiosk) |
| `scripts/` | Operação do Docker (backup, restore, importar/gerar dump, status) |

Políticas: `app_allowlist`, `app_blocklist`, `kiosk`, `restrictions`. Comandos tratados pelo agente:
`lock`, `wipe`, `locate`, `clear_web_cache`, `apply_policy`, `show_message`, `reboot`.

## Armadilhas: backend

1. **`get_db` faz o `commit` DEPOIS de a resposta sair** (comportamento do FastAPI 0.104). Se o commit
   falhar, o cliente já recebeu sucesso; o erro só aparece no log (`commit failed`). Consequências:
   (a) o que precisa ficar gravado **mesmo quando a rota lança `HTTPException`** (ex.: tentativa de login
   recusada, para a auditoria) exige `await db.commit()` **antes** do `raise` (veja `auth.login`);
   (b) depois de `delete`, faça `await db.flush()` para a violação de chave estrangeira estourar **dentro**
   da rota, não depois. **Atualizar o FastAPI muda este momento**: só em PR dedicado, com o roteiro completo.
2. **Chaves estrangeiras valem no PostgreSQL (e não no SQLite).** Ao apagar um registro "pai", apague os
   dependentes antes: aparelho → `_purge_device` (comandos, atribuições); usuário → suas sessões; grupo →
   desvincula os aparelhos. Tabela nova com FK precisa entrar nesses fluxos. O `scenario.py` cobre isso.
3. **Não há Alembic.** Tabela nova nasce sozinha (`create_all`). **Coluna nova numa tabela existente exige
   uma linha em `_run_light_migrations` (`core/database.py`)**: sem ela, só bancos novos recebem a coluna
   e os existentes quebram na primeira consulta.
4. **Autenticação.** O JWT carrega um `jti` espelhado na tabela `sessions`; `get_current_user` revalida a
   cada requisição que o usuário existe e está ativo e que a sessão não foi revogada. Rotas sensíveis usam
   `get_current_admin`. `lock`, `wipe` e `reboot` são só de administrador, **inclusive pelo endpoint
   genérico `/devices/{id}/command`** (`ADMIN_ONLY_COMMANDS`): comando novo e perigoso entra nessa lista.
5. **Aparelhos autenticam com `device_secret`** (gerado no cadastro), nunca com JWT. Não escreva segredos,
   tokens nem URLs com token em log, em auditoria ou em mensagem de erro.
6. **Toda ação que muda estado chama `log_action`** (`services/audit.py`).
7. **Administrador inicial.** `seed_admin` só cria o `admin@mdm.local` quando **não existe nenhum usuário**,
   com a senha de `INITIAL_ADMIN_PASSWORD`. Já foi um defeito grave (criava o usuário sempre que *aquele
   e-mail* faltava, ressuscitando `admin123` como administrador depois de a equipe removê-lo). Não "simplifique".
8. **O limite de login é em memória** (`rate_limit.py`: 5 falhas em 300 s por IP+e-mail). Por isso a API roda
   com **um** processo. Mais de um (`--workers`) dividiria o contador: moveria o limite para o banco antes.
9. **IP do cliente.** O nginx **sobrescreve** `X-Forwarded-For` com `$remote_addr`; a API confia nele via
   `--proxy-headers` + `FORWARDED_ALLOW_IPS=*`, **o que só é seguro porque a API não publica porta**. O
   uvicorn 0.24 **não aceita faixa de rede** (CIDR) nessa variável: o valor seria ignorado sem erro.
10. **Datas.** O SQLite devolve `datetime` sem fuso; o PostgreSQL, com fuso. Use sempre
    `datetime.now(timezone.utc)`. No painel, **nunca** `new Date(texto)` direto numa data da API: use
    `parseServerDate` (`utils/time.ts`), que trata data sem fuso como UTC (senão erra 3 horas).
11. **Dependências.** Edite `requirements.txt` (diretas) e **regenere `requirements.lock`** (o Dockerfile
    instala o lock). Não reintroduza `alembic`, `firebase-admin` nem `python-multipart` sem uso real
    (o `fcm_token` é só um campo; nada chama o Firebase). O restante dos avisos do `pip-audit` está preso
    ao FastAPI 0.104 e foi avaliado no README, seção 5.4.

## Armadilhas: painel

- **Cores só em `theme.ts`.** Quando a identidade visual oficial chegar, muda-se um arquivo.
- **`Layout.tsx`:** `HEADER_HEIGHT` é compartilhado pela barra superior e pelo bloco da marca no menu
  (senão as linhas ficam em alturas diferentes). Em telas ≥ `sm` a **página não rola**: quem rola é o painel
  interno (`data-testid="scroller"`, com `scrollbar-gutter: stable`), para a barra de rolagem não empurrar o
  que fica à direita. Cuidado com `window.scrollTo` e `position: sticky` relativos à janela.
- **`services/api.ts`:** resposta 401 desloga e recarrega, **exceto no `/auth/login`** (lá 401 é "senha
  errada"; recarregar apagava a mensagem de erro).
- O preenchimento automático do navegador (que pintava os campos de azul) é coberto no `theme.ts`
  (`MuiOutlinedInput`) e, no login, em `Login.tsx` (`fieldSx`).
- Valores internos (`enrolled`, `auth.login_failed`...) nunca aparecem na tela: traduza em `utils/labels.ts`.
- **Não renomeie** as chaves do `localStorage` (`mdm_token`, `mdm_theme_mode`): derrubaria logins e preferências.

## Armadilhas: Android

- **Nunca mude o `applicationId` (`com.mdm.agent`), o pacote nem as `SharedPreferences` (`mdm_prefs`).** O
  Device Owner é atrelado ao pacote: mudar exigiria reset de fábrica de todos os aparelhos.
- Endereço do servidor: `MDM_SERVER_URL` em `app/build.gradle.kts`, fixado na compilação.
- Heartbeat: `HeartbeatService` (15 s) + `WatchdogReceiver` (5 min, rede de segurança) + `HeartbeatWorker`.
- **Neste ambiente não há Android SDK.** Mudanças em Kotlin não podem ser compiladas pelo assistente: revise
  com cuidado e peça a compilação e um teste num aparelho real.
- Pendência conhecida: as restrições de **Wi-Fi e Bluetooth** das políticas **não são aplicadas** pelo agente.

## Nomes (não "corrija")

Produto: **Arezzo Device Manager**. Nome do app na tela inicial: **ARZ AGENT**. ID de patrimônio:
`ARZ-0001` (calculado do id em `schemas/device.py`; as etiquetas físicas usam esse valor). **Mantidos de
propósito com o nome antigo:** `com.mdm.agent`, `mdm_prefs`, `mdm_*` no localStorage, `admin@mdm.local`, o
nome do repositório e o serviço `mdm-backend`.

## Armadilhas: Docker

- `tests/` **não entra na imagem**: o roteiro cria usuários e aparelhos e **nunca** deve rodar contra o banco real.
- A API roda com sistema de arquivos **somente leitura**: ela não grava em disco; não adicione escrita local.
- Ao mexer no `nginx.conf`, mantenha `proxy_set_header X-Forwarded-For $remote_addr` (sobrescrever, não acrescentar).
- As redes usam `198.18.x.x` de propósito (evita sobrepor rotas `172.x` da rede da empresa).
- Mudou compose/Dockerfile? Valide o compose contra o esquema oficial e rode o `hadolint`.
- Os scripts de `scripts/` são `sh` puro (sem `bash`), com quebra de linha LF (`.gitattributes`).

## Antes de abrir um PR

1. `python tests/scenario.py` em **SQLite e em PostgreSQL**, e `python tests/seed_check.py`: tudo passando.
2. Painel: `npx tsc --noEmit` e `npm run build` sem erro.
3. Nada de `.env`, `*.dump`, backups ou senhas no commit.
4. Mudou o comportamento de segurança? Registre no PR o que mudou e como foi verificado.

## Pendências conhecidas

HTTPS/TLS (hoje HTTP); atualizar o FastAPI/Starlette (PR dedicado, ver item 1); `react-router-dom` e `vite`
(avisos de `npm audit` que só fecham com versão maior); restrições de Wi-Fi/Bluetooth no agente; relatório de
conformidade cobre só listas de bloqueio; webhooks/Slack, agendamentos e geocerca foram planejados e **não** implementados.

## Dados sensíveis (para assistentes)

Dumps, backups e `.env` contêm hashes de senha e segredos de aparelhos: **não leia, não cole em conversa, não
commite**. Para testar com dados realistas use o dump de demonstração (fictício), nunca o de produção.
Nunca registre ou exiba senhas, tokens ou `device_secret`.
