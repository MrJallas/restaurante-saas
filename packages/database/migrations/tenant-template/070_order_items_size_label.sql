-- Read-side enabler (P2 re-scan · KDS drink size): persistir o RÓTULO do
-- tamanho escolhido no line-item pra que a cozinha/bar preparem o tamanho
-- certo.
--
-- Contexto: o commit 38b99be fez o PREÇO do tamanho chegar (resolveSizePriceCents
-- lê menu_items.sizes e cobra o valor correto), mas o LABEL escolhido
-- (Peq/Méd/Grande) nunca era persistido — o KDS/_kds e a fila do /cozinha não
-- tinham o que renderizar. Esta coluna dá o destino do read-side; o KDS já a
-- seleciona (oi.size AS size) e o card renderiza um badge de tamanho.
--
-- Aditiva e NULLABLE: dados existentes seguem válidos; item sem tamanho fica
-- NULL (não altera nada). Latente até o seed popular menu_items.sizes e o
-- write-side gravar o label — o read-side já está ligado.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS size VARCHAR(60);
