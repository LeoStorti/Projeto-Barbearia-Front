# Checklist de Seguranca - Execucao Hoje

Objetivo: reduzir risco imediato de indisponibilidade e vazamento com a menor mudanca possivel.

## 1) Validar saude do SSR
- Build e subir SSR:
  - npm run build
  - npm run serve:ssr:projectangular
- Verificar health local:
  - npm run health:ssr

## 2) Fazer warm-up para reduzir cold start percebido
- Rodar warm-up manual:
  - npm run warmup:ssr
- Opcional (producao): configurar cron externo para chamar:
  - /healthz a cada 5-10 min

## 3) Protecao de borda (fora deste repo)
- Ativar rate limit/WAF na plataforma de deploy (Vercel/Cloudflare/Render).
- Bloquear IPs e paises nao necessarios (quando aplicavel).

## 4) Segredos e credenciais (fora deste repo)
- Rotacionar hoje:
  - JWT key
  - senha do banco
  - tokens de integracao
- Remover credenciais antigas e invalidar sessoes longas.

## 5) CORS e cookies (backend principal)
- CORS permitido apenas para dominios oficiais do front.
- Cookie de sessao com HttpOnly + Secure (em producao) + SameSite apropriado.

## 6) Backup e restore rapido
- Gerar backup imediato do banco.
- Testar restore em ambiente separado no mesmo dia.

## 7) Monitoracao minima hoje
- Alertas de uptime, erro 5xx e latencia alta.
- Registrar quem recebeu alerta e tempo de resposta.

## Comandos adicionados neste repo
- npm run health:ssr
- npm run warmup:ssr

## Endpoints adicionados
- GET /healthz
- GET /readyz
