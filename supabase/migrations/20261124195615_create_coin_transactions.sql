/*
# Criar tabela de histórico de fichas virtuais

1. Nova tabela: `coin_transactions`
- `id` (uuid, chave primária)
- `user_id` (uuid, dono do registro, referencia auth.users; default auth.uid())
- `delta` (bigint, variação de fichas: positivo = ganhou, negativo = gastou/perdeu)
- `reason` (text, descrição curta: 'game_win', 'game_loss', 'game_bet', 'signup_bonus')
- `game` (text, nome do jogo que gerou a movimentação; nulo para bônus)
- `created_at` (timestamptz)

2. Segurança
- RLS habilitado. Políticas escopadas a `authenticated` com ownership auth.uid() = user_id.
- Grants: SELECT e INSERT para authenticated (o app registra as jogadas do próprio usuário). Sem UPDATE/DELETE: o histórico é imutável para o usuário.
- user_id tem DEFAULT auth.uid() para inserts do cliente sem precisar passar o campo.
- service_role não concedido.

3. Observações
- Registros apenas de fichas virtuais, sem valor monetário.
- Índice em (user_id, created_at DESC) para listar o histórico do usuário.
*/

CREATE TABLE IF NOT EXISTS coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  delta bigint NOT NULL,
  reason text NOT NULL,
  game text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coin_tx_user_recent
ON coin_transactions (user_id, created_at DESC);

ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON coin_transactions TO authenticated;

DROP POLICY IF EXISTS "Users can view own transactions" ON coin_transactions;
CREATE POLICY "Users can view own transactions"
ON coin_transactions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON coin_transactions;
CREATE POLICY "Users can insert own transactions"
ON coin_transactions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);