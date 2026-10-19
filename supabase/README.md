# Supabase do BATPAPO

## Antes de executar
- Use apenas no projeto de desenvolvimento recém-criado e ainda vazio.
- Confira se o projeto correto está selecionado no painel.
- A migração cria tabelas, triggers, políticas RLS e buckets. Revise o SQL antes de executar.
- Execute uma única vez no SQL Editor; não repita a migração inteira se ocorrer erro parcial. Corrija o erro ou recrie o projeto de desenvolvimento vazio antes de tentar novamente.

## Aplicação
1. Abra **SQL Editor** no painel do Supabase.
2. Crie uma consulta nova.
3. Cole o conteúdo de `migrations/202610190001_initial_schema.sql`.
4. Execute somente depois de confirmar que o projeto está vazio e correto.
5. Confira as tabelas, funções, políticas em Database e buckets em Storage.

## Ainda não conecta o frontend
Esta migração é apenas a base de dados. Os fluxos de negócio de aceitar amizade, criar conversas e adicionar participantes precisam de RPCs transacionais e testes adicionais antes da integração do frontend. Não coloque `service_role` ou segredos no navegador.

## Atualização de grupos e membros

Depois de executar `migrations/202610190001_initial_schema.sql`, execute também `migrations/202610190002_group_members_rpc.sql` no SQL Editor do Supabase. Essa segunda migração habilita a adição segura de membros a grupos por BAT-ID, somente pelo dono ou administrador autorizado.

O frontend usa uma conversa do tipo `group` como canal `#geral` por enquanto. A lista de membros e as mensagens de texto do canal são carregadas do banco Supabase.


## Badge de desenvolvedora original

Execute também `migrations/202610190003_original_developers.sql` no SQL Editor.
Essa migração registra a conta `tapiocah` (UUID confirmado pela proprietária) na tabela
`original_developers`. O frontend consulta essa tabela ao abrir um perfil; o selo `</>`
aparece apenas no cartão do perfil. Usuários comuns podem consultar a lista para renderizar
o selo, mas não têm políticas de escrita para se adicionar/remover. Faça alterações nessa
lista apenas pelo SQL Editor administrativo.


## Correção da criação de grupos e selo de desenvolvedora (2026-10-19)

Execute `migrations/202610190004_group_creation_and_badge_fix.sql` no SQL Editor do projeto Supabase já utilizado pelo BATPAPO. Essa migração cria a RPC transacional `create_group`, concede leitura autenticada do cadastro de selos, registra a conta oficial e solicita atualização do cache da API. Não execute novamente a migração inicial 001 em um projeto já configurado.
