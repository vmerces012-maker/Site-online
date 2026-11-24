/*
# Criar tabela de perfis com saldo de fichas virtuais

1. Nova tabela: `profiles`
- `id` (uuid, chave primária, referencia auth.users; o id é sempre igual ao id do usuário autenticado)
- `username` (text, nome de exibição do usuário, não nulo)
- `coins` (bigint, saldo de fichas VIRTUAIS do portal, valor inicial 1000; não representa dinheiro real)
- `created_at` (timestamptz, data de criação do perfil)

2. Segurança
- RLS habilitado em `profiles`.
- Políticas para `authenticated` apenas: cada usuário pode ver e atualizar SOMENTE o próprio perfil (ownership por auth.uid() = id).
- INSERT do perfil tratado por trigger `on_auth_user_created` (SECURITY DEFINER, search_path fixado), que roda no contexto do serviço ao criar o usuário em auth.users; EXECUTE revogado de PUBLIC e anon.
- Grants: SELECT e UPDATE (colunas username, coins) para authenticated. DELETE/INSERT não concedidos via Data API. UPDATE de coins permitido apenas na própria linha; a coluna coins é incrementada pelo próprio dono no fluxo do jogo (fichas virtuais, sem valor monetário).
- service_role não concedido (não há edge function acessando esta tabela).

3. Observações importantes
- Fichas são virtuais e sem valor monetário; não há processamento de pagamentos neste schema.
- O trigger é idempotente (cria perfil apenas se não existir).
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  coins bigint NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (username, coins) ON profiles TO authenticated;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();