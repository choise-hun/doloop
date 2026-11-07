// CH-5: 진행 입력·수정 폼 (직접 입력 탭과 행 수정이 같이 쓴다)
// 코드 칩 미리보기 + 키 자동 추정(→ 드롭다운 확인) + 로마숫자 자동 계산
import React, { useMemo, useState } from 'react';
import { t } from '../../lib/i18n.mts';
import type { ProgressionDto, ProgressionInput } from '../../lib/apiClient';
import {
  KEYS,
  KIND_LABEL,
  checkChord,
  computeRomans,
  formToCreate,
  formToPatch,
  keyCandidates,
  patchTurnsManual,
  splitChordInput,
  validateForm,
} from './model.mts';
import type { ProgressionForm } from './model.mts';
import styles from './Progressions.module.css';

export interface ProgressionEditorProps {
  initial: ProgressionForm;
  original?: ProgressionDto; // 있으면 수정(PATCH), 없으면 추가(POST)
  submitLabel: string;
  onSubmit: (body: ProgressionInput) => Promise<void>;
  onCancel?: () => void;
  idPrefix: string;
}

export function ProgressionEditor({
  initial,
  original,
  submitLabel,
  onSubmit,
  onCancel,
  idPrefix,
}: ProgressionEditorProps): React.ReactElement {
  const [form, setForm] = useState<ProgressionForm>(initial);
  // 새 입력은 사용자가 키를 고르기 전까지 추정 1등을 따라간다. 수정은 저장된 키 그대로
  const [keyTouched, setKeyTouched] = useState<boolean>(Boolean(original) || Boolean(initial.key));
  // 수정: 키를 안 바꾸고 "다시 계산"도 안 누르면 같은 자리·같은 심볼의 원래 roman(AI 값 포함)을 유지
  const [recalc, setRecalc] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [saving, setSaving] = useState(false);

  const symbols = useMemo(() => splitChordInput(form.chordsText), [form.chordsText]);
  const guesses = useMemo(() => keyCandidates(symbols), [symbols]);
  const key = keyTouched ? form.key : guesses[0]?.key || '';
  const keepRomans = original && !recalc && key === (original.key || '') ? original.chords : undefined;
  const romans = useMemo(() => computeRomans(symbols, key, keepRomans), [symbols, key, keepRomans]);
  const checks = useMemo(() => symbols.map(checkChord), [symbols]);
  const badCount = checks.filter((c) => !c.ok).length;
  const fromVideo = Boolean(original && original.route !== 'manual');

  const set = <K extends keyof ProgressionForm>(k: K, v: ProgressionForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fid = (name: string) => `${idPrefix}-${name}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const full = { ...form, key };
    const err = validateForm(full, symbols);
    if (err) {
      setMsg({ text: err, kind: 'err' });
      return;
    }
    let body: ProgressionInput;
    if (original) {
      body = formToPatch(full, symbols, romans, original);
      if (Object.keys(body).length === 0) {
        setMsg({ text: t('prog.editorNoChanges'), kind: '' });
        return;
      }
      if (patchTurnsManual(body, original) && !window.confirm(t('prog.editorManualConfirm'))) {
        return;
      }
    } else {
      body = formToCreate(full, symbols, romans);
    }
    setSaving(true);
    setMsg({ text: t('prog.editorSaving'), kind: '' });
    try {
      await onSubmit(body);
      setMsg({ text: '', kind: '' });
    } catch (ex: any) {
      setMsg({ text: (ex && ex.message) || t('prog.editorSaveFailed'), kind: 'err' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.editor} onSubmit={handleSubmit} data-testid={`${idPrefix}-form`} noValidate>
      <div className={styles.field}>
          <span className={styles.lab}>{t('prog.editorKindGroup')}</span>
          <div className={styles.segment} role="group" aria-label={t('prog.editorKindGroup')}>
            {(['reference', 'analysis'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={form.kind === k}
                disabled={k === 'reference' && fromVideo}
                title={k === 'reference' && fromVideo ? t('prog.editorFromVideoDisabled') : undefined}
                onClick={() => set('kind', k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <span className="hint">
            {form.kind === 'reference' ? t('prog.editorDescReference') : t('prog.editorDescAnalysis')}
          </span>
        </div>

      <div className={styles.grid2}>
        <label className={styles.field}>
          <span className={styles.lab}>{form.kind === 'reference' ? t('prog.editorLabelSongTitle') : t('prog.editorLabelTitle')} <em>*</em></span>
          <input className="inpField" id={fid('title')} value={form.title} maxLength={300} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.lab}>
            {t('prog.editorLabelArtist')} {form.kind === 'reference' ? <em>*</em> : <span className="hint">{t('prog.editorOptionalHint')}</span>}
          </span>
          <input className="inpField" id={fid('artist')} value={form.artist} maxLength={200} onChange={(e) => set('artist', e.target.value)} />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.lab}>{t('prog.editorLabelChords')} <em>*</em></span>
        <input
          className="inpField"
          id={fid('chords')}
          value={form.chordsText}
          placeholder="FM7 - E7 - Am7 - Gm7 C7"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => set('chordsText', e.target.value)}
        />
        <span className="hint">{t('prog.editorChordsHelp')}</span>
      </label>

      {symbols.length > 0 && (
        <ol className={styles.chips} aria-label={t('prog.editorChipsAria')} data-testid={`${idPrefix}-chips`}>
          {checks.map((c, i) => (
            <li key={i} className={`${styles.chip} ${c.ok ? '' : styles.chipBad}`} data-ok={c.ok ? '1' : '0'} title={c.warning || undefined}>
              <span className={styles.chipSym}>{c.symbol}</span>
              <span className={styles.chipRoman}>{romans[i] || (c.ok ? '–' : '?')}</span>
              {c.warning && <span className={styles.chipWarn}>{c.ok ? '⚠ ' : '✕ '}{c.warning}</span>}
            </li>
          ))}
        </ol>
      )}
      {badCount > 0 && (
        <p className={styles.warnLine} role="note">
          {t('prog.editorBadChordsWarning', { count: badCount })}
        </p>
      )}

      <div className={styles.grid2}>
        <label className={styles.field}>
          <span className={styles.lab}>{t('prog.editorLabelKey')}</span>
          <select
            className="inpField"
            id={fid('key')}
            value={key}
            onChange={(e) => {
              setKeyTouched(true);
              set('key', e.target.value);
            }}
          >
            <option value="">{t('prog.editorKeyUnknown')}</option>
            {guesses.length > 0 && (
              <optgroup label={t('prog.editorKeyEstimated')}>
                {guesses.map((g, i) => (
                  <option key={'g' + g.key} value={g.key}>
                    {g.key}{i === 0 ? t('prog.editorKeyRecommended') : ''}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={t('prog.editorKeyAll')}>
              {KEYS.filter((k) => !guesses.some((g) => g.key === k)).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="hint" data-testid={`${idPrefix}-keyHint`}>
            {!keyTouched && guesses[0] ? t('prog.editorKeyHelp') : ' '}
          </span>
        </label>
        <div className={styles.field}>
          <span className={styles.lab}>{t('prog.editorLabelRoman')}</span>
          <output className={styles.romanOut} id={fid('roman')}>
            {romans.some(Boolean) ? romans.map((r) => r || '?').join(' - ') : t('prog.editorRomanHelp')}
          </output>
          {original && keepRomans && (
            <button type="button" className={styles.linkBtn} onClick={() => setRecalc(true)}>
              {t('prog.editorRecomputeRomans')}
            </button>
          )}
        </div>
      </div>

      <details className={styles.more} open={Boolean(initial.part || initial.moods || initial.genres || initial.tags || initial.url || initial.memo)}>
        <summary>{t('prog.editorMoreDetailsSummary')}</summary>
        <div className={styles.grid2}>
          <label className={styles.field}>
            <span className={styles.lab}>{t('prog.editorLabelPart')}</span>
            <input className="inpField" id={fid('part')} value={form.part} maxLength={100} placeholder={t('prog.editorPartPlaceholder')} onChange={(e) => set('part', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.lab}>{t('prog.editorLabelAlbum')}</span>
            <input className="inpField" id={fid('album')} value={form.album} maxLength={200} onChange={(e) => set('album', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.lab}>Mood</span>
            <input className="inpField" id={fid('moods')} value={form.moods} placeholder="nostalgia, dreamy" onChange={(e) => set('moods', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.lab}>Genre</span>
            <input className="inpField" id={fid('genres')} value={form.genres} placeholder="RnB, Neo Soul" onChange={(e) => set('genres', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.lab}>Tag</span>
            <input className="inpField" id={fid('tags')} value={form.tags} placeholder={t('prog.editorTagsPlaceholder')} onChange={(e) => set('tags', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.lab}>{t('prog.editorLabelReleaseDate')}</span>
            <input className="inpField" id={fid('releaseDate')} type="date" min="1900-01-01" max="2100-12-31" value={form.releaseDate} onChange={(e) => set('releaseDate', e.target.value)} />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.lab}>{t('prog.editorLabelUrl')}</span>
          <input className="inpField" id={fid('url')} type="url" value={form.url} maxLength={500} placeholder="https://" onChange={(e) => set('url', e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.lab}>{t('prog.editorLabelMemo')}</span>
          <textarea className="inpField" id={fid('memo')} value={form.memo} maxLength={2000} onChange={(e) => set('memo', e.target.value)} />
        </label>
      </details>

      <div className={styles.actions}>
        <button className="pillBtn" type="submit" id={fid('submit')} disabled={saving}>
          {submitLabel}
        </button>
        {onCancel && (
          <button className="ghostBtn" type="button" onClick={onCancel} disabled={saving}>
            {t('prog.editorCancelBtn')}
          </button>
        )}
      </div>
      <p className={`msg${msg.kind ? ' ' + msg.kind : ''}`} role="status" id={fid('msg')}>
        {msg.text}
      </p>
    </form>
  );
}
