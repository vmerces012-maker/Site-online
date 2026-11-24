// Lógica da interface: entrada, painel e jogo de slot demo (fichas virtuais).
import {
  supabase,
  getSession,
  signIn,
  signUp,
  resetPassword,
  signOut,
  fetchProfile,
  saveCoins,
  fetchTransactions,
  insertTransaction,
} from './supabase.js';
import { ADD_BALANCE_URL, ADD_BALANCE_ENABLED } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n ?? 0).toLocaleString('pt-BR');

/* ============================================================
   TELA DE ENTRADA
   ============================================================ */
const authScreen = $('auth-screen');
const appScreen = $('app-screen');
const feedback = $('auth-feedback');

function showFeedback(message, kind = 'ok') {
  feedback.textContent = message;
  feedback.className = `auth-feedback ${kind}`;
}

function switchTab(tab) {
  $('form-login').classList.toggle('is-hidden', tab !== 'login');
  $('form-signup').classList.toggle('is-hidden', tab !== 'signup');
  $('form-recover').classList.toggle('is-hidden', tab !== 'recover');
  $('tab-login').classList.toggle('is-active', tab === 'login');
  $('tab-signup').classList.toggle('is-active', tab === 'signup');
  feedback.textContent = '';
}

$('tab-login').addEventListener('click', () => switchTab('login'));
$('tab-signup').addEventListener('click', () => switchTab('signup'));
$('open-recover').addEventListener('click', () => switchTab('recover'));
$('back-to-login').addEventListener('click', () => switchTab('login'));

function setBusy(button, busy) {
  button.disabled = busy;
  button.dataset.label = button.dataset.label ?? button.textContent;
  button.textContent = busy ? 'Aguarde…' : button.dataset.label;
}

$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-login');
  setBusy(btn, true);
  try {
    await signIn($('login-email').value.trim(), $('login-password').value);
  } catch (err) {
    showFeedback(friendlyAuthError(err), 'err');
  } finally {
    setBusy(btn, false);
  }
});

$('form-signup').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-signup');
  setBusy(btn, true);
  try {
    await signUp(
      $('signup-email').value.trim(),
      $('signup-password').value,
      $('signup-username').value.trim()
    );
    showFeedback('Conta criada! Você já está dentro do portal.', 'ok');
  } catch (err) {
    showFeedback(friendlyAuthError(err), 'err');
  } finally {
    setBusy(btn, false);
  }
});

$('form-recover').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('btn-recover');
  setBusy(btn, true);
  try {
    await resetPassword($('recover-email').value.trim());
    showFeedback('Enviamos um link de recuperação para o seu e-mail.', 'ok');
  } catch (err) {
    showFeedback(friendlyAuthError(err), 'err');
  } finally {
    setBusy(btn, false);
  }
});

function friendlyAuthError(err) {
  const msg = err?.message ?? 'Algo deu errado. Tente novamente.';
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/already registered|already exists/i.test(msg)) return 'Este e-mail já tem uma conta. Tente entrar.';
  if (/password/i.test(msg) && /at least|weak|short/i.test(msg)) return 'Use uma senha com pelo menos 8 caracteres.';
  if (/rate limit/i.test(msg)) return 'Muitas tentativas seguidas. Aguarde um momento.';
  if (/valid email/i.test(msg)) return 'Informe um e-mail válido.';
  return msg;
}

$('btn-logout').addEventListener('click', async () => {
  try {
    await signOut();
  } finally {
    enterAuthView();
  }
});

/* ============================================================
   PAINEL PRINCIPAL
   ============================================================ */
let profile = null;
let stats = { plays: 0, best: 0 };

async function enterAppView() {
  try {
    const session = await getSession();
    if (!session) return false;

    profile = await fetchProfile();
    if (!profile) {
      // Usuário existente sem perfil (cadastro anterior ao trigger): cria agora.
      profile = {
        id: session.user.id,
        username:
          session.user.user_metadata?.username ??
          session.user.email.split('@')[0],
        coins: 1000,
      };
      await supabase.from('profiles').insert(profile);
    }

    $('user-name').textContent = profile.username;
    $('user-email').textContent = session.user.email ?? '';
    updateWallet(profile.coins);

    await loadHistory();
    authScreen.classList.add('is-hidden');
    appScreen.classList.remove('is-hidden');
    return true;
  } catch (err) {
    showFeedback(friendlyAuthError(err), 'err');
    return false;
  }
}

function enterAuthView() {
  appScreen.classList.add('is-hidden');
  authScreen.classList.remove('is-hidden');
  showFeedback('Você saiu da sua conta. Até logo!', 'ok');
}

function updateWallet(coins) {
  $('wallet-amount').textContent = fmt(coins);
  $('stat-coins').textContent = fmt(coins);
}

async function loadHistory() {
  try {
    const rows = await fetchTransactions();
    const list = $('history-list');
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<li class="history-empty" id="history-empty">Nenhuma movimentação ainda. Jogue para começar!</li>';
      return;
    }
    let plays = 0;
    let best = 0;
    for (const row of rows) {
      if (row.reason === 'game_win' || row.reason === 'game_loss') plays += 1;
      if (row.delta > 0 && row.delta > best) best = row.delta;
      list.appendChild(historyItem(row));
    }
    stats = { plays, best };
    $('stat-plays').textContent = fmt(plays);
    $('stat-best').textContent = fmt(best);
  } catch {
    // Histórico é secundário: falha não deve quebrar o painel.
  }
}

function historyItem(row) {
  const li = document.createElement('li');
  li.className = 'history-item';

  const left = document.createElement('div');
  left.className = 'history-left';
  const title = document.createElement('span');
  title.className = 'history-title';
  title.textContent = describeTransaction(row);
  const time = document.createElement('span');
  time.className = 'history-time';
  time.textContent = new Date(row.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  left.append(title, time);

  const delta = document.createElement('span');
  delta.className = `history-delta ${row.delta >= 0 ? 'pos' : 'neg'}`;
  delta.textContent = `${row.delta >= 0 ? '+' : ''}${fmt(row.delta)} fichas`;

  li.append(left, delta);
  return li;
}

function describeTransaction(row) {
  if (row.reason === 'signup_bonus') return 'Bônus de boas-vindas';
  if (row.reason === 'game_win') return `Vitória em ${row.game ?? 'jogo'}`;
  if (row.reason === 'game_loss') return `Rodada em ${row.game ?? 'jogo'}`;
  if (row.reason === 'bonus') return 'Fichas de cortesia';
  return 'Movimentação de fichas';
}

/* ============================================================
   JOGOS
   ============================================================ */
const GAMES = [
  { id: 'forest-fruits', name: 'Frutas da Floresta', icon: '🍒', tag: 'Slot demo' },
  { id: 'emerald-tiger', name: 'Tigre Esmeralda', icon: '🐅', tag: 'Slot demo' },
  { id: 'jade-dragon', name: 'Dragão de Jade', icon: '🐉', tag: 'Slot demo' },
  { id: 'golden-frog', name: 'Sapo Dourado', icon: '🐸', tag: 'Slot demo' },
  { id: 'leaf-luck', name: 'Sorte das Folhas', icon: '🍀', tag: 'Slot demo' },
  { id: 'river-pearl', name: 'Pérola do Rio', icon: '🫧', tag: 'Slot demo' },
];

const grid = $('games-grid');
for (const game of GAMES) {
  const card = document.createElement('button');
  card.className = 'game-card';
  card.type = 'button';
  card.dataset.game = game.id;

  const visual = document.createElement('div');
  visual.className = 'game-visual';
  visual.textContent = game.icon;

  const info = document.createElement('div');
  info.className = 'game-info';
  const name = document.createElement('div');
  name.className = 'game-name';
  name.textContent = game.name;
  const meta = document.createElement('div');
  meta.className = 'game-meta';
  meta.textContent = `${game.tag} · fichas virtuais`;
  info.append(name, meta);

  card.append(visual, info);
  card.addEventListener('click', () => openGame(game));
  grid.appendChild(card);
}

/* ============================================================
   MODAL DO JOGO (SLOT DEMO)
   ============================================================ */
const SYMBOLS = ['🍒', '🍋', '🔔', '🍀', '💎', '⭐'];
let currentBet = 10;
let spinning = false;

function openGame(game) {
  $('game-modal-title').textContent = game.name;
  $('game-modal-note').textContent =
    `${game.name} é uma demonstração com fichas virtuais, sem valor monetário.`;
  $('slot-result').textContent = '';
  $('slot-result').className = 'slot-result';
  openModal('game-modal');
}

document.querySelectorAll('.bet-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.bet-chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    currentBet = Number(chip.dataset.bet);
    $('btn-spin').textContent = `Girar (${currentBet} fichas)`;
  });
});

$('btn-spin').addEventListener('click', spin);

async function spin() {
  if (spinning) return;
  if (!profile) return;

  if (profile.coins < currentBet) {
    const result = $('slot-result');
    result.textContent = 'Fichas insuficientes. Adicione mais fichas para continuar.';
    result.className = 'slot-result err';
    return;
  }

  spinning = true;
  $('btn-spin').disabled = true;
  const reels = [$('reel-0'), $('reel-1'), $('reel-2')];
  reels.forEach((reel) => reel.classList.add('spinning'));

  const roll = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const final = [roll(), roll(), roll()];

  const tick = setInterval(() => {
    reels.forEach((reel) => (reel.textContent = roll()));
  }, 90);

  // Espera curta para o efeito de giro.
  await new Promise((r) => setTimeout(r, 1100));

  clearInterval(tick);
  reels.forEach((reel, i) => {
    reel.classList.remove('spinning');
    reel.textContent = final[i];
  });

  resolveRound(final);
  spinning = false;
  $('btn-spin').disabled = false;
}

function resolveRound(final) {
  const result = $('slot-result');
  const [a, b, c] = final;
  const allSame = a === b && b === c;
  const anyPair = !allSame && (a === b || a === c || b === c);

  let delta;
  if (allSame) {
    delta = currentBet * 10;
    result.textContent = `Trinca! Você ganhou ${fmt(delta)} fichas!`;
    result.className = 'slot-result win';
  } else if (anyPair) {
    delta = currentBet * 2;
    result.textContent = `Par! Você ganhou ${fmt(delta)} fichas.`;
    result.className = 'slot-result win';
  } else {
    delta = -currentBet;
    result.textContent = 'Não foi desta vez. Tente outra rodada!';
    result.className = 'slot-result lose';
  }

  applyResult(delta);
}

async function applyResult(delta) {
  profile.coins = Math.max(0, profile.coins + delta);
  updateWallet(profile.coins);

  try {
    await saveCoins(profile.coins);
    await insertTransaction(delta, delta >= 0 ? 'game_win' : 'game_loss', $('game-modal-title').textContent);
    await loadHistory();
  } catch (err) {
    const result = $('slot-result');
    result.textContent = 'Não foi possível registrar a rodada. Verifique sua conexão.';
    result.className = 'slot-result err';
    // Reverte o saldo local para o valor salvo no banco.
    try {
      const fresh = await fetchProfile();
      if (fresh) {
        profile = fresh;
        updateWallet(profile.coins);
      }
    } catch { /* mantém o valor local */ }
  }
}

/* ============================================================
   MODAL: ADICIONAR FICHAS
   ============================================================ */
$('btn-add-coins').addEventListener('click', () => {
  const available = $('coins-available');
  const unavailable = $('coins-unavailable');
  if (ADD_BALANCE_ENABLED) {
    available.classList.remove('is-hidden');
    unavailable.classList.add('is-hidden');
    $('btn-add-coins-link').href = ADD_BALANCE_URL;
  } else {
    available.classList.add('is-hidden');
    unavailable.classList.remove('is-hidden');
  }
  openModal('coins-modal');
});

/* ============================================================
   NAVEGAÇÃO INFERIOR
   ============================================================ */
document.querySelectorAll('.bottomnav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.bottomnav-item').forEach((i) => {
      i.classList.remove('is-active');
      i.removeAttribute('aria-current');
    });
    item.classList.add('is-active');
    item.setAttribute('aria-current', 'true');

    const view = item.dataset.view;
    document.querySelector('.welcome').classList.toggle('is-hidden', view !== 'home');
    document.querySelector('.stats').classList.toggle('is-hidden', view !== 'home');
    document.querySelector('[aria-labelledby="games-heading"]').classList
      .toggle('is-hidden', view !== 'home' && view !== 'games');
    document.querySelector('[aria-labelledby="history-heading"]').classList
      .toggle('is-hidden', view !== 'home' && view !== 'history');

    if (view === 'account') showAccountSummary();
  });
});

function showAccountSummary() {
  const accountCard = document.querySelector('.welcome');
  accountCard.classList.remove('is-hidden');
  $('user-name').textContent = profile?.username ?? 'jogador';
}

/* ============================================================
   MODAIS: fechar
   ============================================================ */
function openModal(id) {
  $(id).classList.remove('is-hidden');
}
document.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', () => {
    el.closest('.modal').classList.add('is-hidden');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('is-hidden'));
  }
});

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
supabase.auth.onAuthStateChange((event, session) => {
  (async () => {
    if (event === 'SIGNED_IN' && session) await enterAppView();
    if (event === 'SIGNED_OUT') enterAuthView();
  })();
});

(async () => {
  const hasSession = await enterAppView();
  if (!hasSession) enterAuthView();
})();
