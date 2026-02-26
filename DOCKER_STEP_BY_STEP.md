# Docker (MySQL + API) - Passo a passo

Este repositório é o **Front**. O `docker-compose.yml` aqui sobe:
- `mysql` (MySQL 8)
- `api` (sua API .NET 8) **buildando a partir da pasta da API** (fora do front)

## 0) Pré-requisitos
- Docker Desktop instalado e rodando.
- Pasta da API (.NET) disponível localmente.

## 1) Preparar variáveis de ambiente
1. Copie o arquivo `.env.example` para `.env`
2. Edite o `.env` e ajuste principalmente:
   - `API_CONTEXT` (caminho até a pasta da API)
   - senhas do MySQL

No Windows, você pode usar caminho absoluto (prefira `/`):

```text
API_CONTEXT=C:/Users/ferre/OneDrive/Área de Trabalho/ProjetoBarbearia/Projeto-Barbearia-Back-C-
```

## 2) Garantir Dockerfile na API
O Compose assume que existe um `Dockerfile` **na raiz da pasta da API** (a pasta apontada por `API_CONTEXT`).

No seu caso, como o projeto é `APIBarbearia.csproj`, o mais comum é deixar o `Dockerfile` na **mesma pasta** onde está esse `.csproj`.

Se você ainda não tem, crie um `Dockerfile` lá (na API) com um padrão .NET 8 (multi-stage build). Se você me disser o nome do projeto `.csproj` da API, eu te dou o Dockerfile exato.

## 3) Atenção: HTTPS redirection
Se no `Program.cs` você tiver `app.UseHttpsRedirection();`, ao rodar HTTP no container você pode cair em redirect para HTTPS e quebrar.

Recomendação para DEV em Docker:
- Desabilitar HTTPS redirection quando `ASPNETCORE_ENVIRONMENT=Docker`.

## 4) Subir MySQL + API
Na raiz do front (onde está este arquivo):

```powershell
docker compose --env-file .env up -d --build
```

Ver logs:
```powershell
docker compose logs -f mysql
```
```powershell
docker compose logs -f api
```

## 5) Subir o Front apontando para a API dockerizada
Já foi criado `proxy.docker.conf.json` e o script `start:docker`.

```powershell
npm run start:docker
```

## 6) Derrubar tudo
```powershell
docker compose down
```

> Seus dados do MySQL ficam no volume `mysql_data`.
