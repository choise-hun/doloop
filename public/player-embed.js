// M1A-2 플레이어 전용 페이지(player-embed.html): 부모(앱) ↔ YouTube IFrame API 다리. 명세 §5.2·§5.3
// 부모 → {type:'cmd', cmd:'play'|'pause'|'seek'|'rate'|'cue', value}
// 플레이어 → {type:'ready', duration, rates, title, author} · {type:'status', time, duration, state, rate, title, author} · {type:'error', code}
// 로그인·저장소 접근 없음. 겹치는 요소 없음(YouTube RMF).
'use strict';
(function () {
  var ALLOWED_PARENTS = ['capacitor://localhost', 'https://localhost'];
  var VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  var q = new URLSearchParams(location.search);
  var parentOrigin = ALLOWED_PARENTS.indexOf(q.get('parent')) >= 0 ? q.get('parent') : null;
  if (!parentOrigin || window.parent === window) return;

  var root = document.documentElement.style;
  root.height = '100%';
  root.background = '#000';
  document.body.style.margin = '0';
  document.body.style.height = '100%';

  function send(msg) {
    window.parent.postMessage(msg, parentOrigin);
  }

  var videoId = q.get('v') || '';
  if (!VIDEO_ID.test(videoId)) {
    send({ type: 'error', code: 'bad-video' });
    return;
  }
  var startRaw = Number(q.get('start'));
  var start = Number.isFinite(startRaw) && startRaw >= 0 ? startRaw : 0;
  var player = null;
  var ready = false;

  function videoMeta() {
    var d = typeof player.getVideoData === 'function' ? player.getVideoData() || {} : {};
    return { title: typeof d.title === 'string' ? d.title : '', author: typeof d.author === 'string' ? d.author : '' };
  }

  function status() {
    if (!ready) return;
    var meta = videoMeta();
    send({
      type: 'status',
      time: player.getCurrentTime(),
      duration: player.getDuration(),
      state: player.getPlayerState(),
      rate: player.getPlaybackRate(),
      title: meta.title,
      author: meta.author,
    });
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== parentOrigin || e.source !== window.parent) return;
    var d = e.data || {};
    if (d.type !== 'cmd' || !ready) return;
    if (d.cmd === 'play') player.playVideo();
    else if (d.cmd === 'pause') player.pauseVideo();
    else if (d.cmd === 'seek' && typeof d.value === 'number' && Number.isFinite(d.value)) player.seekTo(d.value, true);
    else if (d.cmd === 'rate' && typeof d.value === 'number' && Number.isFinite(d.value)) player.setPlaybackRate(d.value);
    else if (d.cmd === 'cue' && d.value && VIDEO_ID.test(d.value.videoId || '')) {
      var s = Number(d.value.startSeconds);
      player.cueVideoById({ videoId: d.value.videoId, startSeconds: Number.isFinite(s) && s >= 0 ? s : 0 });
    }
  });

  window.onYouTubeIframeAPIReady = function () {
    player = new window.YT.Player('player', {
      width: '100%',
      height: '100%',
      videoId: videoId,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: start, origin: location.origin, widget_referrer: location.href },
      events: {
        onReady: function () {
          ready = true;
          var meta = videoMeta();
          send({ type: 'ready', duration: player.getDuration(), rates: player.getAvailablePlaybackRates(), title: meta.title, author: meta.author });
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
