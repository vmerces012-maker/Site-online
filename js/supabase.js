// Integração com o Supabase: autenticação por e-mail/senha e dados do perfil.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = await loadEnv();

async function loadEnv() {
  try {
    const res = await fetch('.env');
    if (res.ok) return parseEnv(await res.text());
  } catch { /* ambiente sem .env acessível */ }
  return {
    VITE_SUPABASE_URL: import.meta.env?.VITE_SUPABASE_URL ?? '',
    VITE_SUPABASE_ANON_KEY: import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '',
  };
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

export const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) throw error;
  return data;
}

export async function resetPassword(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Perfil do usuário autenticado (criado automaticamente no cadastro por trigger).
export async function fetchProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, coins')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCoins(coins) {
  const { error } = await supabase
    .from('profiles')
    .update({ coins })
    .eq('id', (await getSession()).user.id);
  if (error) throw error;
}

export async function fetchTransactions(limit = 12) {
  const { data, error } = await supabase
    .from('coin_transactions')
    .select('id, delta, reason, game, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function insertTransaction(delta, reason, game = null) {
  const { error } = await supabase
    .from('coin_transactions')
    .insert({ delta, reason, game });
  if (error) throw error;
}
