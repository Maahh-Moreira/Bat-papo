-- ATENÇÃO: ação destrutiva e irreversível.
-- Apaga TODOS os grupos e as mensagens/membros associados a eles.
-- Não apaga contas de usuários nem conversas privadas.
-- Execute somente se realmente quiser começar o teste do zero.
BEGIN;

CREATE TEMP TABLE _batpapo_group_conversations ON COMMIT DROP AS
SELECT conversation_id FROM public.groups WHERE conversation_id IS NOT NULL;

DELETE FROM public.messages
WHERE conversation_id IN (SELECT conversation_id FROM _batpapo_group_conversations);

DELETE FROM public.conversation_members
WHERE conversation_id IN (SELECT conversation_id FROM _batpapo_group_conversations);

DELETE FROM public.groups;

DELETE FROM public.conversations
WHERE id IN (SELECT conversation_id FROM _batpapo_group_conversations);

COMMIT;

NOTIFY pgrst, 'reload schema';
