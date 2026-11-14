// RE:DO 크롬 확장 — 유튜브 화면 쪽: 화면 판별, 곡 추가 버튼·메뉴 항목, 알림 (EX-1 명세 §5.2~§5.3)
// 토큰은 다루지 않는다. "이 videoId 추가"만 서비스 워커에 요청한다.
'use strict';

// 유튜브 화면 구조에 기대는 선택자는 여기 한 곳에 모은다(V3, 2026-11-14 실제 화면 확인).
// 카드·메뉴가 두 가지 구조로 섞여 있다: 구형(ytd-*-renderer + ytd-menu-popup-renderer)과
// 신형(yt-lockup-view-model + yt-list-view-model). 찾지 못하면 아무것도 하지 않는다(우클릭 메뉴가 남는다).
const REDO_SEL = {
  card: 'yt-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer',
  menuButton: 'ytd-menu-renderer button, .ytLockupMetadataViewModelMenuButton button',
  watchLink: 'a[href*="/watch?v="]',
  popupContainer: 'ytd-popup-container',
  popupDropdown: 'ytd-popup-container > tp-yt-iron-dropdown',
  menuListLegacy: 'ytd-menu-popup-renderer #items',
  menuListModern: 'yt-list-view-model[role="menu"]',
  menuRowLegacy: 'tp-yt-paper-item',
  menuRowModern: 'yt-list-item-view-model',
  adShowing: '#movie_player.ad-showing',
};

const REDO_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
/** 메뉴 버튼을 누른 뒤 이 시간 안에 열린 팝업에만 항목을 넣는다(다른 팝업에 잘못 넣지 않기 위해) */
const REDO_MENU_BIND_MS = 1500;
const REDO_TOAST_MS = 3000;

/** 목록 카드의 링크에서 videoId를 꺼낸다. 재생목록·믹스(list=)와 watch가 아닌 링크는 null. */
function redoVideoIdFromCardHref(href, base) {
  let url;
  try {
    url = new URL(String(href || ''), base || 'https://www.youtube.com');
  } catch {
    return null;
  }
  if (url.hostname !== 'www.youtube.com' || url.pathname !== '/watch') return null;
  if (url.searchParams.has('list')) return null;
  const id = url.searchParams.get('v');
  return id && REDO_VIDEO_ID_RE.test(id) ? id : null;
}

/** 지금 주소가 영상 재생 화면이면 그 videoId, 아니면 null */
function redoWatchVideoId(href) {
  let url;
  try {
    url = new URL(String(href || ''));
  } catch {
    return null;
  }
  if (url.pathname !== '/watch') return null;
  const id = url.searchParams.get('v');
  return id && REDO_VIDEO_ID_RE.test(id) ? id : null;
}

function redoInit() {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let menuItemEnabled = true;

  // ── 서비스 워커 호출 ──
  // 확장을 다시 불러오면 이 페이지의 연결이 끊긴다. 그때는 null을 돌려주고 새로고침을 안내한다.
  async function ask(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return null;
    }
  }
  const RELOAD_RESULT = { kind: 'error', message: '확장 프로그램이 갱신되었습니다. 페이지를 새로고침해 주세요' };

  function logoIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('redo-logo');
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', '200');
    rect.setAttribute('height', '200');
    rect.setAttribute('fill', '#1d1d1f');
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('fill', '#f6f6f1');
    g.setAttribute('fill-rule', 'evenodd');
    g.setAttribute('transform', 'translate(40 50)');
    const r = document.createElementNS(SVG_NS, 'path');
    r.setAttribute(
      'd',
      'M0 0H50C70 0 82 13 82 30C82 44 74 53 63 57L84 100H55L37 62H26V100H0Z M26 24H48C54 24 57 27 57 32C57 36 54 38 48 38H26Z'
    );
    g.appendChild(r);
    for (const y of ['14', '62']) {
      const dot = document.createElementNS(SVG_NS, 'rect');
      dot.setAttribute('x', '96');
      dot.setAttribute('y', y);
      dot.setAttribute('width', '24');
      dot.setAttribute('height', '24');
      g.appendChild(dot);
    }
    svg.append(rect, g);
    return svg;
  }

  // ── 알림 (화면 우측 하단, 3초) ──
  let toastEl = null;
  let toastTimer = 0;
  function showToast(result) {
    const r = result || RELOAD_RESULT;
    if (toastEl) toastEl.remove();
    clearTimeout(toastTimer);
    const el = document.createElement('div');
    el.className = 'redo-toast';
    el.setAttribute('role', 'status');
    el.dataset.redoKind = r.kind || 'error';
    const text = document.createElement('span');
    text.className = 'redo-toast__text';
    text.textContent = r.message || '추가하지 못했습니다';
    el.append(logoIcon(), text);
    if (r.action === 'open' && r.openUrl) {
      const link = document.createElement('a');
      link.className = 'redo-toast__action';
      link.href = r.openUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '열기';
      el.appendChild(link);
    } else if (r.action === 'login') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'redo-toast__action';
      btn.textContent = '로그인';
      btn.addEventListener('click', () => ask({ type: 'OPEN_OPTIONS' }));
      el.appendChild(btn);
    }
    document.body.appendChild(el);
    toastEl = el;
    const hide = () => {
      if (toastEl === el) toastEl = null;
      el.remove();
    };
    const arm = () => {
      toastTimer = setTimeout(hide, REDO_TOAST_MS);
    };
    // 버튼을 누르려고 올려 둔 동안에는 사라지지 않는다
    el.addEventListener('mouseenter', () => clearTimeout(toastTimer));
    el.addEventListener('mouseleave', arm);
    arm();
  }

  async function addSong(videoId) {
    const result = await ask({ type: 'ADD_SONG', videoId });
    showToast(result);
    return result;
  }

  // ── ③ 재생 화면 버튼 ──
  let watchBtn = null;
  let watchVideoId = null;
  let watchOpenUrl = null;

  function setWatchState(state) {
    if (!watchBtn) return;
    watchBtn.dataset.redoState = state;
    watchBtn.disabled = state === 'busy';
    watchBtn.querySelector('.redo-watch-btn__label').textContent =
      state === 'exists' ? 'RE:DO에 있음' : state === 'busy' ? '추가하는 중…' : 'RE:DO에 추가';
    watchBtn.title = state === 'exists' ? 'RE:DO 연습 화면 열기' : '이 영상을 RE:DO 연습곡으로 추가';
  }

  function ensureWatchBtn() {
    if (watchBtn) return;
    watchBtn = document.createElement('button');
    watchBtn.type = 'button';
    watchBtn.className = 'redo-watch-btn';
    const label = document.createElement('span');
    label.className = 'redo-watch-btn__label';
    watchBtn.append(logoIcon(), label);
    watchBtn.addEventListener('click', async () => {
      const videoId = watchVideoId;
      if (!videoId) return;
      if (watchBtn.dataset.redoState === 'exists' && watchOpenUrl) {
        window.open(watchOpenUrl, '_blank', 'noopener');
        return;
      }
      setWatchState('busy');
      const result = await addSong(videoId);
      if (videoId !== watchVideoId) return; // 그 사이 다른 영상으로 넘어갔다
      if (result && (result.kind === 'added' || result.kind === 'exists')) {
        watchOpenUrl = result.openUrl || null;
        setWatchState('exists');
      } else {
        setWatchState('idle');
      }
    });
    document.body.appendChild(watchBtn);
  }

  async function syncWatchButton() {
    const videoId = redoWatchVideoId(location.href);
    if (!videoId) {
      watchVideoId = null;
      watchOpenUrl = null;
      if (watchBtn) {
        watchBtn.remove();
        watchBtn = null;
      }
      return;
    }
    if (videoId === watchVideoId && watchBtn) return;
    watchVideoId = videoId;
    watchOpenUrl = null;
    ensureWatchBtn();
    setWatchState('idle');
    const found = await ask({ type: 'LOOKUP_SONG', videoId });
    if (videoId !== watchVideoId) return; // 늦게 온 응답은 버린다
    if (found && found.state === 'exists') {
      watchOpenUrl = found.openUrl || null;
      setWatchState('exists');
    }
  }

  // ── ② 점 3개 메뉴 항목 ──
  /** @type {{ videoId: string, at: number, bound: boolean, dropdown?: Element } | null} */
  let pendingMenu = null;
  let popupObserver = null;
  let popupCheckQueued = false;

  function removeMenuItems() {
    for (const el of document.querySelectorAll('[data-redo-item]')) el.remove();
  }

  function openDropdown() {
    for (const dd of document.querySelectorAll(REDO_SEL.popupDropdown)) {
      if (dd.getAttribute('aria-hidden') === 'true') continue;
      if (getComputedStyle(dd).display === 'none') continue;
      return dd;
    }
    return null;
  }

  function closeMenu() {
    // 유튜브 팝업은 바깥을 누르거나 Esc를 누르면 닫힌다
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    document.body.click();
  }

  function buildMenuItem(list, modern, videoId) {
    const item = document.createElement('div');
    item.dataset.redoItem = '1';
    item.className = modern ? 'redo-menu-item redo-menu-item--modern' : 'redo-menu-item redo-menu-item--legacy';
    item.setAttribute('role', 'menuitem');
    item.tabIndex = 0;
    const label = document.createElement('span');
    label.className = 'redo-menu-item__label';
    label.textContent = 'RE:DO에 추가';
    item.append(logoIcon(), label);
    // 옆 항목의 높이·글자 크기를 따른다(유튜브 내부 컴포넌트는 복제하지 않는다)
    const sibling = list.querySelector(modern ? REDO_SEL.menuRowModern : REDO_SEL.menuRowLegacy);
    if (sibling) {
      const h = sibling.getBoundingClientRect().height;
      if (h >= 24 && h <= 64) item.style.minHeight = `${Math.round(h)}px`;
    }
    const activate = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      addSong(videoId);
    };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') activate(e);
    });
    return item;
  }

  function checkPopup() {
    popupCheckQueued = false;
    const dd = openDropdown();
    if (!dd) {
      // 닫혔다. 유튜브가 메뉴 DOM을 다시 쓰므로 항목을 지워 둔다.
      if (pendingMenu && pendingMenu.bound) pendingMenu = null;
      removeMenuItems();
      return;
    }
    if (!pendingMenu) return;
    if (!pendingMenu.bound && Date.now() - pendingMenu.at > REDO_MENU_BIND_MS) {
      pendingMenu = null;
      return;
    }
    const modernList = dd.querySelector(REDO_SEL.menuListModern);
    const list = modernList || dd.querySelector(REDO_SEL.menuListLegacy);
    if (!list || list.children.length === 0) return; // 아직 그려지는 중
    // 기억한 카드의 팝업이 아닌 다른 팝업으로 바뀌었으면 넣지 않는다
    if (pendingMenu.bound && pendingMenu.dropdown !== dd) {
      pendingMenu = null;
      removeMenuItems();
      return;
    }
    pendingMenu.bound = true;
    pendingMenu.dropdown = dd;
    const existing = list.querySelector('[data-redo-item]');
    if (existing) {
      if (existing === list.lastElementChild) return;
      existing.remove();
    }
    const item = buildMenuItem(list, Boolean(modernList), pendingMenu.videoId);
    list.appendChild(item);
    refitDropdown(dd, item);
  }

  // 유튜브는 팝업을 열 때 높이를 고정한다. 항목을 더한 뒤 크기를 다시 재게 하지 않으면 잘려서 보이지 않는다.
  function refitDropdown(dd, item) {
    dd.dispatchEvent(new CustomEvent('iron-resize'));
    requestAnimationFrame(() => {
      if (!item.isConnected) return;
      const box = dd.getBoundingClientRect();
      if (item.getBoundingClientRect().bottom > box.bottom + 1) window.dispatchEvent(new Event('resize'));
    });
  }

  function queuePopupCheck() {
    if (popupCheckQueued) return;
    popupCheckQueued = true;
    requestAnimationFrame(checkPopup);
  }

  function watchPopupContainer() {
    if (popupObserver) return true;
    const container = document.querySelector(REDO_SEL.popupContainer);
    if (!container) return false;
    popupObserver = new MutationObserver(queuePopupCheck);
    popupObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'aria-hidden'],
    });
    return true;
  }

  // 메뉴 버튼 클릭을 캡처 단계에서 잡아 "어느 카드의 메뉴인지" 기억한다.
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest('[data-redo-item]')) return;
      const button = target.closest(REDO_SEL.menuButton);
      if (!button) return;
      // 새 메뉴 버튼을 눌렀다: 앞 카드의 기억은 언제나 버린다
      pendingMenu = null;
      removeMenuItems();
      if (!menuItemEnabled) return;
      const card = button.closest(REDO_SEL.card);
      const link = card && card.querySelector(REDO_SEL.watchLink);
      const videoId = link ? redoVideoIdFromCardHref(link.getAttribute('href'), location.origin) : null;
      if (!videoId) return; // 쇼츠·재생목록·믹스·광고·영상 아래 메뉴
      if (!watchPopupContainer()) return;
      pendingMenu = { videoId, at: Date.now(), bound: false };
      queuePopupCheck();
      // 팝업이 열려 있던 채로 내용만 바뀌면 변화 알림이 늦을 수 있어 몇 번 더 본다
      for (const ms of [120, 400, 900]) setTimeout(queuePopupCheck, ms);
    },
    true
  );

  // ── 화면 전환 ──
  async function onNavigate() {
    pendingMenu = null;
    removeMenuItems();
    syncWatchButton();
    const settings = await ask({ type: 'GET_SETTINGS' });
    if (settings) menuItemEnabled = settings.menuItem !== false;
  }

  // 유튜브는 화면 전환 때 문서를 새로 받지 않는다(P4)
  document.addEventListener('yt-navigate-finish', onNavigate);
  window.addEventListener('popstate', () => setTimeout(syncWatchButton, 0));

  // 우클릭 메뉴 결과는 서비스 워커가 보내 준다
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'REDO_TOAST') return;
    showToast(message.result);
    const r = message.result;
    if (r && message.videoId && message.videoId === watchVideoId && (r.kind === 'added' || r.kind === 'exists')) {
      watchOpenUrl = r.openUrl || null;
      setWatchState('exists');
    }
  });

  onNavigate();
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && !window.__redoContentLoaded) {
  window.__redoContentLoaded = true;
  redoInit();
}
