// frontend/src/components/ops/OpsFolders.tsx
// 운영 섹션 안 "큐레이션·이달의 곡" 편집 (M2-4b, 개발산출물/진행_운영화면.md §2·§3, API 결과/M1-4b_큐레이션API.md §3-3)
// 목록(초안·숨김 포함) → 만들기 → 제목·설명·순서 → 곡 편집(붙여넣기·구간·배속·설명, 상한) → 공개/비공개 → 삭제
// 제목·설명·곡 설명은 ko 칸만 보이고, 저장할 때 기존 en·ja를 같이 보낸다(O3 — PATCH가 번역 묶음을 통째로 바꾼다)
// 문구 한국어 고정(O2). 사용자 글자는 React 텍스트로만 넣는다
import React, { useEffect, useRef, useState } from 'react';
import { apiClient, AdminFolderDetail, AdminFolderDto, AdminFolderKind, AdminFolderPatch } from '../../lib/apiClient';
import { thumb, videoIdFrom } from '../../lib/security';
import {
  checkItems,
  defaultReason,
  DESC_MAX,
  folderTag,
  ITEM_MAX,
  kindLabel,
  mergeI18n,
  newRow,
  nextMonthKst,
  NOTE_MAX,
  OpsAction,
  OpsItemRow,
  REASON_MAX,
  rowFromItem,
  sameI18n,
  TITLE_MAX,
} from '../../lib/opsForm.mts';
import s from '../../pages/SettingsPage.module.css';
import o from './Ops.module.css';

type Msg = { text: string; kind: '' | 'ok' | 'err' };
const NO_MSG: Msg = { text: '', kind: '' };

interface Props {
  /** 운영 섹션이 펼쳐졌는지 — 처음 펼칠 때 목록을 불러온다(펼치기 전 /admin 요청 0건) */
  open: boolean;
  /** 403이면 true를 돌려주고 OpsPanel이 안내 한 줄로 바꾼다 */
  onForbidden: (e: any) => boolean;
}

function folderState(f: AdminFolderDto): string {
  if (f.hidden) return '숨김';
  return f.isPublic ? '공개' : '초안';
}

function folderTitle(f: AdminFolderDto): string {
  return (f.titleI18n && f.titleI18n.ko) || f.title || '(제목 없음)';
}

export function OpsFolders({ open, onForbidden }: Props): React.ReactElement {
  const [folders, setFolders] = useState<AdminFolderDetail[] | null>(null);
  const [msg, setMsg] = useState<Msg>(NO_MSG);
  const [busy, setBusy] = useState(false);
  const loadSeq = useRef(0);
  const loaded = useRef(false);

  // 새로 만들기
  const [newKind, setNewKind] = useState<AdminFolderKind>('curated');
  const [newTitle, setNewTitle] = useState('');
  const [newMonth, setNewMonth] = useState(() => nextMonthKst(new Date()));
  const [newReason, setNewReason] = useState<string | null>(null); // null = 기본 사유를 따른다

  // 편집 중인 폴더(고르는 순간 칸을 한 번에 채운다)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [edTitle, setEdTitle] = useState('');
  const [edDesc, setEdDesc] = useState('');
  const [edSort, setEdSort] = useState('0');
  const [edReason, setEdReason] = useState<string | null>(null);
  const [rows, setRows] = useState<OpsItemRow[]>([]);
  const [addText, setAddText] = useState('');

  const fail = (e: any, fallback: string): void => {
    if (onForbidden(e)) return;
    setMsg({ text: (e && e.message) || fallback, kind: 'err' });
  };

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    const mySeq = ++loadSeq.current;
    apiClient.admin
      .listFolders()
      .then((list) => {
        if (mySeq !== loadSeq.current) return; // 늦게 온 목록은 버린다
        setFolders(list);
      })
      .catch((e) => {
        if (mySeq !== loadSeq.current) return;
        loaded.current = false; // 다음에 펼칠 때 다시 시도
        setFolders([]);
        fail(e, '폴더 목록을 불러오지 못했어요.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = (folders || []).find((d) => d.folder.id === selectedId) || null;

  const pick = (d: AdminFolderDetail | null): void => {
    selectedRef.current = d ? d.folder.id : null;
    setSelectedId(d ? d.folder.id : null);
    setEdTitle(d ? (d.folder.titleI18n && d.folder.titleI18n.ko) || d.folder.title || '' : '');
    setEdDesc(d ? (d.folder.descriptionI18n && d.folder.descriptionI18n.ko) || '' : '');
    setEdSort(d ? String(d.folder.sortOrder ?? 0) : '0');
    setEdReason(null);
    setRows(d ? d.items.map(rowFromItem) : []);
    setAddText('');
  };

  /** 목록에서 한 폴더를 바꾼다(목록이 늦게 와도 덮어쓰지 않게 목록 시퀀스를 올린다) */
  const putFolder = (folder: AdminFolderDto, items?: AdminFolderDetail['items']): void => {
    loadSeq.current++;
    setFolders((prev) => {
      const list = prev || [];
      const i = list.findIndex((d) => d.folder.id === folder.id);
      if (i < 0) return [...list, { folder, items: items || [] }];
      const next = list.slice();
      next[i] = { folder, items: items || list[i].items };
      return next;
    });
  };

  // ---- 새로 만들기 ----
  const newTag = {
    kind: newKind,
    month: newKind === 'monthly_pick' ? newMonth : null,
    titleI18n: { ko: newTitle.trim() },
  };
  const newReasonShown = newReason ?? defaultReason('create', newTag);
  const newMonthOk = newKind !== 'monthly_pick' || /^\d{4}-(0[1-9]|1[0-2])$/.test(newMonth);
  const canCreate = !busy && !!newTitle.trim() && newMonthOk && !!newReasonShown.trim();

  const create = async (): Promise<void> => {
    if (!canCreate) return;
    setBusy(true);
    setMsg(NO_MSG);
    try {
      const input: Parameters<typeof apiClient.admin.createFolder>[0] = {
        kind: newKind,
        titleI18n: { ko: newTitle.trim() },
        reason: newReasonShown.trim(),
      };
      if (newKind === 'monthly_pick') input.month = newMonth;
      const folder = await apiClient.admin.createFolder(input);
      putFolder(folder, []);
      pick({ folder, items: [] });
      setNewTitle('');
      setNewReason(null);
      setMsg({ text: '✓ 만들었어요. 곡을 넣고 공개하세요.', kind: 'ok' });
    } catch (e: any) {
      fail(e, '만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  // ---- 편집 ----
  const reasonFor = (action: OpsAction): string => {
    if (!selected) return '';
    if (edReason !== null) return edReason.trim();
    return defaultReason(action, selected.folder);
  };
  const edReasonShown = selected ? (edReason ?? defaultReason('edit', selected.folder)) : '';
  const canWrite = !busy && !!selected && !!edReasonShown.trim();
  const max = selected ? (ITEM_MAX[selected.folder.kind as AdminFolderKind] ?? ITEM_MAX.curated) : ITEM_MAX.curated;
  const atMax = rows.length >= max;

  const saveMeta = async (): Promise<void> => {
    if (!selected || !canWrite) return;
    const f = selected.folder;
    const title = edTitle.trim();
    if (!title) {
      setMsg({ text: '제목을 적어 주세요.', kind: 'err' });
      return;
    }
    const sort = Number(edSort.trim() || '0');
    if (!Number.isInteger(sort)) {
      setMsg({ text: '순서는 정수로 적어 주세요.', kind: 'err' });
      return;
    }
    const patch: AdminFolderPatch = { reason: reasonFor('edit') };
    const titleI18n = mergeI18n(f.titleI18n, 'ko', title);
    const descriptionI18n = mergeI18n(f.descriptionI18n, 'ko', edDesc);
    if (!sameI18n(titleI18n, f.titleI18n)) patch.titleI18n = titleI18n;
    if (!sameI18n(descriptionI18n, f.descriptionI18n)) patch.descriptionI18n = descriptionI18n;
    if (sort !== (f.sortOrder ?? 0)) patch.sortOrder = sort;
    if (Object.keys(patch).length === 1) {
      setMsg({ text: '바뀐 내용이 없어요.', kind: '' });
      return;
    }
    await write(async () => {
      const folder = await apiClient.admin.updateFolder(f.id, patch);
      putFolder(folder);
      return '✓ 저장했어요';
    }, '저장하지 못했어요.');
  };

  const togglePublic = async (): Promise<void> => {
    if (!selected || !canWrite) return;
    const f = selected.folder;
    const next = !f.isPublic;
    await write(async () => {
      const folder = await apiClient.admin.updateFolder(f.id, {
        isPublic: next,
        reason: reasonFor(next ? 'publish' : 'unpublish'),
      });
      putFolder(folder);
      return next ? '✓ 공개했어요' : '✓ 비공개로 바꿨어요';
    }, '바꾸지 못했어요.');
  };

  const saveItems = async (): Promise<void> => {
    if (!selected || !canWrite) return;
    const f = selected.folder;
    const r = checkItems(f.kind as AdminFolderKind, rows);
    if (!r.items) {
      setMsg({ text: r.errors.join(' '), kind: 'err' });
      return;
    }
    const items = r.items;
    await write(async () => {
      const detail = await apiClient.admin.replaceItems(f.id, items, reasonFor('items'));
      putFolder(detail.folder, detail.items);
      if (selectedRef.current === detail.folder.id) setRows(detail.items.map(rowFromItem));
      return '✓ 곡을 저장했어요';
    }, '곡을 저장하지 못했어요.');
  };

  const remove = async (): Promise<void> => {
    if (!selected || !canWrite) return;
    const f = selected.folder;
    if (!window.confirm(`${folderTag(f)}을(를) 삭제할까요? 넣은 곡도 함께 지워져요.`)) return;
    await write(async () => {
      await apiClient.admin.deleteFolder(f.id, reasonFor('delete'));
      loadSeq.current++;
      setFolders((prev) => (prev || []).filter((d) => d.folder.id !== f.id));
      pick(null);
      return '✓ 삭제했어요';
    }, '삭제하지 못했어요.');
  };

  const write = async (run: () => Promise<string>, fallback: string): Promise<void> => {
    setBusy(true);
    setMsg(NO_MSG);
    try {
      setMsg({ text: await run(), kind: 'ok' });
    } catch (e: any) {
      fail(e, fallback);
    } finally {
      setBusy(false);
    }
  };

  // ---- 곡 줄 ----
  const addItem = (): void => {
    if (atMax) return;
    const id = videoIdFrom(addText);
    if (!id) {
      setMsg({
        text: '유튜브 주소나 영상 ID(11자)를 넣어 주세요.',
        kind: 'err',
      });
      return;
    }
    if (rows.some((r) => r.videoId === id)) {
      setMsg({ text: '이미 넣은 영상이에요.', kind: 'err' });
      return;
    }
    setRows((prev) => [...prev, newRow(id)]);
    setAddText('');
    setMsg(NO_MSG);
  };

  const setRow = (i: number, patch: Partial<OpsItemRow>): void => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const removeRow = (i: number): void => {
    setRows((prev) => prev.filter((_, j) => j !== i));
  };

  return (
    <>
      <div className={s.panel} id="opsFolders">
        <h3>큐레이션·이달의 곡</h3>
        <p className="hint">초안은 홈에 보이지 않아요. 이달의 곡은 공개해도 그 달(한국 시간)에만 보여요.</p>
        {folders === null ? (
          <p className="hint" id="opsFoldersLoading">
            불러오는 중…
          </p>
        ) : folders.length === 0 ? (
          <p className="hint" id="opsFoldersEmpty">
            아직 만든 폴더가 없어요.
          </p>
        ) : (
          <ul className={o.folderList} id="opsFolderList">
            {folders.map((d) => (
              <li
                key={d.folder.id}
                className={`opsFolderRow ${o.folderRow}`}
                data-folder-id={d.folder.id}
                aria-current={d.folder.id === selectedId ? 'true' : undefined}
              >
                <div className={o.folderInfo}>
                  <b>{folderTitle(d.folder)}</b>
                  <span>
                    {kindLabel(d.folder.kind)}
                    {d.folder.month ? ' · ' + d.folder.month : ''} · {d.folder.itemCount}곡 · 순서 {d.folder.sortOrder}
                  </span>
                </div>
                <span className={`opsFolderState ${s.badge}${d.folder.isPublic && !d.folder.hidden ? ' ' + s.badgeOk : ''}`}>
                  {folderState(d.folder)}
                </span>
                <button
                  type="button"
                  className={`ghostBtn opsFolderPick ${o.smallBtn}`}
                  aria-label={`${folderTitle(d.folder)} 편집`}
                  onClick={() => pick(d)}
                >
                  편집
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className={o.group}
          id="opsNewForm"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h4 className={o.h4}>새로 만들기</h4>
          <div className={o.pairRow}>
            <label className={s.field} data-align-group="opsForm: left">
              <span className={s.lab}>종류</span>
              <select className="inpField" id="opsNewKind" value={newKind} onChange={(e) => setNewKind(e.target.value as AdminFolderKind)}>
                <option value="curated">큐레이션</option>
                <option value="monthly_pick">이달의 곡</option>
              </select>
            </label>
            {newKind === 'monthly_pick' ? (
              <label className={s.field}>
                <span className={s.lab}>달 (만든 뒤 못 바꿔요)</span>
                <input className="inpField" id="opsNewMonth" type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
              </label>
            ) : null}
          </div>
          <label className={s.field} data-align-group="opsForm: left">
            <span className={s.lab}>제목 ({TITLE_MAX}자까지)</span>
            <input
              className="inpField"
              id="opsNewTitle"
              autoComplete="off"
              maxLength={TITLE_MAX}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </label>
          <label className={s.field} data-align-group="opsForm: left">
            <span className={s.lab}>사유 (감사 기록)</span>
            <input
              className="inpField"
              id="opsNewReason"
              autoComplete="off"
              maxLength={REASON_MAX}
              value={newReasonShown}
              onChange={(e) => setNewReason(e.target.value)}
            />
          </label>
          <div className={s.row} data-align-group="opsBtns: height">
            <button className="ghostBtn" type="submit" id="opsNewCreate" disabled={!canCreate}>
              만들기
            </button>
          </div>
        </form>
      </div>

      <p className={`msg${msg.kind ? ' ' + msg.kind : ''}`} id="opsFolderMsg" role="status">
        {msg.text}
      </p>

      {selected ? (
        <div className={s.panel} id="opsEditor">
          <div className={s.cardHead}>
            <h3 className={o.edHead}>{folderTag(selected.folder)}</h3>
            <span className={`${s.badge}${selected.folder.isPublic && !selected.folder.hidden ? ' ' + s.badgeOk : ''}`}>
              {folderState(selected.folder)}
            </span>
          </div>
          <label className={s.field} data-align-group="opsForm: left">
            <span className={s.lab}>제목 ({TITLE_MAX}자까지)</span>
            <input
              className="inpField"
              id="opsEdTitle"
              autoComplete="off"
              maxLength={TITLE_MAX}
              value={edTitle}
              onChange={(e) => setEdTitle(e.target.value)}
            />
          </label>
          <label className={s.field} data-align-group="opsForm: left">
            <span className={s.lab}>설명 ({DESC_MAX}자까지)</span>
            <textarea className="inpField" id="opsEdDesc" maxLength={DESC_MAX} value={edDesc} onChange={(e) => setEdDesc(e.target.value)} />
          </label>
          <label className={s.field} data-align-group="opsForm: left">
            <span className={s.lab}>순서 (작을수록 앞)</span>
            <input
              className={`inpField ${o.narrowInp}`}
              id="opsEdSort"
              inputMode="numeric"
              value={edSort}
              onChange={(e) => setEdSort(e.target.value)}
            />
          </label>
          <label className={s.field} data-align-group="opsForm: left">
            <span className={s.lab}>사유 (감사 기록 — 그대로 두면 작업마다 이름을 채워요)</span>
            <input
              className="inpField"
              id="opsEdReason"
              autoComplete="off"
              maxLength={REASON_MAX}
              value={edReasonShown}
              onChange={(e) => setEdReason(e.target.value)}
            />
          </label>
          <div className={s.row} data-align-group="opsBtns: height">
            <button className="ghostBtn" type="button" id="opsEdSave" disabled={!canWrite} onClick={() => void saveMeta()}>
              정보 저장
            </button>
            <button className="ghostBtn" type="button" id="opsEdPublish" disabled={!canWrite} onClick={() => void togglePublic()}>
              {selected.folder.isPublic ? '비공개로' : '공개하기'}
            </button>
            <button className="ghostBtn" type="button" id="opsEdDelete" disabled={!canWrite} onClick={() => void remove()}>
              삭제
            </button>
          </div>

          <div className={s.cardHead}>
            <h4 className={o.h4}>곡</h4>
            <span className="hint" id="opsItemCount">
              {rows.length} / {max}곡
            </span>
          </div>
          {rows.length ? (
            <ul className={o.itemList} id="opsItems">
              {rows.map((r, i) => (
                <li key={r.videoId} className={`opsItem ${o.item}`}>
                  <img className={o.thumb} src={thumb(r.videoId)} alt="" loading="lazy" data-align-group="opsItem: top" />
                  <div className={`opsItemTitle ${o.itemTitle}`} data-align-group="opsItem: top">
                    <b>{r.title || '새 곡 · 저장하면 제목이 보여요'}</b>
                    <span>{(r.artist ? r.artist + ' · ' : '') + r.videoId}</span>
                  </div>
                  <div className={o.itemCtrls}>
                    <label className={s.field}>
                      <span className={s.lab}>시작</span>
                      <input
                        className={`inpField opsItemA ${o.timeInp}`}
                        placeholder="0:00"
                        autoComplete="off"
                        value={r.a}
                        onChange={(e) => setRow(i, { a: e.target.value })}
                      />
                    </label>
                    <label className={s.field}>
                      <span className={s.lab}>끝</span>
                      <input
                        className={`inpField opsItemB ${o.timeInp}`}
                        placeholder="끝까지"
                        autoComplete="off"
                        value={r.b}
                        onChange={(e) => setRow(i, { b: e.target.value })}
                      />
                    </label>
                    <label className={s.field}>
                      <span className={s.lab}>배속</span>
                      <input
                        className={`inpField opsItemRate ${o.rateInp}`}
                        inputMode="decimal"
                        autoComplete="off"
                        value={r.rate}
                        onChange={(e) => setRow(i, { rate: e.target.value })}
                      />
                    </label>
                    <button
                      className={`ghostBtn opsItemDel ${o.smallBtn}`}
                      type="button"
                      aria-label={`${i + 1}번 곡 빼기`}
                      onClick={() => removeRow(i)}
                    >
                      빼기
                    </button>
                  </div>
                  <label className={`${s.field} ${o.itemNote}`}>
                    <span className={s.lab}>곡 설명 ({NOTE_MAX}자까지)</span>
                    <input
                      className="inpField opsItemNote"
                      autoComplete="off"
                      maxLength={NOTE_MAX}
                      value={r.note}
                      onChange={(e) => setRow(i, { note: e.target.value })}
                    />
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className={s.field}
            data-align-group="opsForm: left"
            onSubmit={(e) => {
              e.preventDefault();
              addItem();
            }}
          >
            <label className={s.lab} htmlFor="opsAddVideo">
              곡 추가 (유튜브 주소나 영상 ID)
            </label>
            <div className={o.searchRow}>
              <input
                className="inpField"
                id="opsAddVideo"
                autoComplete="off"
                placeholder="https://www.youtube.com/watch?v=…"
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
              />
              <button className="ghostBtn" type="submit" id="opsAddItem" disabled={atMax || !addText.trim()}>
                추가
              </button>
            </div>
          </form>
          {atMax ? (
            <p className="hint" id="opsItemsMax">
              {kindLabel(selected.folder.kind)}은 {max}곡까지예요. 한 곡을 빼고 넣어 주세요.
            </p>
          ) : null}
          <div className={s.row} data-align-group="opsBtns: height">
            <button className="pillBtn" type="button" id="opsItemsSave" disabled={!canWrite} onClick={() => void saveItems()}>
              곡 저장
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default OpsFolders;
