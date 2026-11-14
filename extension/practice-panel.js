// RE:DO 크롬 확장 — 유튜브 재생 화면 연습 패널: 구간 반복·배속·단축키·끌기/접기/닫기 (EX-2 명세 §3~§6)
// 서버 호출·저장소 사용은 하지 않는다. content.js의 REDO_SEL·redoWatchVideoId를 같은 격리 영역에서 사용한다.
'use strict';

const REDO_RATE_MIN = 0.25;
const REDO_RATE_MAX = 2;
const REDO_RATE_STEP = 0.05;
const REDO_RATE_PRESETS = [0.5, 0.75, 0.9, 1];
const REDO_MIN_LOOP_SEC = 0.5;
const REDO_PANEL_MSG_MS = 3000;
const REDO_VIDEO_RETRY_MS = 500;
const REDO_VIDEO_RETRY_MAX = 10;

const REDO_SHORTCUT_CODES = {
  BracketLeft: 'setA',
  BracketRight: 'setB',
  KeyL: 'loop',
  KeyR: 'restart',
  Digit1: 'preset0',
  Digit2: 'preset1',
  Digit3: 'preset2',
  Digit4: 'preset3',
  Minus: 'rateDown',
  Equal: 'rateUp',
};

/** 초를 mm:ss.s 형식으로 바꾼다. null·비유한 값은 '--:--.-'. */
function redoFormatTime(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return '--:--.-';
  const tenths = Math.round(Math.max(0, sec) * 10);
  const mins = String(Math.floor(tenths / 600)).padStart(2, '0');
  const rem = tenths % 600;
  const secs = String(Math.floor(rem / 10)).padStart(2, '0');
  return `${mins}:${secs}.${rem % 10}`;
}

/** 소수 첫째 자리 반올림 후 0~86400으로 자른다. */
function redoRoundTime(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return 0;
  const v = Math.min(86400, Math.max(0, Math.round(t * 10) / 10));
  return v === 0 ? 0 : v;
}

/** 소수 둘째 자리 반올림 후 0.25~2로 자른다. 유한하지 않으면 1. */
function redoClampRate(x) {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 1;
  return Math.min(REDO_RATE_MAX, Math.max(REDO_RATE_MIN, Math.round(x * 100) / 100));
}

/** 배속을 0.05 단위로 올리거나 내린다. 경계에서는 같은 값. */
function redoStepRate(rate, dir) {
  return redoClampRate(redoClampRate(rate) + (dir >= 0 ? 1 : -1) * REDO_RATE_STEP);
}

/** A 지점을 지정한다. B가 있고 b - a < 0.5이면 B와 반복을 지운다. */
function redoSetA(state, t) {
  const a = redoRoundTime(t);
  let b = state && state.b != null ? state.b : null;
  let loopOn = Boolean(state && state.loopOn);
  if (b != null && b - a < REDO_MIN_LOOP_SEC - 1e-9) {
    b = null;
    loopOn = false;
  }
  return { a, b, loopOn };
}

/** B 지점을 지정한다. A가 null이면 0으로 보고, b - a < 0.5이면 값을 바꾸지 않고 error: 'order'. */
function redoSetB(state, t) {
  const prevA = state ? state.a : null;
  const prevB = state ? state.b : null;
  const prevLoop = Boolean(state && state.loopOn);
  const baseA = prevA == null ? 0 : prevA;
  const nextB = redoRoundTime(t);
  if (nextB - baseA < REDO_MIN_LOOP_SEC - 1e-9) {
    return { a: prevA, b: prevB, loopOn: prevLoop, error: 'order' };
  }
  return { a: baseA, b: nextB, loopOn: prevLoop };
}

/** 재생 위치 감시 결과: 조건이 모두 맞고 t >= b일 때만 'jump'. */
function redoLoopAction(s) {
  return s && s.loopOn && !s.ad && !s.seeking && s.a != null && s.b != null && s.t >= s.b ? 'jump' : 'none';
}

/** Alt 단독 조합일 때만 단축키 행동을 돌려준다. repeat이면 rateDown·rateUp만 허용. */
function redoShortcutAction(e) {
  if (!e || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const action = REDO_SHORTCUT_CODES[e.code] || null;
  if (!action) return null;
  if (e.repeat && action !== 'rateDown' && action !== 'rateUp') return null;
  return action;
}

/** 입력 요소 안에서는 단축키를 가로채지 않는다. */
function redoIsEditableTarget(el) {
  if (!el) return false;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
}

/** 패널 좌표를 화면 안(상단 바 56px 아래, 하단 40px 이상)으로 자른다. */
function redoClampPanelPos(p) {
  const vw = p && Number.isFinite(p.vw) ? p.vw : 0;
  const vh = p && Number.isFinite(p.vh) ? p.vh : 0;
  const w = p && Number.isFinite(p.w) ? p.w : 0;
  const maxX = Math.max(0, vw - w);
  const maxY = Math.max(56, vh - 40);
  const rawX = p && Number.isFinite(p.x) ? p.x : 0;
  const rawY = p && Number.isFinite(p.y) ? p.y : 56;
  const x = Math.min(maxX, Math.max(0, rawX));
  const y = Math.min(maxY, Math.max(56, rawY));
  return { x: x === 0 ? 0 : x, y };
}

function redoPanelInit() {
  const state = {
    videoId: null,
    video: null,
    a: null,
    b: null,
    loopOn: false,
    loops: 0,
    rate: 1,
    ad: false,
    wasAd: false,
    closed: false,
    collapsed: false,
    pos: null,
    videoMissing: false,
    tempMsg: '',
  };

  let panelEl = null;
  let bodyEl = null;
  let collapseBtn = null;
  const btns = {};
  const outs = {};
  let rafId = 0;
  let retryTimer = 0;
  let msgTimer = 0;
  let dragCleanup = null;

  function clearVideoRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = 0;
    }
  }

  function clearTempStatus() {
    if (msgTimer) {
      clearTimeout(msgTimer);
      msgTimer = 0;
    }
    state.tempMsg = '';
  }

  function setTempStatus(msg) {
    clearTempStatus();
    state.tempMsg = msg;
    render();
    msgTimer = setTimeout(() => {
      msgTimer = 0;
      state.tempMsg = '';
      render();
    }, REDO_PANEL_MSG_MS);
  }

  function stopRaf() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function startRaf() {
    if (rafId || state.closed || !state.loopOn || !state.video) return;
    const step = () => {
      rafId = 0;
      tick();
      if (!state.closed && state.loopOn && state.video) {
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);
  }

  function applyPos(pos) {
    if (!panelEl || !pos) return;
    panelEl.style.left = `${pos.x}px`;
    panelEl.style.top = `${pos.y}px`;
    panelEl.style.right = 'auto';
  }

  function removePanel() {
    if (dragCleanup) {
      dragCleanup();
      dragCleanup = null;
    }
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
      bodyEl = null;
      collapseBtn = null;
    }
  }

  function makeBtn(act, text, titleText, cls) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls || 'redo-panel__btn';
    btn.dataset.redoAct = act;
    btn.textContent = text;
    if (titleText) btn.title = titleText;
    btn.addEventListener('click', () => handleAction(act));
    return btn;
  }

  function makeOut(name, initial) {
    const out = document.createElement('output');
    out.className = 'redo-panel__out';
    out.dataset.redoOut = name;
    out.textContent = initial;
    outs[name] = out;
    return out;
  }

  function startDrag(e) {
    if (!panelEl || e.button !== 0) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target && target.closest('button')) return;
    e.preventDefault();
    const rect = panelEl.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origLeft = rect.left;
    const origTop = rect.top;

    const onMove = (ev) => {
      if (!panelEl) return;
      const clamped = redoClampPanelPos({
        x: origLeft + (ev.clientX - startX),
        y: origTop + (ev.clientY - startY),
        w: panelEl.offsetWidth || rect.width,
        h: panelEl.offsetHeight || rect.height,
        vw: window.innerWidth,
        vh: window.innerHeight,
      });
      state.pos = clamped;
      applyPos(clamped);
    };

    const onUp = () => {
      if (dragCleanup) {
        dragCleanup();
        dragCleanup = null;
      }
    };

    if (dragCleanup) dragCleanup();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    dragCleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }

  function ensurePanel() {
    if (panelEl) return;
    const panel = document.createElement('div');
    panel.className = 'redo-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'RE:DO 연습 패널');
    panel.dataset.redoCollapsed = state.collapsed ? '1' : '0';

    const head = document.createElement('div');
    head.className = 'redo-panel__head';
    head.addEventListener('pointerdown', startDrag);

    const title = document.createElement('span');
    title.className = 'redo-panel__title';
    title.textContent = 'RE:DO 연습';

    collapseBtn = makeBtn('collapse', '–', null, 'redo-panel__icon-btn');
    const closeBtn = makeBtn('close', '×', null, 'redo-panel__icon-btn');
    closeBtn.setAttribute('aria-label', '닫기');
    head.append(title, collapseBtn, closeBtn);

    const body = document.createElement('div');
    body.className = 'redo-panel__body';

    const row1 = document.createElement('div');
    row1.className = 'redo-panel__row';
    btns.setA = makeBtn('setA', 'A 지정', '단축키 Alt+[');
    btns.setB = makeBtn('setB', 'B 지정', '단축키 Alt+]');
    row1.append(btns.setA, makeOut('a', '--:--.-'), btns.setB, makeOut('b', '--:--.-'));

    const row2 = document.createElement('div');
    row2.className = 'redo-panel__row';
    btns.loop = makeBtn('loop', '반복', '단축키 Alt+L');
    btns.restart = makeBtn('restart', '처음으로', '단축키 Alt+R');
    btns.clear = makeBtn('clear', '초기화', null);
    row2.append(btns.loop, btns.restart, btns.clear, makeOut('loops', '0회'));

    const row3 = document.createElement('div');
    row3.className = 'redo-panel__row';
    btns.rateDown = makeBtn('rateDown', '−0.05', '단축키 Alt+-');
    btns.rateUp = makeBtn('rateUp', '+0.05', '단축키 Alt+=');
    row3.append(btns.rateDown, makeOut('rate', '1.00x'), btns.rateUp);

    const row4 = document.createElement('div');
    row4.className = 'redo-panel__row';
    const presetLabels = ['0.5x', '0.75x', '0.9x', '1.0x'];
    for (let i = 0; i < REDO_RATE_PRESETS.length; i += 1) {
      const act = `preset${i}`;
      btns[act] = makeBtn(act, presetLabels[i], `단축키 Alt+${i + 1}`);
      row4.appendChild(btns[act]);
    }

    const status = document.createElement('p');
    status.className = 'redo-panel__status';
    status.dataset.redoOut = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    outs.status = status;

    body.append(row1, row2, row3, row4, status);
    panel.append(head, body);
    document.body.appendChild(panel);

    panelEl = panel;
    bodyEl = body;

    if (state.pos) {
      state.pos = redoClampPanelPos({
        x: state.pos.x,
        y: state.pos.y,
        w: panelEl.offsetWidth || 280,
        h: panelEl.offsetHeight || 200,
        vw: window.innerWidth,
        vh: window.innerHeight,
      });
      applyPos(state.pos);
    }
  }

  function render() {
    if (!panelEl) return;
    panelEl.dataset.redoCollapsed = state.collapsed ? '1' : '0';
    bodyEl.hidden = state.collapsed;
    collapseBtn.setAttribute('aria-expanded', state.collapsed ? 'false' : 'true');
    collapseBtn.setAttribute('aria-label', state.collapsed ? '펼치기' : '접기');
    collapseBtn.textContent = state.collapsed ? '+' : '–';

    outs.a.textContent = redoFormatTime(state.a);
    outs.b.textContent = redoFormatTime(state.b);
    outs.loops.textContent = `${state.loops}회`;
    outs.rate.textContent = `${state.rate.toFixed(2)}x`;

    btns.loop.setAttribute('aria-pressed', state.loopOn ? 'true' : 'false');
    for (let i = 0; i < REDO_RATE_PRESETS.length; i += 1) {
      const active = Math.abs(state.rate - REDO_RATE_PRESETS[i]) < 0.001;
      btns[`preset${i}`].setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    const noVideo = state.videoMissing || !state.video;
    for (const [act, btn] of Object.entries(btns)) {
      if (noVideo) {
        btn.disabled = true;
      } else if (state.ad && (act === 'setA' || act === 'setB' || act === 'restart')) {
        btn.disabled = true;
      } else {
        btn.disabled = false;
      }
    }

    if (state.videoMissing) {
      outs.status.textContent = '영상을 찾지 못했습니다. 페이지를 새로고침해 주세요';
    } else if (state.tempMsg) {
      outs.status.textContent = state.tempMsg;
    } else if (state.ad) {
      outs.status.textContent = '광고가 끝나면 이어집니다';
    } else {
      outs.status.textContent = '';
    }
  }

  function attachVideo(video) {
    state.video = video;
    const bound = video.dataset ? video.dataset.redoPanelBound === '1' : Boolean(video.__redoPanelBound);
    if (bound) return;
    if (video.dataset) video.dataset.redoPanelBound = '1';
    else video.__redoPanelBound = true;

    video.addEventListener('timeupdate', () => {
      if (state.video === video) tick();
    });

    video.addEventListener('ended', () => {
      if (state.closed || state.video !== video) return;
      const ad = Boolean(document.querySelector(REDO_SEL.adShowing));
      if (state.loopOn && !ad && state.a != null) {
        video.currentTime = state.a;
        state.loops += 1;
        try {
          const p = video.play();
          // 브라우저 자동재생 정책으로 play()가 거부될 수 있어 무시한다
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          // 동기 예외도 자동재생 실패와 동일하게 무시한다
        }
        render();
      }
    });

    video.addEventListener('ratechange', () => {
      if (state.closed || state.video !== video) return;
      const ad = Boolean(document.querySelector(REDO_SEL.adShowing));
      if (ad) return;
      if (Math.abs(video.playbackRate - state.rate) > 0.001) {
        state.rate = redoClampRate(video.playbackRate);
        render();
      }
    });
  }

  function tick() {
    if (state.closed || !state.video) return;
    const ad = Boolean(document.querySelector(REDO_SEL.adShowing));
    let dirty = false;
    if (ad !== state.ad) {
      state.ad = ad;
      dirty = true;
    }
    if (state.wasAd && !ad && Math.abs(state.video.playbackRate - state.rate) > 0.001) {
      state.video.playbackRate = state.rate;
    }
    if (
      redoLoopAction({
        loopOn: state.loopOn,
        a: state.a,
        b: state.b,
        t: state.video.currentTime,
        seeking: state.video.seeking,
        ad,
      }) === 'jump'
    ) {
      state.video.currentTime = state.a;
      state.loops += 1;
      dirty = true;
    }
    state.wasAd = ad;
    if (dirty) render();
  }

  function findAndBindVideo(expectedId) {
    clearVideoRetry();
    const first = document.querySelector(REDO_SEL.video);
    if (first) {
      state.videoMissing = false;
      attachVideo(first);
      state.rate = redoClampRate(first.playbackRate);
      state.ad = Boolean(document.querySelector(REDO_SEL.adShowing));
      state.wasAd = state.ad;
      render();
      if (state.loopOn) startRaf();
      return;
    }

    state.video = null;
    state.videoMissing = false;
    render();

    let attempts = 0;
    const retry = () => {
      retryTimer = 0;
      if (state.closed || state.videoId !== expectedId) return;
      const found = document.querySelector(REDO_SEL.video);
      if (found) {
        state.videoMissing = false;
        attachVideo(found);
        state.rate = redoClampRate(found.playbackRate);
        state.ad = Boolean(document.querySelector(REDO_SEL.adShowing));
        state.wasAd = state.ad;
        render();
        if (state.loopOn) startRaf();
        return;
      }
      attempts += 1;
      if (attempts >= REDO_VIDEO_RETRY_MAX) {
        state.videoMissing = true;
        render();
        return;
      }
      retryTimer = setTimeout(retry, REDO_VIDEO_RETRY_MS);
    };
    retryTimer = setTimeout(retry, REDO_VIDEO_RETRY_MS);
  }

  function handleAction(act) {
    if (act === 'collapse') {
      state.collapsed = !state.collapsed;
      render();
      return;
    }
    if (act === 'close') {
      state.closed = true;
      state.loopOn = false;
      stopRaf();
      clearVideoRetry();
      clearTempStatus();
      removePanel();
      return;
    }

    if (state.closed || state.videoMissing || !state.video) return;
    if (state.ad && (act === 'setA' || act === 'setB' || act === 'restart')) return;

    if (act === 'setA') {
      if (!Number.isFinite(state.video.duration)) {
        setTempStatus('이 영상에서는 구간을 지정할 수 없습니다');
        return;
      }
      const next = redoSetA({ a: state.a, b: state.b, loopOn: state.loopOn }, state.video.currentTime);
      state.a = next.a;
      state.b = next.b;
      state.loopOn = next.loopOn;
      if (!state.loopOn) stopRaf();
      clearTempStatus();
      render();
      return;
    }

    if (act === 'setB') {
      if (!Number.isFinite(state.video.duration)) {
        setTempStatus('이 영상에서는 구간을 지정할 수 없습니다');
        return;
      }
      const next = redoSetB({ a: state.a, b: state.b, loopOn: state.loopOn }, state.video.currentTime);
      if (next.error === 'order') {
        setTempStatus('B는 A보다 0.5초 이상 뒤여야 합니다');
        return;
      }
      state.a = next.a;
      state.b = next.b;
      state.loopOn = next.loopOn;
      clearTempStatus();
      render();
      return;
    }

    if (act === 'loop') {
      if (state.loopOn) {
        state.loopOn = false;
        stopRaf();
        render();
        return;
      }
      if (state.a == null || state.b == null) {
        setTempStatus('A와 B를 먼저 지정하세요');
        return;
      }
      state.loopOn = true;
      if (state.video.currentTime < state.a || state.video.currentTime >= state.b) {
        state.video.currentTime = state.a;
      }
      clearTempStatus();
      startRaf();
      render();
      return;
    }

    if (act === 'restart') {
      state.video.currentTime = state.a != null ? state.a : 0;
      render();
      return;
    }

    if (act === 'clear') {
      state.a = null;
      state.b = null;
      state.loopOn = false;
      state.loops = 0;
      stopRaf();
      clearTempStatus();
      render();
      return;
    }

    let nextRate = null;
    if (act === 'rateDown') nextRate = redoStepRate(state.rate, -1);
    else if (act === 'rateUp') nextRate = redoStepRate(state.rate, 1);
    else if (act.startsWith('preset')) {
      const idx = Number(act.slice(6));
      if (idx >= 0 && idx < REDO_RATE_PRESETS.length) nextRate = REDO_RATE_PRESETS[idx];
    }
    if (nextRate == null) return;

    if (Math.abs(nextRate - state.rate) < 0.001) {
      setTempStatus('배속은 0.25~2.0 범위입니다');
      return;
    }
    state.rate = nextRate;
    if (!state.ad) state.video.playbackRate = state.rate;
    clearTempStatus();
    render();
  }

  function sync() {
    const id = redoWatchVideoId(location.href);
    if (!id) {
      clearVideoRetry();
      stopRaf();
      clearTempStatus();
      state.loopOn = false;
      state.videoId = null;
      state.video = null;
      state.ad = false;
      state.wasAd = false;
      state.videoMissing = false;
      removePanel();
      return;
    }

    if (id !== state.videoId) {
      state.a = null;
      state.b = null;
      state.loopOn = false;
      state.loops = 0;
      state.ad = false;
      state.wasAd = false;
      state.videoMissing = false;
      clearTempStatus();
      stopRaf();
    }
    state.videoId = id;

    if (state.closed) {
      clearVideoRetry();
      stopRaf();
      removePanel();
      return;
    }

    ensurePanel();
    findAndBindVideo(id);
  }

  document.addEventListener('yt-navigate-finish', sync);
  window.addEventListener('popstate', () => setTimeout(sync, 0));
  window.addEventListener('resize', () => {
    if (!panelEl || !state.pos) return;
    state.pos = redoClampPanelPos({
      x: state.pos.x,
      y: state.pos.y,
      w: panelEl.offsetWidth || 280,
      h: panelEl.offsetHeight || 200,
      vw: window.innerWidth,
      vh: window.innerHeight,
    });
    applyPos(state.pos);
  });

  window.addEventListener(
    'keydown',
    (e) => {
      if (!state.videoId || state.closed || e.isComposing) return;
      const target = typeof e.composedPath === 'function' ? e.composedPath()[0] : e.target;
      if (redoIsEditableTarget(target)) return;
      const act = redoShortcutAction(e);
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      handleAction(act);
    },
    true
  );

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'REDO_PANEL_OPEN') {
      state.closed = false;
      sync();
    }
  });

  sync();
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && !window.__redoPanelLoaded) {
  window.__redoPanelLoaded = true;
  redoPanelInit();
}
