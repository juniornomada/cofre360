# Cofre 360 — Reconciliação segura do histórico de migrações

**Captura:** 19/10/2026. **Projeto:** Supabase `bllqvpnjfpcvujrbrbig`. **Tipo:** diagnóstico estritamente de leitura, sem SQL de alteração.

## Problema confirmado

A verificação `Supabase Preview` do GitHub Integration informa `Remote migration versions not found in local migrations directory`. A produção continua ativa; este erro diz respeito ao **registro de migrações** e não comprova falha nos saldos ou tabelas.

| Indicador (captura de 19/10/2026) | Quantidade |
| --- | ---: |
| Histórico remoto em `supabase_migrations.schema_migrations` | 101 |
| Arquivos `supabase/migrations/*.sql` no GitHub (`main`) | 88 |
| Versões presentes nos dois lados | 18 |
| Versões remotas sem nome de versão equivalente no GitHub | 83 |
| Arquivos locais sem versão equivalente no histórico remoto | 70 |
| Mesmo conteúdo SQL encontrado em ambos os lados (considerando quebra de linha final) | 56 |
| SQL idêntico, mas identificador de versão diferente | 38 |
| Migrações remotas sem SQL idêntico em arquivo local | 45 |
| Arquivos locais sem SQL idêntico no histórico remoto | 32 |

O histórico remoto guarda os comandos SQL originais das **101** versões, incluindo as antigas com nome vazio. **Isso é evidência disponível para investigação, não um backup de produção.** Em amostras, nomes locais têm timestamps alguns segundos posteriores aos do registro remoto. Cinco migrações com o mesmo nome descritivo também usam identificadores diferentes; quatro coincidem diretamente no conteúdo SQL (ignorando uma quebra de linha final) e uma coincide após desconsiderar comentários/espaçamento.

## Reprodução gratuita, sem Supabase, senha ou token

O arquivo `audits/supabase-migrations-2026-10-19.json` contém apenas versões, nomes descritivos e fingerprints SHA-1 compatíveis com blobs Git. **Não** contém corpo SQL, tokens, nomes de usuários, registros financeiros, dados pessoais ou valores bancários.

Execute a partir da raiz do repositório:

```bash
node scripts/audit-supabase-migration-history.mjs
node scripts/audit-supabase-migration-history.mjs --json
```

O script apenas lê arquivos locais e a captura versionada; não acessa rede, não executa SQL e não altera o Supabase. A opção `--strict` retorna código de erro se ainda houver versões divergentes (não ativada automaticamente na integração CI enquanto o débito histórico estiver aberto).

**Importante:** a captura é pontual. Para analisar futuras alterações, gerar nova captura de forma autenticada e **somente leitura**, revisando os dados antes de qualquer publicação. Fingerprints iguais são forte evidência de arquivo igual; **não** garantem que uma migração já registrada permanece aplicada integralmente no esquema atual.

## Plano de correção antes de qualquer merge de migrations

1. **Backup e aprovação.** Confirmar backup recuperável do banco e do histórico `supabase_migrations.schema_migrations`. Não apagar, refazer ou marcar entradas sem confirmação explícita.
2. **Versões divergentes, SQL idêntico (38).** Identificar pareamento unívoco; preparar apenas *renomeações de arquivos*, preservando exatamente cada byte SQL. Conferir integridade e cadeia temporal. Não executar os comandos outra vez.
3. **SQL remoto sem arquivo idêntico (45).** Recuperar os comandos existentes no histórico **para área de revisão restrita**, comparar Git history, identificar segredos, dados pessoais, DDL destrutivo e divergências. Não restaurar às cegas em repositório público.
4. **Arquivos locais não representados remotamente (70 versões; 32 sem SQL correspondente).** Determinar quais são anteriores à criação do projeto, foram aplicados sob outro identificador ou jamais foram executados. Não classificá-los automaticamente como pendentes/aplicados.
5. **Revalidar antes de implantar.** Usar `supabase migration list` com as versões corretas, revisão de SQL e verificação do esquema real. **Não** executar `db push` com o histórico ainda divergente, pois migrações antigas podem rodar de novo. A API e o deploy atual devem permanecer intactos.
6. **Repair do histórico, somente se indispensável.** O comando oficial `supabase migration repair` insere/remove **registros** de histórico; ele não verifica nem aplica o conteúdo da migração. Usar apenas depois da reconciliação, backup e aprovação específica, nunca em massa para fazer o check ficar verde.

Referência oficial: [Supabase CLI — Repair the migration history table](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## Situação atual

Este PR **não é a correção final do Supabase Preview**. Ele entrega diagnóstico verificável e procedimentos de segurança. O alerta da integração persistirá até que todas as versões conflitantes sejam reconciliadas com evidências e sem executar SQL histórico indevidamente. Nenhuma alteração financeira ou mudança em produção faz parte deste PR.
