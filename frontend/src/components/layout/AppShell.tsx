import React, { useEffect, useState } from 'react';
import styles from './AppShell.module.css';
import { useAuth, auth } from '../../lib/auth';
import { getTheme, setTheme, THEME_EVENT } from '../../lib/security';
import { t, type I18nKey } from '../../lib/i18n.mts';
import { BetaBadge } from '../common/BetaBadge';

export type AppShellVariant = 'default' | 'narrow' | 'player';
export type ActiveNavKey = 'home' | 'learn' | 'play' | 'trails' | 'community' | 'chords' | 'notes' | 'settings' | 'privacy';

// 좌측 기능 메뉴. href가 null이면 페이지가 아직 없어 비활성으로 보인다
const MAIN_NAV: Array<{ key: ActiveNavKey; labelKey: I18nKey; href: string | null }> = [
  { key: 'learn', labelKey: 'nav.learn', href: 'chords.html' },
  { key: 'play', labelKey: 'nav.play', href: 'practice.html' },
  { key: 'trails', labelKey: 'nav.trails', href: 'log.html' },
  { key: 'community', labelKey: 'nav.community', href: 'community.html' },
  { key: 'chords', labelKey: 'nav.chords', href: 'progressions.html' },
  { key: 'notes', labelKey: 'nav.notes', href: 'notes.html' },
];

export interface AppShellProps {
  variant?: AppShellVariant;
  activeNav?: ActiveNavKey;
  showThemeToggle?: boolean;
  children: React.ReactNode;
}

export function AppShell({
  variant = 'default',
  activeNav = 'home',
  showThemeToggle = true,
  children,
}: AppShellProps): React.ReactElement {
  const authState = useAuth();
  const [theme, setThemeState] = useState<'light' | 'dark' | ''>(() => getTheme());
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const tabBarRef = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => setThemeState(getTheme());
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  useEffect(() => {
    const updateHeight = () => {
      if (tabBarRef.current && shellRef.current) {
        const h = tabBarRef.current.offsetHeight;
        if (h > 0) shellRef.current.style.setProperty('--tabbar-real-height', `${h}px`);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const signedInUser = authState.user;
  const navLabel = signedInUser ? auth.computeInitial(signedInUser, authState.me) : t('nav.login');
  const navAriaLabel = signedInUser
    ? t('nav.accountAria', { who: signedInUser.email || navLabel })
    : t('nav.loginAria');
  const embedded = auth.isEmbedded();

  const handleAuthClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (signedInUser) return;
    if (embedded) return;
    if (!auth.isConfigured()) return;
    e.preventDefault();
    try {
      await auth.signIn();
    } catch {
      window.location.href = 'settings.html#account';
    }
  };

  const handleThemePick = (next: 'light' | 'dark') => {
    const nextVal = theme === next ? '' : next;
    setTheme(nextVal);
    setThemeState(nextVal);
  };

  const shellClass = variant === 'player' ? styles.playerShell : styles.shell;
  const mainClass =
    variant === 'narrow'
      ? styles.mainNarrow
      : variant === 'player'
        ? styles.mainPlayer
        : styles.mainDefault;

  return (
    <div
      ref={shellRef}
      className={shellClass}
      data-shell-variant={variant}
    >
      <nav className={`site-nav ${styles.siteNav}`} aria-label={t('nav.ariaSite')}>
        <span className={styles.navMain}>
          <a
            href="./"
            className={styles.brandLink}
            aria-current={activeNav === 'home' ? 'page' : undefined}
          >
            {t('nav.home')}
          </a>
          {MAIN_NAV.map((item) =>
            item.href ? (
              <a
                key={item.key}
                href={item.href}
                className={`${styles.navItem} ${styles.navMainItem}`}
                aria-current={activeNav === item.key ? 'page' : undefined}
              >
                {item.key === 'notes' ? (
                  <>
                    <span>{t(item.labelKey)}</span>
                    <BetaBadge />
                  </>
                ) : (
                  t(item.labelKey)
                )}
              </a>
            ) : (
              <span
                key={item.key}
                className={`${styles.navItem} ${styles.navItemDisabled} ${styles.navMainItem}`}
                aria-disabled="true"
                title={t('nav.disabledTitle')}
              >
                {t(item.labelKey)}
              </span>
            )
          )}
        </span>
        <span className={`links ${styles.navLinks}`}>
          <a
            href="settings.html"
            className={styles.navItem}
            aria-current={activeNav === 'settings' ? 'page' : undefined}
          >
            {t('nav.settings')}
          </a>
          <a
            href="settings.html#account"
            id="navAuth"
            data-nav-auth="1"
            data-auth-state={signedInUser ? 'signed-in' : 'signed-out'}
            className={styles.navItem}
            aria-label={navAriaLabel}
            target={!signedInUser && embedded ? '_blank' : undefined}
            rel={!signedInUser && embedded ? 'noopener' : undefined}
            onClick={handleAuthClick}
          >
            {navLabel}
          </a>
        </span>
      </nav>
      <main className={mainClass}>{children}</main>
      <nav ref={tabBarRef} className={styles.tabBar} aria-label={t('nav.ariaTabs')} data-tabbar="1">
        {MAIN_NAV.map((item) =>
          item.href ? (
            <a
              key={item.key}
              href={item.href}
              className={styles.tabItem}
              data-align-group="tabs:top,bottom,height"
              aria-current={activeNav === item.key ? 'page' : undefined}
            >
              {t(item.labelKey)}
            </a>
          ) : (
            <span
              key={item.key}
              className={`${styles.tabItem} ${styles.tabItemDisabled}`}
              data-align-group="tabs:top,bottom,height"
              aria-disabled="true"
              title={t('nav.disabledTitle')}
            >
              {t(item.labelKey)}
            </span>
          )
        )}
      </nav>
      {showThemeToggle && (
        <footer className={styles.siteFoot}>
          <span className={styles.themeGroup} role="group" aria-label={t('theme.group')}>
            <button
              type="button"
              id="theme-light"
              className={styles.themeBtn}
              aria-pressed={theme === 'light'}
              onClick={() => handleThemePick('light')}
            >
              {t('theme.light')}
            </button>
            <button
              type="button"
              id="theme-dark"
              className={styles.themeBtn}
              aria-pressed={theme === 'dark'}
              onClick={() => handleThemePick('dark')}
            >
              {t('theme.dark')}
            </button>
          </span>
        </footer>
      )}
    </div>
  );
}

