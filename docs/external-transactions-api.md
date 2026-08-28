# API externa de transações

A Edge Function `external-transactions` permite que integrações confiáveis criem transações no Cofre360 sem compartilhar a sessão Supabase do usuário.

## Secrets obrigatórios

Configure no ambiente da função:

- `COFRE360_EXTERNAL_API_TOKEN`: token aleatório e longo, exclusivo para integrações externas.
- `COFRE360_EXTERNAL_USER_ID`: UUID do usuário do Cofre360 que receberá as transações.
- `SUPABASE_URL`: já fornecido pelo Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: já fornecido pelo Supabase para Edge Functions.

Nunca coloque `COFRE360_EXTERNAL_API_TOKEN` ou `SUPABASE_SERVICE_ROLE_KEY` no frontend, no Git ou em mensagens públicas.

## Deploy

```bash
supabase functions deploy external-transactions --project-ref scbkqzoyyooclvmtcfis --no-verify-jwt
```

Exemplo para configurar os secrets via CLI:

```bash
supabase secrets set \
  COFRE360_EXTERNAL_API_TOKEN='gere-um-token-forte-aqui' \
  COFRE360_EXTERNAL_USER_ID='uuid-do-usuario' \
  --project-ref scbkqzoyyooclvmtcfis
```

## Requisição

`POST /functions/v1/external-transactions`

Headers:

```text
Authorization: Bearer <COFRE360_EXTERNAL_API_TOKEN>
Content-Type: application/json
```

Body mínimo:

```json
{
  "name": "[Teste] Padaria",
  "amount": 100,
  "type": "expense",
  "category": "Alimentação",
  "subcategory": "Padaria"
}
```

A resolução de nomes ignora acentos e aceita correspondência parcial. Por exemplo, `subcategory: "Padaria"` encontra `Padaria/Café` e grava a categoria no padrão usado pelo app: `Alimentação > Padaria/Café`.

Campos opcionais: `date` (`YYYY-MM-DD` ou `DD/MM/YYYY`), `bank_account_id`, `card` e `icon`.

Resposta de sucesso (`201`):

```json
{
  "ok": true,
  "transaction": {
    "id": "...",
    "name": "[Teste] Padaria",
    "amount": 100,
    "type": "expense",
    "category": "Alimentação > Padaria/Café",
    "date": "2026-08-27"
  }
}
```

## Segurança

A função não aceita `user_id` no body. O usuário de destino é fixado no secret `COFRE360_EXTERNAL_USER_ID`, evitando que um cliente com o token escolha arbitrariamente outro usuário. O endpoint também valida valores positivos e confirma que qualquer `bank_account_id` informado pertence ao usuário configurado.
