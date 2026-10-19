# BATPAPO — Seu papo. Sua toca. Sua galera.

Aplicação multipágina em HTML, CSS e JavaScript ES Modules, preparada para hospedagem estática (GitHub Pages).

## Integração Supabase incluída nesta versão

- Cliente Supabase configurado em `js/services/supabase.js` usando a URL do projeto e a chave `sb_publishable` fornecidas.
- Cadastro e login usam Supabase Auth; senhas não são armazenadas no `localStorage` nem na tabela de perfis.
- Sessão persistente e recuperação do perfil em `public.profiles`.
- Atualização dos campos de perfil compatíveis com o esquema SQL e gravação da preferência de tema em `public.user_settings`.
- O app não cria mais usuários fictícios automaticamente nem usa o estado de demonstração como autenticação.

## Antes de testar

1. No painel Supabase, confirme que executou `supabase/migrations/202610190001_initial_schema.sql` no projeto correto e que as tabelas, políticas RLS e o trigger `on_auth_user_created` foram criados.
2. Em **Authentication → URL Configuration**, inclua o domínio do site publicado em **Site URL** e **Redirect URLs**. Durante desenvolvimento, adicione também a URL local utilizada pelo servidor (por exemplo, Live Server).
3. Em **Authentication → Providers → Email**, confira se a confirmação por e-mail está como você deseja. Se estiver habilitada, o usuário precisa confirmar o endereço antes de entrar.
4. Abra o site por HTTP/HTTPS (GitHub Pages ou Live Server), nunca por `file://`.
5. Teste cadastro com um e-mail seu e, depois, login. Confira se o usuário aparece em **Authentication → Users** e se o perfil foi criado em **Table Editor → profiles**.

## Limitações ainda existentes — não publicar como produto pronto

Esta é uma primeira etapa real de integração, não a migração completa do aplicativo. As telas de amizade, conversas, mensagens, grupos, notificações, figurinhas e anexos ainda precisam ser ligadas às tabelas/RPCs do Supabase. Parte dessas ações ainda opera apenas no estado em memória e não é compartilhada entre navegadores/usuários. Upload de avatar/banner para Storage e login por BAT-ID/username também ainda não estão concluídos. A migração SQL documenta que operações de amizade e participação em grupos/conversas precisam de RPCs transacionais e testes de segurança.

Nunca coloque uma chave `service_role` no frontend. Mantenha RLS ativada e teste as políticas com contas distintas antes de liberar o site publicamente.

### Gerenciamento de grupos

Para habilitar a exclusão de grupos pelo proprietário, execute o arquivo `supabase/migrations/202610190005_group_management.sql` no SQL Editor do projeto Supabase. A inclusão de membros usa a função `add_group_member` definida na migração `202610190002_group_members_rpc.sql`; confirme que essa migração já foi executada.

No grupo, abra **Configurações do grupo** para alterar nome e descrição, adicionar uma pessoa pelo BAT-ID ou excluir o grupo. A exclusão é permanente e remove também a conversa, mensagens e membros associados.
