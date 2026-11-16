// M1A-2: Capacitor 앱 껍데기. 앱 번들은 scripts/build-app-web.mjs가 만든 dist-app/을 쓴다(npm run build:app).
// server.* 는 지정하지 않는다 — iOS capacitor://localhost, Android https://localhost 기본값(명세 §2 P8).
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ulevelp.redo',
  appName: 'RE:DO',
  webDir: 'dist-app',
};

export default config;
