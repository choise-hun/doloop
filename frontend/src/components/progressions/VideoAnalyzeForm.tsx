// CH-5: 코드 진행 영상 — URL + 메모 → POST /progressions/analyze (작업 큐, 결과는 목록 맨 위 작업 줄에서)
// GA-2: 구간(시작~끝) + 코드 진행 변화 속도(느림·보통·빠름 → 초당 캡처량). 개발산출물/진행_분석설정.md §3-2
// GA-4: 중복 방지 — 누르는 순간 ref 잠금, 분석 중이면 버튼 잠금, 409 DUPLICATE_ANALYSIS면 "다시 분석"(force)
// M1-3c: Gemini는 서버 키 + 크레딧 — 분석 가능 여부는 /me limits.ai(무료 false), 오류 문구는 describeAnalyzeRequestError
import React, { useRef, useState } from 'react';
import { SafeLink } from '../common/SafeLink';
import { apiClient } from '../../lib/apiClient';
import { describeAnalyzeRequestError } from '../../lib/jobError.mts';
import { t } from '../../lib/i18n.mts';
import { thumb, videoIdFrom } from '../../lib/security';
import { PACES, PACE_LABEL, checkRange } from './model.mts';
import type { Pace } from './model.mts';
import styles from './Progressions.module.css';

export interface VideoAnalyzeFormProps {
  /** AI 분석을 쓸 수 있는 티어(/me limits.ai) */
  aiAllowed: boolean;
  onRequested: (jobId: string) => void;
  /** 이 화면의 코드 진행 분석이 대기·진행 중(서버 동시 1건 제한) */
  busy?: boolean;
}

export function VideoAnalyzeForm({ aiAllowed, onRequested, busy = false }: VideoAnalyzeFormProps): React.ReactElement {
  const [url, setUrl] = useState('');
  const [memo, setMemo] = useState('');
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [pace, setPace] = useState<Pace>('normal');
  const [msg, setMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [sending, setSending] = useState(false);
  const [confirmDup, setConfirmDup] = useState(false); // 409 뒤 한 번 더 누르면 force
  const sendingRef = useRef(false); // state 반영 전 같은 순간의 두 번째 클릭 막기
  const vid = videoIdFrom(url);

  // 입력이 바뀌면 "다시 분석" 확인을 풀고 처음 상태로
  function edited<T>(set: (v: T) => void): (v: T) => void {
    return (v: T) => {
      setConfirmDup(false);
      set(v);
    };
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sendingRef.current || busy) return;
    if (!vid) {
      setMsg({ text: t('prog.videoNotYoutube'), kind: 'err' });
      return;
    }
    const range = checkRange(startText, endText);
    if (range.error) {
      setMsg({ text: range.error, kind: 'err' });
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setMsg({ text: t('prog.videoSending'), kind: '' });
    try {
      const r = await apiClient.progressions.analyze({
        url: `https://www.youtube.com/watch?v=${vid}`,
        memo: memo.trim(),
        startSec: range.startSec,
        endSec: range.endSec,
        pace,
        force: confirmDup,
      });
      setConfirmDup(false);
      const reserved = typeof r.reservedCredits === 'number' ? t('prog.videoReservedCredits', { credits: r.reservedCredits }) : '';
      setMsg({ text: t('prog.videoSuccess', { reserved }), kind: 'ok' });
      setUrl('');
      setMemo('');
      setStartText('');
      setEndText('');
      setPace('normal');
      onRequested(r.jobId);
    } catch (err: any) {
      if (err && err.code === 'DUPLICATE_ANALYSIS') {
        setConfirmDup(true);
        setMsg({ text: t('prog.videoDupNotice'), kind: 'err' });
      } else {
        setMsg({ text: describeAnalyzeRequestError(err), kind: 'err' });
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <form className={styles.editor} onSubmit={submit} data-testid="videoForm" noValidate>
      <p className={styles.intro}>
        {t('prog.videoIntroPre')}
        {t('prog.videoIntroPost')}
      </p>
      {!aiAllowed && (
        <div className={styles.keyGate} id="progKeyGate">
          <span>{t('prog.videoProNotice')}</span>
          <SafeLink href="settings.html#credits">{t('prog.videoViewCredits')}</SafeLink>
        </div>
      )}
      <label className={styles.field}>
        <span className={styles.lab}>{t('prog.videoLabelUrl')}</span>
        <input
          className="inpField"
          id="progVideoUrl"
          type="url"
          value={url}
          placeholder="https://www.youtube.com/watch?v=..."
          autoComplete="off"
          onChange={(e) => edited(setUrl)(e.target.value)}
        />
      </label>
      {vid && (
        <div className={styles.videoPreview}>
          <img src={thumb(vid)} alt="" />
          <span className="hint">{t('prog.videoConfirmed')}</span>
        </div>
      )}
      <div className={styles.grid2}>
        <label className={styles.field}>
          <span className={styles.lab}>
            {t('prog.videoLabelStart')} <span className="hint">{t('prog.editorOptionalHint')}</span>
          </span>
          <input
            className="inpField"
            id="progVideoStart"
            type="text"
            inputMode="numeric"
            value={startText}
            placeholder={t('prog.videoStartPlaceholder')}
            autoComplete="off"
            onChange={(e) => edited(setStartText)(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.lab}>
            {t('prog.videoLabelEnd')} <span className="hint">{t('prog.editorOptionalHint')}</span>
          </span>
          <input
            className="inpField"
            id="progVideoEnd"
            type="text"
            inputMode="numeric"
            value={endText}
            placeholder={t('prog.videoEndPlaceholder')}
            autoComplete="off"
            onChange={(e) => edited(setEndText)(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.field}>
        <span className={styles.lab} id="progVideoPaceLab">
          {t('prog.videoPaceLabel')}
        </span>
        <div className={styles.segment} role="group" aria-labelledby="progVideoPaceLab" id="progVideoPace">
          {PACES.map((p) => (
            <button key={p} type="button" data-pace={p} aria-pressed={pace === p} onClick={() => edited(setPace)(p)}>
              {PACE_LABEL[p]}
            </button>
          ))}
        </div>
        <span className="hint">
          {t('prog.videoPaceHelp')}
        </span>
      </div>
      <label className={styles.field}>
        <span className={styles.lab}>
          {t('prog.videoLabelMemo')} <span className="hint">{t('prog.editorOptionalHint')}</span>
        </span>
        <textarea
          className="inpField"
          id="progVideoMemo"
          value={memo}
          maxLength={2000}
          placeholder={t('prog.videoMemoPlaceholder')}
          onChange={(e) => setMemo(e.target.value)}
        />
      </label>
      <div className={styles.actions}>
        <button className="pillBtn" type="submit" id="progVideoSubmit" disabled={sending || busy || !aiAllowed}>
          {busy ? t('prog.videoBtnBusy') : confirmDup ? t('prog.videoBtnReanalyze') : t('prog.videoBtnRequest')}
        </button>
      </div>
      <p className={styles.betaNotice} id="progBetaNotice">
        {t('beta.notice')}
      </p>
      <p className={`msg${msg.kind ? ' ' + msg.kind : ''}`} role="status" id="progVideoMsg">
        {msg.text}
      </p>
    </form>
  );
}
