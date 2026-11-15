// M0-0 스파이크 전용(spike/M0-0 브랜치에서만 존재, main에 반영하지 않는다).
// A 방식: CAP_SERVER_URL 없이 sync → dist 번들을 capacitor://localhost(iOS) / https://localhost(Android)로 연다.
// B 방식: CAP_SERVER_URL=https://... npx cap sync → 원격 https 사이트를 연다(공식 문서상 운영용 아님, 비교 시험용).
import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.ulevelp.spike',
  appName: 'RE:DO Spike',
  webDir: 'dist',
  ...(serverUrl ? { server: { url: serverUrl } } : {}),
};

export default config;
