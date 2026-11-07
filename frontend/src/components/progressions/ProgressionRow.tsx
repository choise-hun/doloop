// CH-5: 진행 목록 한 행 — 요약(코드·로마숫자) + 주 버튼(연습실) + 펼침 상세(코드 칩·메모·출처) + 수정·삭제
import React, { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/i18n.mts';
import { SafeLink } from '../common/SafeLink';
import type { ProgressionDto, ProgressionInput } from '../../lib/apiClient';
import { safeUrl } from '../../lib/security';
import {
  KIND_LABEL,
  ORIGIN_LABEL,
  ROUTE_LABEL,
  chordLine,
  checkChord,
  formFromDto,
  formatSec,
  loopHref,
  playHref,
  romanLine,
} from './model.mts';
import { ProgressionEditor } from './ProgressionEditor';
import styles from './Progressions.module.css';

export interface ProgressionRowProps {
  p: ProgressionDto;
  seed?: boolean; // 비로그인 기본 시드: 수정·삭제 없음
  initiallyOpen?: boolean;
  onUpdate?: (id: string, patch: ProgressionInput) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
}

export function ProgressionRow({ p, seed, initiallyOpen, onUpdate, onRemove }: ProgressionRowProps): React.ReactElement {
  const [open, setOpen] = useState(Boolean(initiallyOpen));
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState('');
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (initiallyOpen && rowRef.current) rowRef.current.scrollIntoView({ block: 'center' });
  }, [initiallyOpen]);

  const roman = romanLine(p);
  const loop = loopHref(p);
  const meta = [p.key || t('prog.rowKeyUnknown'), ORIGIN_LABEL[p.origin] || p.origin, p.origin === 'ai' && p.evidence ? t('prog.rowAiEvidence', { evidence: p.evidence }) : '']
    .filter(Boolean)
    .join(' · ');
  const sub = [p.artist || p.channel, p.part].filter(Boolean).join(' · ');
  const range = p.startSec !== null || p.endSec !== null ? [formatSec(p.startSec), formatSec(p.endSec)].filter(Boolean).join('–') : '';

  const remove = async () => {
    if (!onRemove) return;
    const extra = p.noteId ? t('prog.rowDeleteExtra') : '';
    if (!window.confirm(t('prog.rowDeleteConfirm', { title: p.title, extra }))) return;
    setErr('');
    try {
      await onRemove(p.id);
    } catch (ex: any) {
      setErr((ex && ex.message) || t('prog.rowDeleteFailed'));
    }
  };

  return (
    <li ref={rowRef} className={styles.row} data-progression={p.id} data-kind={p.kind} id={`p-${p.id}`}>
      <div className={styles.rowHead}>
        <button
          type="button"
          className={styles.rowToggle}
          aria-expanded={open}
          aria-controls={`pd-${p.id}`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.rowTitle}>{p.title}</span>
          {sub && <span className={styles.rowSub}>{sub}</span>}
          <span className={styles.rowMeta}>
            <span className={styles.kindBadge}>{KIND_LABEL[p.kind]}</span> {meta}
            {seed ? t('prog.rowBadgeBasic') : ''}
          </span>
          <span className={styles.rowChords}>{chordLine(p)}</span>
          {roman && <span className={styles.rowRoman}>{roman}</span>}
        </button>
        <div className={styles.rowActs}>
          <SafeLink className="pillBtn" href={playHref(p)} data-act="play">
            {t('prog.rowPlayPrompt')}
          </SafeLink>
          {loop && (
            <SafeLink className="ghostBtn" href={loop} data-act="loop">
              {t('prog.rowLoopSection')}
            </SafeLink>
          )}
          {p.noteId && (
            <SafeLink className="ghostBtn" href={`note.html?id=${encodeURIComponent(p.noteId)}`} data-act="note">
              {t('prog.rowNote')}
            </SafeLink>
          )}
        </div>
      </div>

      {open && (
        <div className={styles.detail} id={`pd-${p.id}`}>
          {editing && onUpdate ? (
            <ProgressionEditor
              idPrefix={`edit-${p.id.slice(0, 8)}`}
              initial={formFromDto(p)}
              original={p}
              submitLabel={t('prog.rowSaveEdit')}
              onCancel={() => setEditing(false)}
              onSubmit={async (patch) => {
                await onUpdate(p.id, patch);
                setEditing(false);
              }}
            />
          ) : (
            <>
              <ol className={styles.chips} aria-label={t('prog.rowChipsAria')}>
                {p.chords.map((c, i) => {
                  const chk = checkChord(c.symbol);
                  return (
                    <li key={i} className={`${styles.chip} ${chk.ok ? '' : styles.chipBad}`} title={chk.warning || undefined}>
                      <span className={styles.chipSym}>{c.symbol}</span>
                      <span className={styles.chipRoman}>{c.roman || '–'}</span>
                      {(c.source || c.timestamp) && (
                        <span className={styles.chipNote}>{[c.source, c.timestamp].filter(Boolean).join(' · ')}</span>
                      )}
                      {chk.warning && <span className={styles.chipWarn}>{chk.ok ? '⚠ ' : '✕ '}{chk.warning}</span>}
                    </li>
                  );
                })}
              </ol>
              <dl className={styles.facts}>
                <dt>{t('prog.rowColRoute')}</dt>
                <dd>{seed ? t('prog.rowRouteBasic') : ROUTE_LABEL[p.route] || p.route}</dd>
                {p.instrument && (
                  <>
                    <dt>{t('prog.rowColInst')}</dt>
                    <dd>{p.instrument}</dd>
                  </>
                )}
                {range && (
                  <>
                    <dt>{t('prog.rowColRange')}</dt>
                    <dd>{range}</dd>
                  </>
                )}
                {p.album && (
                  <>
                    <dt>{t('prog.rowColAlbum')}</dt>
                    <dd>{p.album}</dd>
                  </>
                )}
                {p.releaseDate && (
                  <>
                    <dt>{t('prog.rowColReleaseDate')}</dt>
                    <dd>{p.releaseDate}</dd>
                  </>
                )}
                {[...p.moods, ...p.genres, ...p.tags].length > 0 && (
                  <>
                    <dt>Mood·Genre·Tag</dt>
                    <dd className={styles.tagList}>
                      {p.moods.map((t) => <span key={'m' + t}>{t}</span>)}
                      {p.genres.map((t) => <span key={'g' + t}>{t}</span>)}
                      {p.tags.map((t) => <span key={'t' + t}>#{t}</span>)}
                    </dd>
                  </>
                )}
                {p.url && (
                  <>
                    <dt>{t('prog.rowColLink')}</dt>
                    <dd>
                      <SafeLink href={safeUrl(p.url)} external>
                        {p.url} ↗
                      </SafeLink>
                    </dd>
                  </>
                )}
              </dl>
              {p.memo && <p className={styles.memo}>{p.memo}</p>}
              {!seed && (
                <div className={styles.actions}>
                  <button type="button" className="ghostBtn" data-act="edit" onClick={() => setEditing(true)}>
                    {t('prog.rowBtnEdit')}
                  </button>
                  <button type="button" className="ghostBtn" data-act="delete" onClick={remove}>
                    {t('prog.rowBtnDelete')}
                  </button>
                </div>
              )}
              {err && (
                <p className="msg err" role="alert">
                  {err}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
