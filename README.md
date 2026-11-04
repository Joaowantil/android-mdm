# Arezzo Device Manager

Gerenciamento de dispositivos móveis Android (MDM) para a frota de coletores de dados da empresa.
Cadastro de aparelhos por QR code, políticas de aplicativos, modo kiosk, restrições, comandos remotos
(bloquear, reiniciar, apagar, localizar, enviar mensagem), grupos, auditoria e painel web.

- [1. Visão geral](#1-visão-geral)
- [2. Instalação com Docker](#2-instalação-com-docker)
- [3. Migrar do servidor atual](#3-migrar-do-servidor-atual)
- [4. Operação do dia a dia](#4-operação-do-dia-a-dia)
- [5. Segurança](#5-segurança)
- [6. Agente Android](#6-agente-android)
- [7. Desenvolvimento local](#7-desenvolvimento-local)
- [8. Estrutura do repositório e API](#8-estrutura-do-repositório-e-api)
- [9. Solução de problemas](#9-solução-de-problemas)
- [10. O que foi (e o que não foi) validado](#10-o-que-foi-e-o-que-não-foi-validado)

---

## 1. Visão geral

```
 Navegador ──HTTP──▶ ┌────────────────────────────────────────────┐
 (painel React)      │ servidor Docker                            │
                     │                                            │
 Aparelhos Android   │  web (nginx) ──▶ backend (FastAPI) ──▶ db  │
 (agente Kotlin) ──▶ │  :8080            :8000 (interna)   (PostgreSQL 16)
   heartbeat a cada  │  publicado como                            │
   ~15 s             │  80 e 8000                                 │
                     └────────────────────────────────────────────┘
```

O agente instalado em cada aparelho consulta a API a cada cerca de 15 segundos (*heartbeat*), recebe
os comandos pendentes, executa e confirma. O servidor **nunca** precisa alcançar o aparelho: só o
aparelho precisa alcançar o servidor.

| Camada | Tecnologia |
|---|---|
| Painel | React 18, TypeScript, Material UI 5, Vite, Recharts |
| API | Python 3.12, FastAPI 0.104, SQLAlchemy 2 (assíncrono), Pydantic 2 |
| Banco | PostgreSQL 16 (driver asyncpg) |
| Autenticação | JWT (HS256) com sessões revogáveis, senhas com bcrypt |
| Agente | Kotlin, Android 8.0+ (API 26), modo Device Owner |
| Entrada | nginx (serve o painel e repassa `/api` para a API) |

---

## 2. Instalação com Docker

### 2.1 Requisitos

| Item | Mínimo | Recomendado |
|---|---|---|
| Sistema | Linux 64 bits | Ubuntu 24.04 LTS |
| Docker | Engine 24 com **Compose v2** (`docker compose`, com espaço) | versão atual, Compose 2.20 ou superior |
| CPU / memória / disco | 2 vCPU / 2 GB / 20 GB | 2 vCPU / 4 GB / 40 GB SSD |
| Rede | IP fixo; portas 80 e 8000 livres | + HTTPS (veja a seção 5) |
| Outros | Git; saída para a internet **durante o build** (Docker Hub, PyPI, npm) | |

Os números de CPU, memória e disco são **estimativas**, não resultado de teste de carga. Para ~15
aparelhos o sistema é muito leve; a compilação do painel é o momento mais pesado (usa 1 a 2 GB).
O relógio do servidor precisa estar correto (NTP): o login e o "online/offline" dependem da hora.

### 2.2 Passo a passo

```bash
git clone https://github.com/Joaowantil/android-mdm.git
cd android-mdm
git checkout devin/1781024373-initial-mdm        # o branch de trabalho do projeto

cp .env.example .env
chmod 600 .env
openssl rand -hex 32     # cole em POSTGRES_PASSWORD
openssl rand -hex 32     # cole em SECRET_KEY
nano .env                # preencha também INITIAL_ADMIN_PASSWORD (mínimo 8 caracteres)

docker compose up -d --build
sh scripts/status.sh
```

A primeira subida leva alguns minutos (baixa as imagens e compila o painel). Quando terminar, os três
serviços aparecem como `healthy`. Abra `http://IP-DO-SERVIDOR`.

> **Primeiro acesso em banco vazio:** entre com `admin@mdm.local` e a senha que você pôs em
> `INITIAL_ADMIN_PASSWORD`. **Troque a senha** e crie contas nominais. Esse usuário só é criado quando
> **não existe nenhum usuário** no banco: apagar ou renomear o admin padrão é seguro e ele **não volta**.

### 2.3 Variáveis (`.env`)

| Variável | Obrigatória | Padrão | Para que serve |
|---|---|---|---|
| `POSTGRES_PASSWORD` | sim | | Senha do banco. **Só vale na criação do volume** (veja a seção 4.5). Use hex (`openssl rand -hex 32`): ela entra numa URL. |
| `SECRET_KEY` | sim | | Assina os logins. Trocar derruba as sessões abertas (ninguém perde dados). |
| `INITIAL_ADMIN_PASSWORD` | sim | | Senha do `admin@mdm.local` na 1ª subida com banco vazio. Ignorada ao restaurar um dump. Mínimo 8 caracteres. |
| `HTTP_PORT` | não | `80` | Porta do painel e da API no servidor. |
| `LEGACY_API_PORT` | não | `8000` | Porta antiga, para os aparelhos já instalados (veja a seção 3.1). Diferente de `HTTP_PORT`. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | não | `480` | Duração do login no painel. |
| `BACKEND_MEM_LIMIT` / `DB_MEM_LIMIT` / `WEB_MEM_LIMIT` | não | `512m` / `1g` / `128m` | Limite de memória de cada container. |
| `MDM_WEB_SUBNET` / `MDM_DB_SUBNET` | não | `198.18.40.0/24` / `198.18.41.0/24` | Faixas das redes internas do Docker (seção 2.4). |

### 2.4 Portas e redes

- **Só o `web` publica portas** (80 e 8000, ambas levam ao mesmo nginx). O banco e a API **não** são
  acessíveis de fora do servidor.
- O banco fica numa rede `internal`: não tem saída para a internet. A API tem saída (consulta de
  endereço por coordenadas, via OpenStreetMap).
- **Conflito de rede.** O Docker escolhe sozinho uma sub-rede `172.x` para suas redes. Em redes
  corporativas que usam `172.x` (os coletores desta empresa estão em `172.23.x`), isso pode sobrepor uma
  rota real do servidor e **derrubar a comunicação com outras redes sem nenhum aviso**. Por isso o
  compose fixa faixas incomuns (`198.18.0.0/15`, reservada para testes de rede). Se elas conflitarem com
  algo seu, mude no `.env`. Para conferir: `docker network inspect mdm_web_net mdm_db_net` e `ip route`.
- **O Docker ignora o `ufw`.** Portas publicadas pelo Docker entram direto no `iptables`, e uma regra
  `ufw deny` **não as bloqueia**. Restrinja o acesso no firewall da rede ou do hipervisor, ou prenda a
  porta a uma interface no compose (por exemplo `"192.168.1.50:80:8080"`).

### 2.5 Primeira subida: o que conferir

O `docker compose up` completo **não foi executado pelo autor** (o ambiente de desenvolvimento não tinha
Docker; veja a seção 10). Faça a primeira subida em um servidor de teste e confira:

1. `docker compose build` termina sem erro. Se falhar em `pip install`, é um pacote sem versão pronta
   para a sua arquitetura (o build para ali de propósito, em vez de falhar em produção).
2. `sh scripts/status.sh` mostra `db`, `backend` e `web` como `healthy`.
3. `curl http://localhost/health` responde `{"status":"healthy"}`.
4. Se o `web` não subir, comente `read_only`, `cap_drop` e `tmpfs` desse serviço no compose e informe o erro.
   Esses endurecimentos foram escolhidos com base na documentação da imagem, **sem poder testá-los**.

---

## 3. Migrar do servidor atual

O servidor atual roda a API direto na máquina (sem Docker) com o PostgreSQL instalado nela. A virada leva
o **banco** para o Docker; os **aparelhos não precisam ser recadastrados** (o segredo de cada aparelho e
as senhas dos usuários vão dentro do dump).

### 3.1 Decisão que bloqueia tudo: o endereço dos aparelhos

**O endereço do servidor está gravado dentro do APK** de cada aparelho (hoje `http://IP:8000`). O servidor
novo precisa responder **nesse mesmo endereço**, senão os aparelhos ficam sem comunicação. Há dois caminhos:

- **Assumir o IP/nome do servidor antigo** (reatribuir o IP, ou apontar o DNS). Os aparelhos nem percebem.
  A porta 8000 do compose existe para isso (`LEGACY_API_PORT`).
- **Recompilar e reinstalar o APK em todos os aparelhos** com o endereço novo (`MDM_SERVER_URL` em
  `android-agent/app/build.gradle.kts`). Trabalhoso: evite, se puder.

Para saber para onde os aparelhos apontam hoje: veja o IP de origem das chamadas `POST /api/devices/heartbeat`
no log do servidor atual (`journalctl -u mdm-backend`) e, na máquina onde o APK foi compilado, o valor de
`MDM_SERVER_URL`.

### 3.2 Antes do dia da virada

1. **Construa as imagens no servidor novo com antecedência** (`docker compose build`), para descobrir um
   erro de build agora e não no meio da janela de parada.
2. **Ensaie a virada num servidor de teste**, duas vezes:
   - com o **dump de demonstração** (`demo/`, entregue à parte, dados fictícios): confere o roteiro;
   - com um **dump real** do servidor atual: é o único jeito de validar a restauração PostgreSQL 14 → 16.
     Gerar o dump com a API no ar é seguro (o `pg_dump` lê um instantâneo consistente); só o dump **final**,
     o da virada, exige parar a API antes. Apague esse dump de ensaio depois.
3. **Verifique as senhas padrão do sistema atual.** No servidor atual (`git pull` traz o script), com o
   ambiente do backend ativo:
   ```bash
   cd backend && python scripts/checar_senhas_padrao.py
   ```
   Se alguma conta ainda aceita `admin123` (ou outra senha fraca), troque **antes** de migrar.
4. Anote quem são os administradores (o script acima lista) e comunique a janela de parada.

### 3.3 No dia da virada

**No servidor ATUAL** (faça `git pull` antes, para ter a pasta `scripts/`; não precisa reiniciar o serviço):
```bash
systemctl stop mdm-backend                 # nada mais grava no banco
sh scripts/gerar-dump-producao.sh          # gera, VERIFICA e mostra o SHA-256
scp /var/backups/mdm/mdm-migracao-*.dump* USUARIO@SERVIDOR_NOVO:/caminho/android-mdm/migration/
```
O script mostra quantas linhas há em cada tabela e confere o arquivo gerado. Os aparelhos ficam sem
comunicar durante a janela e **voltam sozinhos** depois (eles tentam de novo a cada ciclo).

**No servidor NOVO:**
```bash
cd android-mdm && mkdir -p migration && chmod 700 migration
sh scripts/importar-dump.sh migration/mdm-migracao-AAAA-MM-DD_HHMM.dump
```
O script: confere o SHA-256 (se o `.sha256` estiver ao lado do dump), sobe só o banco, valida o arquivo,
**recusa** importar sobre um banco que já tem dados, restaura
em **uma única transação** (se algo falhar, nada fica pela metade), confere os contadores de id e só então
sobe a API e o painel.

Depois, **passe o endereço** (seção 3.1) e valide:
```bash
sh scripts/status.sh
docker compose exec backend python scripts/checar_senhas_padrao.py
```
Entre no painel com a senha de sempre e confira se os aparelhos voltam a aparecer **online** em até 30
segundos. Faça um teste real: envie uma mensagem a um coletor.

### 3.4 O que muda para os usuários

- Todos precisam **entrar de novo** (a `SECRET_KEY` nova invalida as sessões abertas). Nenhum dado se perde.
- O IP registrado no log de auditoria passa a ser o IP real do cliente também no Docker.

### 3.5 Se algo der errado (voltar atrás)

Mantenha o servidor antigo **desligado, mas intacto**, por alguns dias. Para voltar: desligue o novo e
ligue o antigo (`systemctl start mdm-backend`). **Atenção:** o que foi feito no sistema novo depois da
virada (cadastros, comandos, mudanças) não existe no antigo.

### 3.6 Depois da migração

- **Apague os dumps** do servidor antigo, do novo e da máquina de quem os copiou (eles têm hashes de senha
  e os segredos dos aparelhos).
- Ative o backup diário (seção 4.3) e **teste uma restauração** num ambiente de teste.
- A instalação antiga ainda pode estar em SQLite? O migrador `backend/scripts/migrate_sqlite_to_postgres.py`
  copia os dados do SQLite para o PostgreSQL (`--dry-run` simula; veja `--help`).

---

## 4. Operação do dia a dia

Rode sempre dentro da pasta do projeto.

### 4.1 Comandos

| O que fazer | Comando |
|---|---|
| Resumo (containers, saúde, dados, último backup) | `sh scripts/status.sh` |
| Ver o estado dos containers | `docker compose ps` |
| Acompanhar os logs | `docker compose logs -f backend` (ou `web`, `db`) |
| Reiniciar só a API | `docker compose restart backend` |
| Parar tudo (os **dados ficam**) | `docker compose down` |
| Consultar o banco | `docker compose exec db psql -U mdm -d mdm` |
| Conferir senhas fracas | `docker compose exec backend python scripts/checar_senhas_padrao.py` |

> **`docker compose down -v` APAGA O BANCO** (o `-v` remove o volume `mdm_pgdata`). Nunca use `-v` em produção.

O Docker precisa subir com o servidor: `systemctl enable docker`. Os containers têm
`restart: unless-stopped` e voltam sozinhos depois de uma reinicialização.

### 4.2 Logs

Cada container guarda até 5 arquivos de 10 MB (rotação automática). A API registra os acessos e os avisos
de segurança; o painel de **Log de auditoria** (menu, só administradores) registra quem fez o quê.

### 4.3 Backup e restauração

```bash
sh scripts/backup.sh                                     # gera backups/mdm-AAAA-MM-DD_HHMM.dump
sh scripts/restore.sh backups/mdm-AAAA-MM-DD_HHMM.dump   # SUBSTITUI os dados atuais (pede confirmação)
```

O backup pode ser feito com o sistema no ar, é **conferido** depois de gerado (um backup que nunca foi
lido é só uma esperança), tem permissão 600 e os arquivos com mais de 30 dias são apagados
(`RETENCAO_DIAS`). A restauração é uma transação única: se falhar, o banco continua como estava.

Agendar todo dia às 2h (`crontab -e` do servidor):
```
0 2 * * * cd /CAMINHO/DO/PROJETO && sh scripts/backup.sh >> backups/backup.log 2>&1
```

**Copie os backups para outro lugar**: eles estão no mesmo servidor, e disco que quebra leva tudo junto.
**Teste uma restauração de vez em quando** num ambiente de teste. Guarde também o `.env`: sem a
`POSTGRES_PASSWORD` e a `SECRET_KEY` o backup sozinho não basta para refazer a instalação do zero.

### 4.4 Atualizar para uma versão nova

```bash
sh scripts/backup.sh                    # sempre antes
git pull
docker compose up -d --build
```
Tabelas novas e as colunas já conhecidas são criadas sozinhas na inicialização (`create_all` mais migrações
leves escritas à mão em `backend/app/core/database.py`; **não há Alembic**: veja `CLAUDE.md`), e os dados são
preservados. Para voltar a uma versão anterior: `git checkout <commit>` e o mesmo `up --build`.
Mudanças no agente Android exigem **compilar e reinstalar o APK** nos aparelhos.

### 4.5 Trocar a senha do banco

`POSTGRES_PASSWORD` só vale **na criação do volume**. Mudar o `.env` depois **não** troca a senha dentro do
banco, e a API passa a falhar com `password authentication failed`. Para trocar de verdade:
```bash
docker compose exec db psql -U mdm -d mdm -c "ALTER USER mdm PASSWORD 'NOVA_SENHA_HEX'"
# depois ponha a mesma senha em POSTGRES_PASSWORD no .env e:
docker compose up -d backend
```

### 4.6 Versão do PostgreSQL

Atualizações dentro da 16 (16.x) são automáticas ao reconstruir. Trocar de versão **maior** (16 → 17)
exige gerar um backup, subir a versão nova com um volume vazio e restaurar o backup: o volume de dados
não é compatível entre versões maiores.

---

## 5. Segurança

### 5.1 O que o sistema faz

- Login com JWT e senhas em bcrypt (mínimo de 8 caracteres), **limite de 5 tentativas em 5 minutos** por
  e-mail e IP, **sessões revogáveis** (menu "Sessões ativas") e revalidação do usuário a cada requisição.
- Perfis **Administrador** e **Operador**: apagar, bloquear e reiniciar aparelhos é só do administrador,
  e isso é imposto no servidor (inclusive no endpoint genérico de comandos).
- Cada aparelho tem um **segredo próprio** (`device_secret`); o token de cadastro vale 24 h e é de uso único.
- **Log de auditoria** de logins (inclusive os recusados), usuários, políticas e comandos aos aparelhos.
- Cabeçalhos de segurança no painel e na API; a documentação interativa (`/docs`) fica **desligada**
  fora do modo de depuração.
- O administrador inicial só é criado com o banco **vazio** e a senha vem de `INITIAL_ADMIN_PASSWORD`.

### 5.2 Endurecimento dos containers

Banco e API sem porta publicada; banco em rede sem saída; API e painel com sistema de arquivos somente
leitura, sem capacidades do kernel (`cap_drop: ALL`), sem escalonamento de privilégio e rodando como
usuário comum; limites de memória; rotação de logs. A API foi observada durante todo o roteiro de testes
e **não tentou gravar nada fora de `/tmp`**.

### 5.3 Pontos que exigem atenção

1. **HTTPS.** Hoje o tráfego é HTTP e o app Android aceita HTTP. Em rede interna isolada é aceitável como
   etapa inicial, mas é o **próximo passo recomendado**: certificado num proxy na frente do `web`, trocar
   `MDM_SERVER_URL` por `https://` no agente (recompilar) e restringir o tráfego sem criptografia no app.
   Com um proxy na frente, ajuste o nginx do painel para ler o IP real (`set_real_ip_from` + `real_ip_header`),
   ou o log de auditoria passará a mostrar o IP do proxy.
2. **O Docker ignora o `ufw`** (seção 2.4): restrinja o acesso no firewall da rede.
3. **`FORWARDED_ALLOW_IPS: "*"`** só é seguro porque a API **não publica porta** e só o nginx a alcança. Se
   um dia publicar a porta da API, **remova essa linha**: senão qualquer cliente poderia forjar o IP do log.
4. **Backups e dumps contêm hashes de senha e segredos de aparelhos**: permissão 600, fora do Git, apagar
   as cópias depois de usar, nunca enviar por e-mail ou chat.
5. **Senha padrão.** Rode `scripts/checar_senhas_padrao.py` antes de expor o sistema e depois de migrar.

### 5.4 Dependências com vulnerabilidades conhecidas (avaliadas)

A auditoria (`pip-audit`) sobre o `requirements.lock` aponta **10 registros**, todos presos à versão
`fastapi==0.104.1` (que fixa `starlette<0.28` e `anyio<4`):

| Pacote | Registros | Avaliação **para este sistema** |
|---|---|---|
| starlette 0.27 | 7 | 4 exigem processar formulários `multipart` (a API não tem formulário nem upload, e o `python-multipart` nem é instalado); 2 são do `StaticFiles`/`HTTPEndpoint` (não usados); 2 são sobre o cabeçalho `Host` ao montar URLs (risco baixo). |
| anyio 3.7 | 2 | Nomes de domínio internacionais e *process pool*: não usados. |
| fastapi 0.104 | 1 | ReDoS no processamento de formulário: inalcançável sem `python-multipart`. |

**Corrigi** o que dava para corrigir sem tocar no FastAPI: `pyjwt` (17 registros) e `python-dotenv` foram
atualizados e testados. Resolver o restante exige **atualizar o FastAPI**, e essa troca muda o momento em que
o `commit` do banco acontece (veja `CLAUDE.md`, "get_db"): deve ser um PR dedicado, com testes. No painel,
`react-router-dom` e `vite` ainda têm avisos de `npm audit` que só fecham com troca de versão maior.

---

## 6. Agente Android

O app fica em `android-agent/` (Kotlin; compila com Android Studio, JDK 17, SDK 34). Resumo:

- **Endereço do servidor**: constante `MDM_SERVER_URL` em `android-agent/app/build.gradle.kts`, fixada na
  hora da compilação. O valor de fábrica (`http://10.0.2.2:8000`) só serve para o emulador.
- **Device Owner**: o aparelho precisa estar sem contas (reset de fábrica) e receber
  `adb shell dpm set-device-owner com.mdm.agent/.receivers.MDMDeviceAdminReceiver`. Sem isso o app se
  registra, mas políticas de apps, kiosk e reinício remoto não têm efeito.
- **Cadastro**: no painel, "Cadastrar dispositivo" gera um QR code (token de uso único, validade de 24 h);
  no aparelho, abrir o app e ler o QR code.
- **Nunca mude o `applicationId` (`com.mdm.agent`)**: o status de Device Owner é atrelado a ele; mudar
  exigiria reset de fábrica e reprovisionamento de todos os aparelhos. O nome que aparece na tela inicial é
  `ARZ AGENT`.

---

## 7. Desenvolvimento local

```bash
# API (SQLite local, sem Docker)
cd backend
python3 -m venv venv && . venv/bin/activate
pip install -r requirements.lock
SECRET_KEY=dev uvicorn app.main:app --reload          # http://localhost:8000  (DEBUG=true abre /docs)

# Painel
cd frontend && npm ci && npm run dev                  # http://localhost:5173 (repassa /api para :8000)
```

Testes (não rode contra o banco de produção: eles **criam** usuários e aparelhos):
```bash
cd backend
python tests/scenario.py        # 33 verificações ponta a ponta; funciona em SQLite e em PostgreSQL
python tests/seed_check.py      # administrador inicial (7 verificações)
# em PostgreSQL:  DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/BANCO python tests/scenario.py
```

Dependências: edite `backend/requirements.txt` (só as diretas) e **regenere o lock** num ambiente novo:
```bash
python3.12 -m venv /tmp/v && /tmp/v/bin/pip install -r backend/requirements.txt
{ head -2 backend/requirements.lock; /tmp/v/bin/pip freeze --exclude-editable | sort -f; } > /tmp/novo.lock && mv /tmp/novo.lock backend/requirements.lock
```

---

## 8. Estrutura do repositório e API

```
.
├── docker-compose.yml        # banco + API + painel
├── .env.example              # variáveis (copie para .env)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt      # dependências diretas
│   ├── requirements.lock     # versões exatas (o que o Docker instala)
│   ├── app/                  # api/routes, core (config, segurança, banco), models, schemas, services
│   ├── scripts/              # migrate_sqlite_to_postgres.py, checar_senhas_padrao.py
│   └── tests/                # scenario.py, seed_check.py
├── frontend/                 # painel React (Dockerfile, nginx.conf, src/)
├── android-agent/            # agente Android (Kotlin)
└── scripts/                  # operação: status, backup, restore, importar-dump, gerar-dump-producao
```

API (lista gerada do próprio sistema). Tudo sob `/api`, exceto `/health`. Autenticação por `Bearer`
token, exceto as rotas dos aparelhos (marcadas com ★), que usam o `device_secret`.

| Grupo | Rotas |
|---|---|
| Autenticação | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Dispositivos | `GET /devices`, `GET /devices/{id}`, `PUT /devices/{id}`, `DELETE /devices/{id}`, `GET /devices/enrollment-token` |
| Comandos | `POST /devices/{id}/lock` · `/wipe` · `/reboot` · `/locate` · `/message` · `/command` (lock, wipe e reboot: só administrador) |
| Aparelhos ★ | `POST /devices/enroll`, `POST /devices/heartbeat`, `POST /devices/location`, `POST /devices/command/{id}/ack` |
| Políticas | `GET/POST /policies`, `GET/PUT/DELETE /policies/{id}`, `POST /policies/{id}/assign`, `GET /policies/{id}/assignments` |
| Grupos | `GET/POST /groups`, `PUT/DELETE /groups/{id}` |
| Usuários (admin) | `GET/POST /users`, `PUT/DELETE /users/{id}`, `PUT /users/{id}/password` |
| Relatórios (admin) | `GET /audit-logs`, `GET /sessions`, `DELETE /sessions/{id}` · (todos) `GET /compliance/blocklist-violations` |
| Saúde | `GET /health` (sem autenticação) |

---

## 9. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `docker compose up` para pedindo para definir uma variável | `.env` ausente ou com variável obrigatória vazia | `cp .env.example .env` e preencher as três obrigatórias |
| `backend` reinicia ou fica `unhealthy` | Não alcança o banco, ou erro de configuração | `docker compose logs backend`: leia a última mensagem |
| `password authentication failed for user "mdm"` | `POSTGRES_PASSWORD` mudou depois da criação do volume | Volte ao valor original (ou veja a seção 4.5). Só em teste: `docker compose down -v` recomeça do zero |
| A API não sobe e fala em `INITIAL_ADMIN_PASSWORD` | Senha inicial com menos de 8 caracteres | Use 8 ou mais |
| O painel abre mas dá erro 502 | API ainda subindo ou parada | `sh scripts/status.sh` e `docker compose logs backend` |
| Porta em uso | Outro serviço usa a 80 (ou a 8000) | Pare o outro serviço ou mude `HTTP_PORT` / `LEGACY_API_PORT` |
| Aparelhos não voltam depois da virada | O servidor novo não responde no endereço gravado no APK | Seção 3.1 |
| `docker compose up` derruba a rede do servidor | Faixa de rede do Docker sobrepõe uma rota real | Seção 2.4: mude `MDM_WEB_SUBNET` e `MDM_DB_SUBNET` |
| Todos aparecem com o IP do proxy no log | Há um proxy na frente do `web` | Seção 5.3, item 1 |
| O build do painel termina com `Killed` | Falta de memória | Mais memória ou um arquivo de swap |
| A importação recusa o dump | O banco já tem tabelas (a API já subiu uma vez e criou o esquema vazio) | Se só há tabelas vazias, rode de novo com `--force` |
| Erro `must be owner of schema public` ao restaurar | Restaurando fora do container (usuário sem poder de superusuário) | No container o usuário `mdm` é superusuário; fora dele, restaure como `postgres` |

---

## 10. O que foi (e o que não foi) validado

**Validado, com testes executados:**

- **API sobre PostgreSQL 16** e sobre SQLite: roteiro de 33 verificações ponta a ponta (login, aparelhos,
  comandos, políticas, exclusões com dependências, sessões, auditoria) e 7 do administrador inicial, todos
  passando, também com a instalação **feita só a partir do `requirements.lock`** num ambiente novo.
- **Imagem da API**: o mesmo comando do `Dockerfile` atrás do nginx real; nenhuma tentativa de escrita
  fora de `/tmp` durante o roteiro completo; IP real do cliente chegando ao log; IP forjado descartado;
  limite de tentativas de login não driblável.
- **nginx** (configuração exata da imagem): sintaxe, painel e rotas, cache, compressão só dos estáticos,
  `/health`, cabeçalhos sem duplicar.
- **`docker-compose.yml`**: validado contra o **esquema oficial** do Compose; as propriedades de isolamento
  (portas, redes, healthchecks, ordem de subida, limites) conferidas por leitura do próprio arquivo. Os
  dois `Dockerfile`s passam no `hadolint`.
- **Scripts de operação**: lógica testada contra um PostgreSQL real (importação em banco vazio, recusa sobre
  dados, cancelamento, `--force`, arquivo corrompido ou adulterado, **falha no meio da restauração sem deixar
  nada pela metade**, backup, retenção).
- **Ensaio da virada** com o dump de demonstração: contagens e conteúdo idênticos tabela a tabela, API de
  verdade sobre o banco restaurado, aparelhos autenticando com o segredo restaurado, novos cadastros sem
  colisão de id.

**NÃO validado (e por quê):**

- **`docker build` e `docker compose up` nunca foram executados**: o ambiente de desenvolvimento não tinha
  Docker. Os testes de lógica usaram um `docker` simulado; as imagens, o `read_only`/`cap_drop` do `web`
  (nginx sem privilégios) e a rede real do Docker **só serão provados na primeira subida** (seção 2.5).
- **Restauração PostgreSQL 14 → 16**: o servidor atual usa a 14 e o container usa a 16. Restaurar um dump
  de versão anterior numa mais nova é o caminho suportado pelo PostgreSQL, mas o teste foi 16 → 16.
  Faça o ensaio com um dump real do servidor atual **antes** do dia da virada.
- **Arquitetura ARM**: não testada (os pacotes têm versões prontas, mas não foi comprovado).
- **Carga**: o sistema nunca passou por teste de carga; foi usado com poucos aparelhos.
- **O painel não foi testado a partir do container** (só o mesmo build servido pelo nginx local).

## Licença

MIT
