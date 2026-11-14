// RE:DO 크롬 확장 — 옵션 화면: 로그인·로그아웃, 서비스 주소, 연결 확인, 메뉴 항목 켜기/끄기 (EX-1 명세 §5.4)
import { AuthError, SESSION_KEY, createAuth } from './auth.js';
import { SETTINGS_KEY, normalizeSettings } from './background.js';

const storage = chrome.storage.local;
// 로그인 창은 사용자 동작이 있는 이 화면에서 연다. 토큰 갱신은 서비스 워커만 한다.
const auth = createAuth({ storage, fetchImpl: (...a) => fetch(...a), identity: chrome.identity });

const $ = (id) => document.getElementById(id);
const accountState = $('account-state');
const accountStatus = $('account-status');
const signInBtn = $('sign-in');
const signOutBtn = $('sign-out');
const checkBtn = $('check');
const checkStatus = $('check-status');
const menuItem = $('menu-item');
const apiBaseInputs = [...document.querySelectorAll('input[name="api-base"]')];

function setStatus(el, text, tone = '') {
  el.textContent = text;
  el.dataset.tone = tone;
}

async function renderAccount() {
  const session = await auth.getSession();
  accountState.textContent = session ? `로그인됨: ${session.email || '(이메일 없음)'}` : '로그인하지 않았습니다.';
  signInBtn.hidden = Boolean(session);
  signOutBtn.hidden = !session;
}

async function readSettings() {
  return normalizeSettings((await storage.get(SETTINGS_KEY))[SETTINGS_KEY]);
}

async function renderSettings() {
  const settings = await readSettings();
  for (const input of apiBaseInputs) input.checked = input.value === settings.apiBase;
  menuItem.checked = settings.menuItem;
}

async function saveSettings(patch) {
  const next = normalizeSettings({ ...(await readSettings()), ...patch });
  await storage.set({ [SETTINGS_KEY]: next });
}

signInBtn.addEventListener('click', async () => {
  signInBtn.disabled = true;
  setStatus(accountStatus, '로그인 창을 여는 중…');
  try {
    await auth.signIn();
    setStatus(accountStatus, '로그인했습니다.', 'good');
  } catch (err) {
    setStatus(accountStatus, err instanceof AuthError ? err.message : '로그인하지 못했습니다.', 'bad');
  } finally {
    signInBtn.disabled = false;
    await renderAccount();
  }
});

signOutBtn.addEventListener('click', async () => {
  signOutBtn.disabled = true;
  try {
    await auth.signOut();
    setStatus(accountStatus, '로그아웃했습니다.');
  } finally {
    signOutBtn.disabled = false;
    await renderAccount();
  }
});

for (const input of apiBaseInputs) {
  input.addEventListener('change', async () => {
    if (!input.checked) return;
    await saveSettings({ apiBase: input.value });
    setStatus(checkStatus, '');
  });
}

menuItem.addEventListener('change', () => saveSettings({ menuItem: menuItem.checked }));

checkBtn.addEventListener('click', async () => {
  checkBtn.disabled = true;
  setStatus(checkStatus, '확인하는 중…');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CHECK_CONNECTION' });
    if (result) setStatus(checkStatus, result.message, result.ok ? 'good' : 'bad');
    else setStatus(checkStatus, '확인하지 못했습니다.', 'bad');
  } catch {
    setStatus(checkStatus, '확인하지 못했습니다.', 'bad');
  } finally {
    checkBtn.disabled = false;
    await renderAccount(); // 인증 호출이 401이면 서비스 워커가 세션을 지운다
  }
});

// 서비스 워커가 토큰을 갱신하거나 지우면 화면을 맞춘다
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[SESSION_KEY]) renderAccount();
  if (changes[SETTINGS_KEY]) renderSettings();
});

$('ext-origin').textContent = `chrome-extension://${chrome.runtime.id}`;
$('ext-redirect').textContent = chrome.identity.getRedirectURL();
renderAccount();
renderSettings();
