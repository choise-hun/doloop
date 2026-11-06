// frontend/src/components/ops/OpsPanel.tsx
// 설정 맨 아래 "운영 (owner 전용)" 접힘 섹션 (M2-4a, 개발산출물/진행_운영화면.md §2 O1~O4).
// 보일지는 /me role로 정하지만 권한 판정은 서버(/admin OwnerOnlyPlugin)다. 펼치기 전에는 /admin 요청을 보내지 않는다.
// 문구는 한국어 고정(O2 — owner 혼자 쓴다). L1-2a 하드코딩 한글 검사에서 components/ops/는 예외
import React, { useState } from 'react';
import { apiClient, AdminUserDto } from '../../lib/apiClient';
import { tierLabel } from '../../lib/jobError.mts';
import s from '../../pages/SettingsPage.module.css';
import o from './Ops.module.css';

const FORBIDDEN_TEXT = 'owner 권한이 없어요. 계정 역할이 바뀌었으면 다시 로그인해 주세요.';
const BADGE_MAX = 20;
const BIO_MAX = 200;
const REASON_MAX = 200;

function defaultCreatorReason(wasCreator: boolean, isCreator: boolean): string {
  if (!isCreator) return wasCreator ? '크리에이터 해제' : '크리에이터 정보 변경';
  return wasCreator ? '크리에이터 정보 변경' : '크리에이터 지정';
}
const DEFAULT_REASONS = ['크리에이터 지정', '크리에이터 해제', '크리에이터 정보 변경'];

function errText(e: any, fallback: string): string {
  return (e && e.message) || fallback;
}

export function OpsPanel(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  // 크리에이터 지정
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [target, setTarget] = useState<AdminUserDto | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [badge, setBadge] = useState('');
  const [bio, setBio] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });

  // /admin 403 = 역할이 바뀐 경우 → 폼을 숨기고 안내 한 줄
  const handleError = (e: any, fallback: string): void => {
    if (e && e.status === 403) {
      setForbidden(true);
      return;
    }
    setMsg({ text: errText(e, fallback), kind: 'err' });
  };

  const pickUser = (u: AdminUserDto | null): void => {
    setTarget(u);
    setIsCreator(u ? u.isCreator : false);
    setBadge(u && u.creatorBadge ? u.creatorBadge : '');
    setBio(u ? u.creatorBio || '' : '');
    setReason(u ? defaultCreatorReason(u.isCreator, true) : '');
  };

  const search = async (): Promise<void> => {
    const q = email.trim();
    if (!q || searching) return;
    setSearching(true);
    setMsg({ text: '', kind: '' });
    try {
      const users = await apiClient.admin.findUsers(q);
      pickUser(users[0] || null);
      setSearched(true);
    } catch (e: any) {
      handleError(e, '계정을 찾지 못했어요.');
    } finally {
      setSearching(false);
    }
  };

  const toggleCreator = (next: boolean): void => {
    setIsCreator(next);
    if (target && DEFAULT_REASONS.includes(reason.trim())) setReason(defaultCreatorReason(target.isCreator, next));
  };

  const save = async (): Promise<void> => {
    if (!target || !reason.trim() || saving) return;
    setSaving(true);
    setMsg({ text: '', kind: '' });
    try {
      const badgeText = badge.trim();
      const updated = await apiClient.admin.setCreator(target.id, {
        isCreator,
        creatorBadge: badgeText ? badgeText : null,
        creatorBio: bio.trim(),
        reason: reason.trim(),
      });
      setTarget(updated);
      setMsg({ text: '✓ 저장했어요', kind: 'ok' });
    } catch (e: any) {
      handleError(e, '저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  const creatorText = (u: AdminUserDto): string =>
    u.isCreator ? '크리에이터' + (u.creatorBadge ? ' · ' + u.creatorBadge : '') : '일반';

  return (
    <section className={`set-sec ${s.setSec}`} data-align-group="col: left; secs: right" id="ops" aria-labelledby="hOps">
      <details className={s.advanced} id="opsDetails" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary id="hOps">운영 (owner 전용)</summary>
        <div className={s.advBody}>
          <p className="hint">모든 변경은 사유와 함께 감사 기록에 남아요.</p>
          {forbidden ? (
            <p className="msg err" id="opsForbidden" role="status">
              {FORBIDDEN_TEXT}
            </p>
          ) : (
            <div className={s.panel} id="opsCreator">
              <h3>크리에이터 지정</h3>
              <form
                className={s.field}
                data-align-group="opsForm: left"
                onSubmit={(e) => {
                  e.preventDefault();
                  void search();
                }}
              >
                <label className={s.lab} htmlFor="opsEmail">
                  가입 이메일
                </label>
                <div className={o.searchRow}>
                  <input
                    className="inpField"
                    id="opsEmail"
                    type="email"
                    autoComplete="off"
                    maxLength={320}
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button className="ghostBtn" type="submit" id="opsSearch" disabled={searching || !email.trim()}>
                    찾기
                  </button>
                </div>
              </form>

              {searched && !target ? (
                <p className="hint" id="opsNoUser">
                  그 이메일로 가입한 계정이 없어요.
                </p>
              ) : null}

              {target ? (
                <div className={o.userBox} id="opsCreatorForm">
                  <p className={o.userInfo} id="opsUserInfo">
                    <b>{target.displayName || '(이름 없음)'}</b>
                    <span>
                      {target.email} · {tierLabel(target.tier)} · 지금 {creatorText(target)}
                    </span>
                  </p>
                  <label className={s.checkRow}>
                    <input type="checkbox" id="opsIsCreator" checked={isCreator} onChange={(e) => toggleCreator(e.target.checked)} />
                    크리에이터로 지정
                  </label>
                  <label className={s.field} data-align-group="opsForm: left">
                    <span className={s.lab}>배지 ({BADGE_MAX}자까지, 비우면 지워요)</span>
                    <input
                      className="inpField"
                      id="opsBadge"
                      autoComplete="off"
                      maxLength={BADGE_MAX}
                      placeholder="예: 재즈 기타"
                      value={badge}
                      onChange={(e) => setBadge(e.target.value)}
                    />
                  </label>
                  <label className={s.field} data-align-group="opsForm: left">
                    <span className={s.lab}>소개 ({BIO_MAX}자까지)</span>
                    <textarea className="inpField" id="opsBio" maxLength={BIO_MAX} value={bio} onChange={(e) => setBio(e.target.value)} />
                  </label>
                  <label className={s.field} data-align-group="opsForm: left">
                    <span className={s.lab}>사유 (감사 기록)</span>
                    <input
                      className="inpField"
                      id="opsReason"
                      autoComplete="off"
                      maxLength={REASON_MAX}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <div className={s.row}>
                    <button className="pillBtn" type="button" id="opsCreatorSave" disabled={saving || !reason.trim()} onClick={() => void save()}>
                      저장
                    </button>
                  </div>
                </div>
              ) : null}

              <p className={`msg${msg.kind ? ' ' + msg.kind : ''}`} id="opsMsg" role="status">
                {msg.text}
              </p>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

export default OpsPanel;
