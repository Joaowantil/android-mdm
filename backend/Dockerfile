# Imagem da API (FastAPI). Build: docker compose build backend
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# O lock (versões exatas, inclusive das dependências indiretas) vem primeiro: esta camada só é
# refeita quando ele muda. Se um pacote não tiver "wheel" para a sua arquitetura o build FALHA
# aqui, na hora (não há compilador na imagem), e não em produção.
COPY requirements.lock .
RUN pip install -r requirements.lock

COPY app ./app
# scripts/ traz o migrador do SQLite e o verificador de senhas padrão. tests/ NÃO vai na imagem:
# o roteiro de regressão cria usuários e aparelhos, e não pode ser rodado contra o banco real.
COPY scripts ./scripts

# A API não precisa de root nem grava nada em disco (o banco é o PostgreSQL).
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin mdm
USER 10001

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

# Uma instância só (sem --workers): o limite de tentativas de login fica em memória, e várias
# instâncias o dividiriam. O IP real do cliente vem do nginx (X-Forwarded-For); em quem
# confiar é definido pela variável FORWARDED_ALLOW_IPS no docker-compose.yml.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
