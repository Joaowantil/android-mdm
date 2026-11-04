# Imagem do painel: compila o React e serve os arquivos com nginx (sem root).
# Build: docker compose build web

# ---- etapa 1: compilar. Node 22 sobre Debian (glibc): a mesma combinação em que o build foi testado.
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- etapa 2: servir. nginx "unprivileged" roda como usuário comum na porta 8080 e só grava em /tmp,
# o que permite rodar o container com o sistema de arquivos somente leitura.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
