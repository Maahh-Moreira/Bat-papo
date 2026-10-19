# BATPAPO — Direção visual e arquitetura técnica

## Estado do projeto analisado

- Aplicação multipágina estática: HTML + CSS + JavaScript ES Modules.
- 11 páginas HTML e um `js/app.js` central com renderização e eventos.
- Estilos separados em variáveis, base, componentes, layout, páginas e animações.
- Estado centralizado em `js/services/store.js`; persistência atual em `js/services/storage.js` com `localStorage`.
- Dados demonstrativos separados em `js/data/demo.js`.
- O login/cadastro atual usa `hashPassword()` próprio e `passwordHash` local. Isso serve somente para demonstração e deve ser removido da autenticação real.
- Fotos/anexos podem usar Data URL/Base64. Para uso real, migrar binários para Supabase Storage.

## Direção de marca proposta

**Conceito:** uma comunidade noturna acolhedora, expressiva e própria — não uma cópia de outro mensageiro.

- Fundo principal: `#0A0A0B`.
- Superfícies: `#151518`, `#1B1B1F` e `#232328`.
- Texto principal: `#ECECEF`; secundário: `#A1A1AA`.
- Cor de assinatura: violeta `#8B7CF6`, usada com moderação em ações primárias, estados ativos e foco.
- Tipografia: Inter; IBM Plex Mono apenas para identificadores técnicos como BAT-ID.
- Mascote de morcego usado como elemento de marca, sem competir com a legibilidade.
- Preservar temas alternativos existentes (midnight, vampire, lilac, neon e amoled), revisando contraste e estados de foco.

## Prioridades de UI

1. Criar tokens consistentes para cores, espaçamento, tipografia, raios e elevação.
2. Refinar navegação e estados ativos; manter ícones com rótulos acessíveis e dicas em navegação compacta.
3. Melhorar telas de login/cadastro: formulário claro, validação inline, estados de carregamento e mensagens de erro compreensíveis.
4. Priorizar a tela de mensagens: lista de conversas, cabeçalho, balões, composição, anexos, respostas, reações, estados vazios e responsividade.
5. Garantir `:focus-visible`, contraste adequado, respeito a `prefers-reduced-motion` e uso por teclado.
6. Não mudar de uma vez todos os layouts antes de registrar capturas e validar os fluxos atuais.

## Arquitetura alvo

- `Supabase Auth`: cadastro, login, sessão, confirmação de e-mail e recuperação de senha.
- `public.profiles`: somente dados públicos do perfil; nunca senhas ou hashes de senha.
- `PostgreSQL`: amizades, solicitações, conversas, participantes, mensagens, reações, grupos, notificações, preferências, bloqueios, figurinhas e conquistas.
- `Supabase Storage`: bucket `avatars` público apenas para imagens de perfil; `chat-attachments` privado, protegido por políticas de acesso.
- `RLS`: habilitado em todas as tabelas com regras por usuário/participante.
- `Realtime`: habilitar depois de validar políticas e consultas, inicialmente para mensagens e eventos de conversa.
- `localStorage`: somente preferências não sensíveis ou cache não autoritativo. Não usar como fonte real de usuários, permissões ou mensagens.

## Sequência de implementação

1. Criar projeto Supabase e configurar região, Auth e URLs de redirecionamento.
2. Executar a migração `supabase/migrations/202610190001_initial_schema.sql` no SQL Editor de um projeto novo.
3. Conferir tabelas, triggers, buckets e políticas no painel; executar testes com dois usuários distintos antes de publicar.
4. Criar configuração pública do cliente Supabase sem incluir chaves secret/service-role no frontend.
5. Introduzir `js/services/supabase-client.js` e uma camada de repositórios; não substituir chamadas do `store.js` em massa.
6. Migrar primeiro cadastro/login e perfil; depois amizades, conversas, mensagens, grupos, notificações e figurinhas.
7. Migrar imagens para Storage; salvar no banco apenas caminhos de arquivo e metadados necessários.
8. Fazer testes de autorização negativos: usuário A não pode ler mensagens, anexos, notificações ou configurações exclusivas do usuário B.
9. Só então ligar Realtime e publicar.

## Atenções antes de produção

- A migração SQL é uma base inicial, não uma aplicação pronta. Os fluxos de aceitação de amizade, convite de membros, criação confiável de notificações e concessão de conquistas precisam de RPCs/triggers revisados antes de ligar essas funções na UI.
- A política de leitura de perfis permite que usuários autenticados leiam perfis públicos. Se isso não for desejado, reduzir a política.
- O identificador `username` criado pelo trigger recebe sufixo curto para reduzir colisões; a interface deverá permitir a escolha/edição validada de username em fluxo separado, se desejado.
- A política de anexos pressupõe o caminho `conversation_id/arquivo`; o cliente precisa seguir esse formato.
- Nunca usar `service_role` no navegador. A chave publicável/anon não substitui RLS.
- Não reutilizar os usuários demo como contas reais. Dados demonstrativos devem ser inseridos apenas em ambiente de desenvolvimento.

## Inventário funcional do store atual

Autenticação demo, perfil, solicitação/aceitação/recusa de amizade, criação/obtenção de DM, mensagens, leitura, reações, edição/exclusão, rascunhos, grupos/canais, notificações, temas, busca de usuários, figurinhas e conquistas. Cada função deve ser mapeada para operações persistentes e políticas antes da migração.
