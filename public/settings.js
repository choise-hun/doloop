// 설정(settings.html): 계정(로그인·로그아웃·계정 삭제), 노션 연결, 학습 노트 토큰, 노션 바로가기, 화면 모드
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const { raw, json, notion, gh, safeUrl } = UL;
  const auth = window.ULAuth;
  function say(id, text, cls) { $(id).textContent = text; $(id).className = 'msg' + (cls ? ' ' + cls : ''); }

  // ---------- 노션 템플릿 · 데이터 내보내기/가져오기 (K3-1) ----------
  let currentPreviewToken = null;
  let activeUid = null;

  const templateAnchor = $('btnNotionTemplate');
  if (templateAnchor && window.ULEVELP_CONFIG && window.ULEVELP_CONFIG.notionTemplateUrl) {
    const url = safeUrl(window.ULEVELP_CONFIG.notionTemplateUrl);
    if (url) templateAnchor.href = safeUrl(window.ULEVELP_CONFIG.notionTemplateUrl);
  }

  if ($('btnExportZip')) {
    $('btnExportZip').addEventListener('click', async () => {
      say('nxMsg', '');
      const user = auth && typeof auth.getUser === 'function' ? auth.getUser() : null;
      if (!user) {
        return say('nxMsg', '로그인 후 내보낼 수 있어요.', 'err');
      }
      const btn = $('btnExportZip');
      btn.disabled = true;
      say('nxMsg', 'ZIP 내보내는 중…');
      try {
        const includeAudio = $('chkExportAudio') ? $('chkExportAudio').checked : true;
        const res = await window.ULData.nx.exportZip(includeAudio);
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a['href'] = url;
        a.download = res.filename || 'ULeveLP-export.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        say('nxMsg', '✓ 내보내기를 완료했어요.', 'ok');
      } catch (e) {
        say('nxMsg', e.message || '내보내기 중 오류가 발생했어요.', 'err');
      } finally {
        btn.disabled = false;
      }
    });
  }

  if ($('btnPreviewZip')) {
    $('btnPreviewZip').addEventListener('click', async () => {
      say('nxMsg', '');
      const user = auth && typeof auth.getUser === 'function' ? auth.getUser() : null;
      if (!user) {
        return say('nxMsg', '로그인 후 가져올 수 있어요.', 'err');
      }
      const fileInp = $('inpImportZip');
      const file = fileInp && fileInp.files && fileInp.files[0];
      if (!file) {
        return say('nxMsg', 'ZIP 파일을 선택해 주세요.', 'err');
      }
      const btn = $('btnPreviewZip');
      btn.disabled = true;
      say('nxMsg', 'ZIP 분석 중…');
      try {
        const r = await window.ULData.nx.previewNotionZip(file);
        currentPreviewToken = r.previewToken;
        const summaryText = '신규 곡 ' + (r.newSongs || 0) + '개 · 갱신 곡 ' + (r.updatedSongs || 0) + '개 · 연습 기록 ' + (r.sessions || 0) + '건 · 녹음 ' + (r.takes || 0) + '건' + (r.errors && r.errors.length ? ' (오류 ' + r.errors.length + '건)' : '');
        $('nxPreviewSummary').textContent = summaryText;

        const listEl = $('nxPreviewList');
        listEl.replaceChildren();

        if (Array.isArray(r.songsSample)) {
          r.songsSample.forEach((s) => {
            const li = document.createElement('li');
            const tag = s.isNew ? '[신규] ' : '[갱신] ';
            li.textContent = tag + (s.title || '(제목 없음)') + (s.artist ? ' · ' + s.artist : '');
            listEl.appendChild(li);
          });
        }

        if (Array.isArray(r.errors)) {
          r.errors.forEach((e) => {
            const li = document.createElement('li');
            li.className = 'err';
            li.textContent = '[오류] ' + (e.file || '파일') + ' ' + (e.row != null ? e.row + '행: ' : '') + (e.reason || '');
            listEl.appendChild(li);
          });
        }

        $('nxPreviewBox').hidden = false;
        say('nxMsg', '');
      } catch (e) {
        currentPreviewToken = null;
        if ($('nxPreviewBox')) $('nxPreviewBox').hidden = true;
        say('nxMsg', e.message || '미리보기 중 오류가 발생했어요.', 'err');
      } finally {
        btn.disabled = false;
      }
    });
  }

  if ($('btnConfirmZip')) {
    $('btnConfirmZip').addEventListener('click', async () => {
      say('nxMsg', '');
      if (!currentPreviewToken) {
        return say('nxMsg', '미리보기 내역이 없습니다. 다시 ZIP을 선택해 주세요.', 'err');
      }
      const btn = $('btnConfirmZip');
      btn.disabled = true;
      say('nxMsg', '가져오기 반영 중…');
      try {
        const r = await window.ULData.nx.confirmNotionZip(currentPreviewToken);
        const doneText = '✓ 가져오기를 완료했어요 (신규 곡 ' + (r.createdSongs || 0) + '개, 갱신 ' + (r.updatedSongs || 0) + '개, 기록 ' + (r.upsertedSessions || 0) + '건, 녹음 ' + (r.importedTakes || 0) + '건)';
        say('nxMsg', doneText, 'ok');
        currentPreviewToken = null;
        if ($('nxPreviewBox')) $('nxPreviewBox').hidden = true;
        if ($('nxPreviewList')) $('nxPreviewList').replaceChildren();
        if ($('inpImportZip')) $('inpImportZip').value = '';
      } catch (e) {
        say('nxMsg', e.message || '가져오기 확정 중 오류가 발생했어요.', 'err');
      } finally {
        btn.disabled = false;
      }
    });
  }

  if ($('btnCancelZip')) {
    $('btnCancelZip').addEventListener('click', () => {
      currentPreviewToken = null;
      if ($('nxPreviewBox')) $('nxPreviewBox').hidden = true;
      if ($('nxPreviewList')) $('nxPreviewList').replaceChildren();
      say('nxMsg', '가져오기를 취소했어요.');
    });
  }

  if (auth && $('account')) {
    const embedded = auth.isEmbedded();
    if (embedded) {
      $('btnLogin').hidden = true;
      $('btnLoginBlank').hidden = false;
    }
    auth.onChange((st) => {
      const signedIn = !!(st.user);
      $('accGuest').hidden = signedIn;
      $('accUser').hidden = !signedIn;
      if (signedIn) {
        const email = (st.me && st.me.email) || st.user.email || '';
        const name = (st.me && st.me.displayName) || '';
        $('accEmail').textContent = email;
        $('accName').textContent = name && name !== email.split('@')[0] ? '(' + name + ')' : '';
      } else {
        $('accEmail').textContent = '';
        $('accName').textContent = '';
      }

      const nextUid = st.user ? st.user.id : null;
      if (!nextUid || nextUid !== activeUid) {
        activeUid = nextUid;
        currentPreviewToken = null;
        if ($('nxPreviewBox')) $('nxPreviewBox').hidden = true;
        if ($('nxPreviewList')) $('nxPreviewList').replaceChildren();
        if ($('nxMsg')) say('nxMsg', '');
        if ($('inpImportZip')) $('inpImportZip').value = '';
      }
    });

    $('btnLogin').addEventListener('click', async () => {
      say('accMsg', '');
      try {
        await auth.signIn(location.href);
      } catch (e) {
        say('accMsg', e.message || '로그인을 시작하지 못했어요.', 'err');
      }
    });

    $('btnLogout').addEventListener('click', async () => {
      $('btnLogout').disabled = true;
      try {
        await auth.signOut();
        say('accMsg', '✓ 로그아웃했어요', 'ok');
      } catch (e) {
        say('accMsg', e.message || '로그아웃 중 오류가 발생했어요.', 'err');
      } finally {
        $('btnLogout').disabled = false;
      }
    });

    $('btnDeleteAcc').addEventListener('click', async () => {
      const confirmVal = $('delConfirm').value.trim();
      if (confirmVal !== '삭제합니다') {
        return say('accMsg', '확인 문구로 "삭제합니다"를 정확히 입력해 주세요.', 'err');
      }
      $('btnDeleteAcc').disabled = true;
      say('accMsg', '계정 삭제 처리 중…');
      try {
        await auth.deleteAccount(confirmVal);
        $('delConfirm').value = '';
        say('accMsg', '✓ 계정이 삭제되었어요.', 'ok');
      } catch (e) {
        say('accMsg', e.message || '계정 삭제에 실패했어요.', 'err');
      } finally {
        $('btnDeleteAcc').disabled = false;
      }
    });
  }

  // ---------- 노션 연결 (practice.js와 같은 키, JSON 형식) ----------
  $('apiUrl').value = notion.url();
  $('apiKey').value = notion.key();
  $('apiSave').addEventListener('click', async () => {
    json.set('pp-api', $('apiUrl').value.trim());
    json.set('pp-key', $('apiKey').value.trim());
    if (!notion.ok()) return say('apiMsg', '주소와 비밀 키를 모두 넣어주세요', 'err');
    say('apiMsg', '확인 중…');
    try {
      const r = await notion.call('/health');
      say('apiMsg', '✓ 연결됨 (' + r.songsTitle + ' · ' + r.sessionsTitle + (r.maxUploadMB ? ' · 파일 ' + r.maxUploadMB + 'MB까지' : '') + ')', 'ok');
    } catch (e) { say('apiMsg', e.message, 'err'); }
  });

  // ---------- 학습 노트 ----------
  $('ghToken').value = gh.token();
  $('ghRepo').value = raw.get('sn-repo');
  $('ghRepo').placeholder = gh.inferRepo() || 'owner/repo';
  $('ghRepoHint').textContent = gh.inferRepo() ? '비워 두면 이 페이지 주소에서 알아낸 ' + gh.inferRepo() + '을(를) 써요.' : 'github.io가 아닌 곳에서 열었으면 직접 넣어주세요.';
  $('ghSave').addEventListener('click', async () => {
    raw.set('sn-token', $('ghToken').value.trim());
    raw.set('sn-repo', $('ghRepo').value.trim());
    if (!gh.ok()) return say('ghMsg', '토큰과 저장소를 넣어주세요', 'err');
    say('ghMsg', '확인 중…');
    try {
      await gh.call('/actions/workflows/analyze.yml');
      say('ghMsg', '✓ ' + gh.repo() + '의 분석 워크플로를 찾았어요', 'ok');
    } catch (e) { say('ghMsg', e.message, 'err'); }
  });

  // ---------- 노션 바로가기 ----------
  $('nlPractice').value = raw.get('ulp:notion-practice');
  $('nlNotes').value = raw.get('ulp:notion-notes');
  $('nlSave').addEventListener('click', () => {
    raw.set('ulp:notion-practice', $('nlPractice').value.trim());
    raw.set('ulp:notion-notes', $('nlNotes').value.trim());
    say('nlMsg', '✓ 저장했어요', 'ok');
  });

  // ---------- 화면 모드 (chords.html의 라이트/다크 버튼과 같은 키) ----------
  const themeBtns = document.querySelectorAll('.seg-pill [data-theme]');
  function renderTheme() {
    const cur = raw.get('ulp:theme');
    themeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === cur)));
  }
  themeBtns.forEach((b) => b.addEventListener('click', () => {
    raw.set('ulp:theme', b.dataset.theme);
    if (b.dataset.theme) document.documentElement.dataset.theme = b.dataset.theme;
    else delete document.documentElement.dataset.theme;
    renderTheme();
  }));
  renderTheme();
})();
