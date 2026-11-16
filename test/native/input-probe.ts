// Only included in isolated native fixture copies; uses the actual product input CSS.
import styles from '../../frontend/src/pages/PracticePage.module.css';
import '../../frontend/src/styles/tokens.css';
import { initNativeNavigation } from '../../frontend/src/lib/nativeNavigation';
initNativeNavigation();
for (const input of document.querySelectorAll('input')) input.className = styles.ppUrlInput;
const scale = document.getElementById('scale')!;
const font = document.getElementById('font')!;
const update = () => {
  scale.textContent = 'Scale ' + (window.visualViewport?.scale ?? 1).toFixed(3);
  font.textContent = 'Input font ' + getComputedStyle(document.querySelector('input')!).fontSize;
};
window.visualViewport?.addEventListener('resize', update);
window.visualViewport?.addEventListener('scroll', update);
document.addEventListener('focusin', update);
document.addEventListener('focusout', update);
document.getElementById('done')!.onclick = () => (document.activeElement as HTMLElement)?.blur();
update();
