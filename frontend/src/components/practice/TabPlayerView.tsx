import React, { useEffect, useRef } from 'react';
import { t, type I18nKey } from '../../lib/i18n.mts';
import type { TabViewState } from '../../lib/tabEngine';
import styles from './TabPlayer.module.css';

export function TabPlayerView({ visible, view, status, retry, host, scroll, onTrack, onMix, onMetronome }: {
  visible: boolean;
  view: TabViewState | null;
  status: { key: I18nKey; retry: boolean } | null;
  retry(): void;
  host: React.RefObject<HTMLDivElement>;
  scroll: React.RefObject<HTMLDivElement>;
  onTrack(index: number, staff: boolean): void;
  onMix(index: number, update: Partial<{ mute: boolean; solo: boolean; volume: number }>): void;
  onMetronome(): void;
}) {
  const mixer = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 961px)');
    const adjust = () => { if (mixer.current) mixer.current.open = media.matches; };
    adjust();
    media.addEventListener('change', adjust);
    return () => media.removeEventListener('change', adjust);
  }, []);
  return (
    <div className={styles.stage} data-tab-visible={visible} aria-hidden={!visible || undefined}>
      <section className={styles.score} aria-label={t('tab.score')} data-align-group="tab-stage:top@961">
        {view && (
          <div className={styles.toolbar}>
            <button type="button" className="pillBtn" aria-pressed={!view.staff} onClick={() => onTrack(view.selected, false)}>{t('tab.tab')}</button>
            <button type="button" className="pillBtn" aria-pressed={view.staff} onClick={() => onTrack(view.selected, true)}>{t('tab.staff')}</button>
            <button type="button" className="pillBtn" aria-pressed={view.metronome} onClick={onMetronome}>{t('tab.metronome')}</button>
          </div>
        )}
        <div className={styles.viewport} ref={scroll} tabIndex={view ? 0 : -1} aria-label={t('tab.score')} data-testid="tab-score" data-ready={Boolean(view)}>
          <div className={styles.host} ref={host} />
          {status && (
            <div className={styles.status} role="status">
              <b>{t(status.key)}</b>
              {status.retry && <button type="button" className="pillBtn" onClick={retry}>{t('tab.retry')}</button>}
            </div>
          )}
        </div>
      </section>
      <details className={styles.mixer} ref={mixer} hidden={!view} data-align-group="tab-stage:top@961">
        <summary>{t('tab.mixer')}</summary>
        {view && (
          <div className={styles.trackList}>
            <label>{t('tab.displayTrack')}
              <select value={view.selected} onChange={(event) => onTrack(Number(event.target.value), view.staff)}>
                {view.tracks.map((track, index) => <option key={index} value={index}>{track.name || index + 1}</option>)}
              </select>
            </label>
            {view.tracks.map((track, index) => {
              const name = track.name || String(index + 1);
              return (
                <div className={styles.track} key={index}>
                  <strong>{name}</strong>
                  <div className={styles.toolbar}>
                    <button type="button" className="pillBtn" aria-label={name + ' ' + t('tab.solo')} aria-pressed={track.solo} onClick={() => onMix(index, { solo: !track.solo })}>{t('tab.solo')}</button>
                    <button type="button" className="pillBtn" aria-label={name + ' ' + t('tab.mute')} aria-pressed={track.mute} onClick={() => onMix(index, { mute: !track.mute })}>{t('tab.mute')}</button>
                  </div>
                  <label>{t('tab.volume')}
                    <input type="range" min={0} max={100} value={track.volume} aria-label={name + ' ' + t('tab.volume')}
                      onChange={(event) => onMix(index, { volume: Number(event.target.value) })} />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </details>
    </div>
  );
}
