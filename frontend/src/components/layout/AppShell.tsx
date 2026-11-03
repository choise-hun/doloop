import React, { useState } from 'react';
import styles from './AppShell.module.css';
import { useAuth, auth } from '../../lib/auth';
import { getTheme, setTheme } from '../../lib/security';

export type AppShellVariant = 'default' | 'narrow' | 'player';
export type ActiveNavKey = 'home' | 'chords' | 'practice' | 'log' | 'notes' | 'settings' | 'privacy';

export interface AppShellProps {
  variant?: AppShellVariant;
  activeNav?: ActiveNavKey;
  showThemeToggle?: boolean;
  children: React.ReactNode;
}

export function AppShell({
  variant = 'default',
  activeNav = 'home',
  showThemeToggle = false,
  children,
}: AppShellProps): React.ReactElement {
  const authState = useAuth();
  const [theme, setThemeState] = useState<'light' | 'dark' | ''>(() => getTheme());

  const signedInUser = authState.user;
  const navLabel = signedInUser ? auth.computeInitial(signedInUser, authState.me) : 'LOGIN';
  const navAriaLabel = signedInUser
    ? `계정 설정 (${signedInUser.email || navLabel})`
    : 'Google 계정으로 로그인';
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
    <div className={shellClass} data-shell-variant={variant}>
      <nav className={`site-nav ${styles.siteNav}`} aria-label="사이트">
        <a
          href="./"
          className={styles.brandLink}
          aria-current={activeNav === 'home' ? 'page' : undefined}
        >
          ⌂ HOME
        </a>
        <span className={`links ${styles.navLinks}`}>
          <a
            href="chords.html"
            className={styles.navItem}
            aria-current={activeNav === 'chords' ? 'page' : undefined}
          >
            CHORDS
          </a>
          <a
            href="log.html"
            className={styles.navItem}
            aria-current={activeNav === 'log' ? 'page' : undefined}
          >
            LOG
          </a>
          <a
            href="notes.html"
            className={styles.navItem}
            aria-current={activeNav === 'notes' ? 'page' : undefined}
          >
            NOTES
          </a>
          <a
            href="settings.html"
            className={styles.navItem}
            aria-current={activeNav === 'settings' ? 'page' : undefined}
          >
            SETTING
          </a>
          {showThemeToggle && (
            <span className={styles.themeGroup} role="group" aria-label="화면 모드">
              <button
                type="button"
                id="theme-light"
                className={styles.themeBtn}
                aria-pressed={theme === 'light'}
                onClick={() => handleThemePick('light')}
              >
                라이트
              </button>
              <button
                type="button"
                id="theme-dark"
                className={styles.themeBtn}
                aria-pressed={theme === 'dark'}
                onClick={() => handleThemePick('dark')}
              >
                다크
              </button>
            </span>
          )}
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
    </div>
  );
}

