// RE:DO 크롬 확장 — 유튜브 재생 화면 연습 패널: 구간 반복·배속·단축키·끌기/접기/닫기 (EX-2 명세 §3~§6)
// + 저장 줄: 곡 추가·등록 상태·연습 저장 (EX-3, 명세 §9). 서버 호출은 서비스 워커에 메시지로만 맡기고 토큰·저장소는 다루지 않는다.
// content.js의 REDO_SEL·redoWatchVideoId·redoToast를 같은 격리 영역에서 사용한다.
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

// ───────── EX-3 저장 연결 (EX-2 명세 §9) ─────────

const REDO_MAX_ADD_SECONDS = 21600;
const REDO_MAX_ADD_LOOPS = 100000;
/** 한 번에 더하는 시간 상한(초). 탭이 멈췄다 깨어난 사이를 연습 시간으로 세지 않는다. */
const REDO_MAX_TICK_SEC = 2;

/**
 * 연습 시간 누적(U8): 재생 중·광고 아님·패널 열림일 때만 지난 실제 시간(최대 2초)을 더한다.
 * 멈춘 동안에는 last를 비워, 다시 재생할 때 멈춘 시간을 세지 않는다.
 */
function redoAccumulate({ acc, last, now, counting }) {
  if (!counting || !Number.isFinite(now)) return { acc, last: null };
  if (last == null) return { acc, last: now };
  const dt = Math.max(0, Math.min(REDO_MAX_TICK_SEC, (now - last) / 1000));
  return { acc: acc + dt, last: now };
}

/** 브라우저 로컬 날짜 YYYY-MM-DD */
function redoLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const redoSameNum = (x, y) => (x == null || y == null ? x == y : Math.abs(x - y) < 0.001);

/**
 * SAVE_PRACTICE 메시지 본문. 구간은 패널에 둘 다 있으면 그 값, 아니면 마지막으로 받은 곡 값
 * (이 API는 보낸 a·b로 덮어쓴다 — 빠뜨리면 저장된 구간이 지워진다).
 */
function redoBuildSave({ songId, t, a, b, song, rate, accSec, accLoops, date }) {
  const msg = { type: 'SAVE_PRACTICE', songId, pos: redoRoundTime(t) };
  if (a != null && b != null && a < b) {
    msg.a = a;
    msg.b = b;
  } else if (song && song.a != null && song.b != null && song.a < song.b) {
    msg.a = song.a;
    msg.b = song.b;
  }
  msg.rate = redoClampRate(rate);
  msg.date = date;
  msg.addSeconds = Math.min(REDO_MAX_ADD_SECONDS, Math.max(0, Math.floor(accSec || 0)));
  msg.addLoops = Math.min(REDO_MAX_ADD_LOOPS, Math.max(0, Math.floor(accLoops || 0)));
  return msg;
}

async function redoPanelAsk(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    // 확장을 다시 불러오면 이 페이지의 연결이 끊긴다
    return null;
  }
}

const REDO_RELOAD_MSG = '확장 프로그램이 갱신되었습니다. 페이지를 새로고침해 주세요';

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
    // EX-3 저장 연결
    gen: 0, // 영상·계정이 바뀔 때마다 올린다. 그 전에 시작한 조회·추가·저장 응답은 버린다
    lookedUpFor: null, // 지금 세대에서 조회를 시작한 videoId
    songState: 'unknown', // 'unknown' | 'none' | 'exists'
    song: null, // { id, a, b, rate } — 서버에 마지막으로 저장됐다고 아는 값
    openUrl: null,
    busy: null, // 'add' | 'save' | null
    pendingRate: null, // 불러온 저장 배속. [반복]을 켤 때 적용, 그 전에 패널로 배속을 바꾸면 버린다
    notice: '',
    accSec: 0,
    accLoops: 0,
    lastCountAt: null,
  };

  let panelEl = null;
  const saveUi = {};
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

    // 저장 줄(EX-3): 미등록 [RE:DO에 추가] / 등록 "RE:DO에 있음" + [저장] + "저장 안 됨"
    const saveRow = document.createElement('div');
    saveRow.className = 'redo-panel__row redo-panel__save';
    saveUi.row = saveRow;
    saveUi.add = makeBtn('add', 'RE:DO에 추가', '이 영상을 구간·배속과 함께 RE:DO 연습곡으로 추가');
    saveUi.link = document.createElement('a');
    saveUi.link.className = 'redo-panel__link';
    saveUi.link.dataset.redoOut = 'exists';
    saveUi.link.target = '_blank';
    saveUi.link.rel = 'noopener noreferrer';
    saveUi.link.title = 'RE:DO 연습 화면 열기';
    saveUi.link.textContent = 'RE:DO에 있음';
    saveUi.save = makeBtn('save', '저장', '구간·배속·연습 시간을 RE:DO에 저장');
    saveUi.dirty = document.createElement('span');
    saveUi.dirty.className = 'redo-panel__dirty';
    saveUi.dirty.dataset.redoOut = 'dirty';
    saveUi.dirty.textContent = '저장 안 됨';
    saveRow.append(saveUi.add, saveUi.link, saveUi.save, saveUi.dirty);

    const status = document.createElement('p');
    status.className = 'redo-panel__status';
    status.dataset.redoOut = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    outs.status = status;

    body.append(row1, row2, row3, row4, saveRow, status);
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

    renderSaveRow(noVideo);

    if (state.videoMissing) {
      outs.status.textContent = '영상을 찾지 못했습니다. 페이지를 새로고침해 주세요';
    } else if (state.tempMsg) {
      outs.status.textContent = state.tempMsg;
    } else if (state.ad) {
      outs.status.textContent = '광고가 끝나면 이어집니다';
    } else {
      outs.status.textContent = state.notice;
    }
  }

  /** 저장할 배속: 불러온 배속을 아직 적용하지 않았으면 그 값(저장값을 지금 재생 배속으로 덮지 않는다) */
  function rateToSave() {
    return state.pendingRate != null ? state.pendingRate : state.rate;
  }

  /** 서버에 저장한 값과 다른 것이 있는지(구간·배속 변경 또는 1초 이상·1회 이상 누적) */
  function hasUnsaved() {
    const s = state.song;
    if (!s) return false;
    if (Math.floor(state.accSec) >= 1 || state.accLoops > 0) return true;
    if (state.a != null && state.b != null && (!redoSameNum(state.a, s.a) || !redoSameNum(state.b, s.b))) return true;
    return !redoSameNum(rateToSave(), s.rate);
  }

  function renderSaveRow(noVideo) {
    if (!saveUi.row) return;
    const registered = state.songState === 'exists' && Boolean(state.song);
    saveUi.row.dataset.redoSaveState = state.busy || (registered ? 'exists' : state.songState);
    saveUi.add.hidden = registered;
    saveUi.add.disabled = state.busy === 'add';
    saveUi.add.textContent = state.busy === 'add' ? '추가하는 중…' : 'RE:DO에 추가';
    saveUi.link.hidden = !registered;
    if (state.openUrl) saveUi.link.href = state.openUrl;
    else if (typeof saveUi.link.removeAttribute === 'function') saveUi.link.removeAttribute('href');
    saveUi.save.hidden = !registered;
    // 광고 중·저장 중·영상 없음에는 저장을 잠근다
    saveUi.save.disabled = state.busy === 'save' || state.ad || noVideo;
    saveUi.save.textContent = state.busy === 'save' ? '저장하는 중…' : '저장';
    saveUi.dirty.hidden = !(registered && hasUnsaved());
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
        state.accLoops += 1;
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
      // 광고 중이거나, 광고가 끝났는데 tick이 아직 배속을 되돌리지 않았으면(wasAd) 유튜브가 바꾼 값을 받아들이지 않는다
      if (ad || state.wasAd) return;
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
    // 연습 시간 누적(U8): 패널이 열려 있고(이 함수는 닫히면 끝난다) 재생 중이고 광고가 아닐 때
    const unsavedBefore = hasUnsaved();
    const counted = redoAccumulate({
      acc: state.accSec,
      last: state.lastCountAt,
      now: Date.now(),
      counting: !ad && !state.video.paused && !state.video.ended,
    });
    state.accSec = counted.acc;
    state.lastCountAt = counted.last;
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
      state.accLoops += 1;
      dirty = true;
    }
    state.wasAd = ad;
    if (dirty || hasUnsaved() !== unsavedBefore) render();
  }

  function bindFound(video, fresh) {
    const ad = Boolean(document.querySelector(REDO_SEL.adShowing));
    state.videoMissing = false;
    attachVideo(video);
    // 같은 영상을 다시 맞출 때 광고 중(또는 광고 직후 복원 전)이면 video.playbackRate는 광고 값이다.
    // 예약한 배속을 지키고, 광고 뒤 tick이 적용한다.
    const keepPending = !fresh && (ad || state.wasAd);
    if (!keepPending) state.rate = redoClampRate(video.playbackRate);
    state.wasAd = keepPending ? true : ad;
    state.ad = ad;
    render();
    if (state.loopOn) startRaf();
  }

  function findAndBindVideo(expectedId, fresh) {
    clearVideoRetry();
    const first = document.querySelector(REDO_SEL.video);
    if (first) {
      bindFound(first, fresh);
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
        bindFound(found, fresh);
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
      state.lastCountAt = null;
      stopRaf();
      clearVideoRetry();
      clearTempStatus();
      removePanel();
      return;
    }

    if (state.closed) return;
    if (act === 'add') {
      addSong();
      return;
    }
    if (state.videoMissing || !state.video) return;
    const ad = Boolean(document.querySelector(REDO_SEL.adShowing));
    if (ad !== state.ad) state.ad = ad;
    if (act === 'save') {
      saveProgress();
      return;
    }
    if (ad && (act === 'setA' || act === 'setB' || act === 'restart')) {
      render();
      return;
    }
    state.notice = '';

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
      if (state.pendingRate != null) {
        // 불러온 저장 배속은 [반복]을 켤 때 적용한다(광고 중이면 광고 뒤 tick이 적용)
        state.rate = state.pendingRate;
        state.pendingRate = null;
        if (!ad) state.video.playbackRate = state.rate;
      }
      if (!ad && (state.video.currentTime < state.a || state.video.currentTime >= state.b)) {
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
      state.pendingRate = null;
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
    // 불러온 배속을 적용하기 전에 사용자가 배속을 바꾸면 불러온 값은 버린다
    state.pendingRate = null;

    if (Math.abs(nextRate - state.rate) < 0.001) {
      setTempStatus('배속은 0.25~2.0 범위입니다');
      return;
    }
    state.rate = nextRate;
    if (!ad) state.video.playbackRate = state.rate;
    clearTempStatus();
    render();
  }

  // ───────── EX-3 저장 연결 ─────────

  /** 영상·계정이 바뀌었다: 진행 중인 조회·추가·저장 응답을 버리고 등록 상태를 비운다 */
  function resetSongState() {
    state.gen += 1;
    state.lookedUpFor = null;
    state.songState = 'unknown';
    state.song = null;
    state.openUrl = null;
    state.busy = null;
    state.pendingRate = null;
    state.notice = '';
  }

  function resetAccum() {
    state.accSec = 0;
    state.accLoops = 0;
    state.lastCountAt = null;
  }

  function setRegistered(song, openUrl) {
    state.songState = 'exists';
    state.song = { id: song.id, a: song.a, b: song.b, rate: song.rate };
    state.openUrl = openUrl || null;
  }

  /** 저장된 구간·배속을 패널에 채운다. 사용자가 이미 구간을 지정했으면 건드리지 않는다. */
  function loadSaved(song) {
    if (state.a != null || state.b != null) return;
    if (song.a == null || song.b == null || !(song.a < song.b)) return;
    state.a = song.a;
    state.b = song.b;
    const rate = redoClampRate(song.rate);
    state.pendingRate = Math.abs(rate - state.rate) > 0.001 ? rate : null;
    state.notice = `저장된 구간·배속(${rate.toFixed(2)}x)을 불러왔습니다. [반복]을 켜면 적용됩니다`;
  }

  function lookup() {
    resetSongState();
    const gen = state.gen;
    const videoId = state.videoId;
    state.lookedUpFor = videoId;
    render();
    redoPanelAsk({ type: 'LOOKUP_SONG', videoId }).then((found) => {
      // 늦게 온 응답(다른 영상·이전 계정)이나, 그 사이 추가가 끝나 이미 등록된 경우는 버린다
      if (gen !== state.gen || state.songState === 'exists') return;
      if (found && found.state === 'exists' && found.song && found.song.id) {
        setRegistered(found.song, found.openUrl);
        loadSaved(found.song);
      } else {
        state.songState = 'none';
      }
      render();
    });
  }

  function addSong() {
    const videoId = state.videoId;
    if (!videoId || state.busy) return;
    const gen = state.gen;
    const msg = { type: 'ADD_SONG', videoId, rate: rateToSave() };
    if (state.a != null && state.b != null && state.a < state.b) {
      msg.a = state.a;
      msg.b = state.b;
    }
    state.busy = 'add';
    render();
    redoPanelAsk(msg).then((result) => {
      if (typeof redoToast === 'function') redoToast(result);
      if (gen !== state.gen) return; // 그 사이 다른 영상으로 넘어갔거나 계정이 바뀌었다(새 조회가 상태를 정한다)
      state.busy = null;
      if (result && (result.kind === 'added' || result.kind === 'exists') && result.song && result.song.id) {
        // 기존 곡(200)이면 서버는 보낸 구간·배속을 버린다. 패널 값은 그대로 두고 "저장 안 됨"으로 보인다(P11)
        setRegistered(result.song, result.openUrl);
        loadSaved(result.song);
      }
      render();
    });
  }

  function saveProgress() {
    if (!state.song || state.busy || state.ad) return;
    const gen = state.gen;
    const msg = redoBuildSave({
      songId: state.song.id,
      t: state.video.currentTime,
      a: state.a,
      b: state.b,
      song: state.song,
      rate: rateToSave(),
      accSec: state.accSec,
      accLoops: state.accLoops,
      date: redoLocalDate(new Date()),
    });
    state.busy = 'save';
    clearTempStatus();
    render();
    redoPanelAsk(msg).then((res) => {
      if (gen !== state.gen) return; // 영상·계정이 바뀐 뒤 도착한 응답은 새 패널에 넣지 않는다
      state.busy = null;
      applySaveResult(res, msg);
    });
  }

  function applySaveResult(res, msg) {
    if (!res) {
      setTempStatus(REDO_RELOAD_MSG);
      return;
    }
    if (res.kind === 'saved') {
      // 서버는 보낸 구간·배속·위치를 저장했다(keep이어도 — PracticeService)
      state.song = { ...state.song, a: msg.a != null ? msg.a : null, b: msg.b != null ? msg.b : null, rate: msg.rate };
      if (res.keep === false) {
        // 저장 중에 더 쌓인 몫은 남긴다
        state.accSec = Math.max(0, state.accSec - msg.addSeconds);
        state.accLoops = Math.max(0, state.accLoops - msg.addLoops);
        setTempStatus('저장했습니다');
      } else {
        // 그날 첫 기록이 60초 미만이면 시간은 기록되지 않는다. 누적분을 남겨 다음 저장에 더한다(P8)
        setTempStatus('구간·배속을 저장했습니다. 연습 시간은 1분부터 기록됩니다');
      }
      return;
    }
    if (res.kind === 'login') {
      if (typeof redoToast === 'function') redoToast({ kind: 'login', message: '로그인이 필요합니다', action: 'login' });
      render();
      return;
    }
    if (res.kind === 'network') {
      setTempStatus('서버에 연결하지 못했습니다');
      return;
    }
    if (res.kind === 'gone') {
      state.songState = 'none';
      state.song = null;
      state.openUrl = null;
      state.pendingRate = null;
      setTempStatus('RE:DO에서 삭제된 곡입니다. 다시 추가할 수 있습니다');
      return;
    }
    if (res.kind === 'switched') {
      resetAccum();
      setTempStatus('요청 도중 계정이 바뀌어 저장하지 않았습니다');
      return;
    }
    setTempStatus(res.message || '저장하지 못했습니다');
  }

  function sync() {
    const id = redoWatchVideoId(location.href);
    if (!id) {
      resetSongState();
      resetAccum();
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

    const fresh = id !== state.videoId;
    if (fresh) {
      state.a = null;
      state.b = null;
      state.loopOn = false;
      state.loops = 0;
      state.ad = false;
      state.wasAd = false;
      state.videoMissing = false;
      clearTempStatus();
      stopRaf();
      // 영상이 바뀌면 누적분을 버리고 그 전 영상의 조회·저장 응답을 받지 않는다
      resetSongState();
      resetAccum();
    }
    state.videoId = id;

    if (state.closed) {
      clearVideoRetry();
      stopRaf();
      removePanel();
      return;
    }

    ensurePanel();
    findAndBindVideo(id, fresh);
    if (state.lookedUpFor !== id) lookup();
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
    if (!message) return;
    if (message.type === 'REDO_PANEL_OPEN') {
      state.closed = false;
      sync();
      return;
    }
    if (message.type === 'REDO_AUTH_CHANGED') {
      // 등록 상태·누적분은 계정별이다. 0으로 하고 같은 영상이라도 다시 조회한다
      resetAccum();
      resetSongState();
      if (state.videoId && !state.closed && panelEl) lookup();
      else render();
      return;
    }
    if (message.type === 'REDO_TOAST') {
      // 우클릭 "RE:DO에 추가" 결과: 지금 영상이면 저장 줄을 등록 상태로
      const r = message.result;
      if (!r || message.videoId !== state.videoId || !(r.kind === 'added' || r.kind === 'exists')) return;
      if (!r.song || !r.song.id || state.songState === 'exists') return;
      setRegistered(r.song, r.openUrl);
      loadSaved(r.song);
      render();
    }
  });

  sync();
}

if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && !window.__redoPanelLoaded) {
  window.__redoPanelLoaded = true;
  redoPanelInit();
}
