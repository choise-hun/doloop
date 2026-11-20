// 공용 선택창(SL-1 ⑤): 브라우저 기본 <select> 대신 쓰는 앱 선택창.
// 시안: 개발산출물/명세/SL_시안.html §3 (D3 — 박스 바로 아래, 박스와 같은 가로, 모든 폭)
// 바깥 누름·Esc·Tab·페이지 스크롤·창 크기 변경이면 닫는다. 키 입력은 화면 단축키(Space 재생 등)로 새지 않는다.
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './AppSelect.module.css';

export interface AppSelectOption {
  value: string;
  label: string;
  /** 오른쪽 보조 글자(곡 수 등) */
  meta?: string;
}

interface AppSelectProps {
  /** 박스 id(목록은 `${id}-list`). 없으면 useId 기반 값을 만든다(AS-2) */
  id?: string;
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  /** 고른 값이 목록에 없을 때 박스에 보일 글자 */
  placeholder?: string;
  /** 박스 크기·글자를 화면에서 덮을 클래스 */
  className?: string;
  /** 박스 안 글자를 직접 그릴 때(기본: 고른 항목 이름) */
  children?: React.ReactNode;
  'data-align-group'?: string;
  /** 박스에 붙일 data-* (키는 `data-` 없이: { 'take-id': x } → data-take-id). data-value·data-align-group은 덮지 못한다 */
  dataAttrs?: Record<string, string>;
}

const RESERVED_DATA = new Set(['value', 'align-group']);

function toDataProps(attrs?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attrs) return out;
  for (const [k, v] of Object.entries(attrs)) {
    const key = k.replace(/^data-/, '');
    if (!key || RESERVED_DATA.has(key)) continue;
    out[`data-${key}`] = v;
  }
  return out;
}

interface PopPos {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

const GAP = 4;
const EDGE = 8;
const MIN_LIST_HEIGHT = 96;
const MAX_LIST_HEIGHT = 320;
const OPTION_HEIGHT = 45; // 항목 최소 높이 44 + 줄 1

export function AppSelect(props: AppSelectProps): React.ReactElement {
  const { value, options, onChange, disabled, ariaLabel, ariaLabelledBy, placeholder, className, children, dataAttrs } = props;
  const autoId = useId().replace(/:/g, '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<PopPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const optPrefix = useId().replace(/:/g, '');
  const id = props.id || `appsel-${autoId}`;
  const listId = `${id}-list`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // 열 때 스크롤한 위치. 이 위치에서 온 scroll 이벤트는 우리가 만든 것이라 닫지 않는다
  const openScrollYRef = useRef(0);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    // 박스가 화면 아래쪽이면 목록이 들어갈 만큼 페이지를 먼저 올린다(목록은 항상 박스 아래, D3)
    const want = Math.min(options.length * OPTION_HEIGHT + 2, MAX_LIST_HEIGHT);
    let r = el.getBoundingClientRect();
    const room = window.innerHeight - r.bottom - GAP - EDGE;
    if (room < want) {
      window.scrollBy(0, Math.min(want - room, Math.max(0, r.top - EDGE)));
      r = el.getBoundingClientRect();
    }
    openScrollYRef.current = window.scrollY;
    const top = r.bottom + GAP;
    setPos({
      left: r.left,
      top,
      width: r.width,
      maxHeight: Math.min(MAX_LIST_HEIGHT, Math.max(MIN_LIST_HEIGHT, window.innerHeight - top - EDGE)),
    });
  };

  const openList = (startAt?: number) => {
    if (disabled || options.length === 0) return;
    place();
    setActive(startAt ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    const opt = options[index];
    close(true);
    if (opt && opt.value !== value) onChange(opt.value);
  };

  // 열리면 박스 바로 아래에 놓고 목록에 초점(활성 항목은 aria-activedescendant로 알린다).
  // 위치는 JSX 인라인 style 금지 규칙에 따라 CSSOM으로 넣는다
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !pos || !list) return;
    list.style.left = `${pos.left}px`;
    list.style.top = `${pos.top}px`;
    list.style.width = `${pos.width}px`;
    list.style.maxHeight = `${pos.maxHeight}px`;
    list.focus({ preventScroll: true });
  }, [open, pos]);

  // 활성 항목이 목록 밖이면 목록 안에서만 스크롤한다
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const item = list?.children[active] as HTMLElement | undefined;
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (Boolean(listRef.current?.contains(t)) || Boolean(triggerRef.current?.contains(t)));
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) close(false);
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      if (e.target === document && window.scrollY === openScrollYRef.current) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  // 비활성으로 바뀌면 닫는다
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const onTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openList();
    }
  };

  const onListKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    const move = (to: number) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(last, to)));
    };
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowDown':
        move(active + 1);
        break;
      case 'ArrowUp':
        move(active - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(last);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        triggerRef.current?.focus();
        break;
      default:
        break;
    }
  };

  return (
    <>
      <button
        {...toDataProps(dataAttrs)}
        ref={triggerRef}
        type="button"
        id={id}
        className={`${styles.trigger} ${className || ''}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        data-value={value}
        data-align-group={props['data-align-group']}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKey}
      >
        <span className={styles.value}>{children ?? (selected ? selected.label : placeholder || '')}</span>
        <span className={styles.chev} aria-hidden="true" />
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              className={styles.list}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-activedescendant={`${optPrefix}-${active}`}
              onKeyDown={onListKey}
            >
              {options.map((o, i) => (
                <li
                  key={o.value}
                  id={`${optPrefix}-${i}`}
                  role="option"
                  className={styles.option}
                  aria-selected={o.value === value}
                  data-active={i === active || undefined}
                  data-value={o.value}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span className={styles.optLabel}>{o.label}</span>
                  {o.meta ? <span className={styles.optMeta}>{o.meta}</span> : null}
                </li>
              ))}
            </ul>,
            document.body
          )
        : null}
    </>
  );
}

export default AppSelect;
