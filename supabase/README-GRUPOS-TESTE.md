# Imagem e teste de grupos

1. No Supabase, abra **SQL Editor** e execute `migrations/202610190006_group_icon_persistence.sql`.
2. Publique os arquivos atualizados do site.
3. Abra um grupo seu → **Gerenciar grupo** → **Escolher imagem**. A prévia deve aparecer antes de salvar. Clique em **Salvar**.
4. Atualize a página. A imagem deve continuar visível.

## Limpar grupos para testar do zero

O arquivo `LIMPAR_TODOS_OS_GRUPOS.sql` apaga todos os grupos, as mensagens desses grupos e suas associações de membros. Ele não apaga contas nem conversas privadas. A operação é irreversível. Revise o script e execute manualmente no SQL Editor somente se tiver certeza.

A imagem usa o bucket público `avatars`, em uma pasta com o ID do proprietário. A política de Storage precisa permitir que o usuário autenticado envie arquivos para a própria pasta, como já ocorre com as imagens de perfil.
