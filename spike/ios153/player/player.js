// M1A-1 스파이크 전용. 부모(앱) ↔ YouTube IFrame API 다리.
// 부모 → {type:'cmd', cmd:'play'|'pause'|'seek'|'rate', value}
// 플레이어 → {type:'ready'|'status'|'error'|'reject', ...}
'use strict';
(function () {
  var ALLOWED_PARENTS = ['capacitor://localhost', 'https://localhost'];
  var q = new URLSearchParams(location.search);
  var videoId = /^[A-Za-z0-9_-]{11}$/.test(q.get('v') || '') ? q.get('v') : 'M7lc1UVf-VE';
  var parentOrigin = ALLOWED_PARENTS.indexOf(q.get('parent')) >= 0 ? q.get('parent') : null;
  // 진단용: targetOrigin 지정이 custom scheme에서 실패하는지 가르기 위해 any=1이면 '*'로 보낸다(받는 쪽은 출처 검사)
  var target = q.get('any') === '1' ? '*' : parentOrigin;
  var player = null;

  function send(msg) {
    if (!target || window.parent === window) return;
    try { window.parent.postMessage(msg, target); } catch (e) { /* 잘못된 targetOrigin */ }
  }

  window.addEventListener('message', function (e) {
    if (!parentOrigin || e.origin !== parentOrigin) {
      // 진단: 거부한 출처를 부모에게 알린다(민감 정보 없음)
      try { window.parent.postMessage({ type: 'reject', got: String(e.origin) }, '*'); } catch (_) {}
      return;
    }
    var d = e.data || {};
    if (d.type !== 'cmd' || !player) return;
    if (d.cmd === 'play') player.playVideo();
    else if (d.cmd === 'pause') player.pauseVideo();
    else if (d.cmd === 'seek' && typeof d.value === 'number') player.seekTo(d.value, true);
    else if (d.cmd === 'rate' && typeof d.value === 'number') player.setPlaybackRate(d.value);
  });

  function status() {
    if (!player || typeof player.getCurrentTime !== 'function') return;
    send({
      type: 'status',
      time: player.getCurrentTime(),
      duration: player.getDuration(),
      state: player.getPlayerState(),
      rate: player.getPlaybackRate(),
    });
  }

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('player', {
      videoId: videoId,
      playerVars: { playsinline: 1, rel: 0, origin: location.origin, widget_referrer: location.href },
      events: {
        onReady: function () {
          send({ type: 'ready', origin: location.origin, rates: player.getAvailablePlaybackRates() });
          setInterval(status, 250);
        },
        onStateChange: status,
        onPlaybackRateChange: status,
        onError: function (e) { send({ type: 'error', code: e.data }); },
      },
    });
  };

  var s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
})();
