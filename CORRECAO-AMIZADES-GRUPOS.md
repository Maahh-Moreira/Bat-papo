# Correção de amigos e membros de grupos — BATPAPO

## O que foi corrigido
- A busca de amigos não depende mais de perfis que já estejam carregados na memória do navegador.
- Solicitações de amizade, aceite/recusa e amizades passam a ser gravadas no Supabase.
- A lista de amigos e solicitações é carregada ao abrir o app e ao entrar na conta.
- A função de adicionar membro ao grupo compara BAT-IDs ignorando maiúsculas/minúsculas e espaços e evita conflito de nomes de colunas no retorno.

## Passo obrigatório no Supabase
1. Abra o projeto Supabase usado pelo BATPAPO.
2. Entre em **SQL Editor** e crie uma nova consulta.
3. Abra `supabase/migrations/202610190007_fix_friend_requests_and_group_member.sql` neste pacote.
4. Copie o arquivo inteiro para o SQL Editor e execute.
5. Aguarde a confirmação de execução sem erros.

Depois, publique os arquivos do projeto no GitHub Pages. Não é necessário alterar a chave pública do Supabase.

## Observação
A migração não apaga usuários, solicitações, amizades, grupos ou mensagens. As funções novas validam a sessão autenticada e limitam o aceite/recusa ao destinatário da solicitação.
