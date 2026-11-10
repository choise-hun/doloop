// Settings metadata only; rendered contracts are supplied independently by DOM tests.
type Availability = 'always' | 'signedIn' | 'owner';
type Kind = 'fixed' | 'dynamicHost';
interface SettingItem {
  id: string; titleKey: string; renderKey: string; targetId: string;
  aliases: readonly string[]; availability: Availability; kind: Kind;
}
interface SettingGroup { id: string; titleKey: string; items: readonly SettingItem[] }
interface RenderContract {
  renderKey: string; targetId: string; descendantIds: readonly string[];
  availability: Availability; kind: Kind;
}
type RegistryError = { code: 'DUPLICATE_ID' | 'DUPLICATE_ALIAS' | 'UNKNOWN_RENDER_KEY' |
  'MISSING_RENDER_KEY' | 'DUPLICATE_RENDER_KEY' | 'UNKNOWN_TARGET' | 'MISSING_I18N_KEY'; subject: string };

export const SETTINGS_GROUPS: readonly SettingGroup[] = [
  { id: 'accountStorage', titleKey: 'settings.groups.accountStorage', items: [
    { id: 'account', titleKey: 'settings.secAccount', renderKey: 'account', targetId: 'account',
      aliases: ['hAccount', 'accDesc', 'accGuest', 'btnLogin', 'btnLoginBlank', 'accUser', 'accEmail', 'accName', 'accQuota', 'quotaText', 'quotaBar', 'driveStoragePanel', 'driveProviderText', 'driveStatusMsg', 'driveConflictNotice', 'btnDriveEnable', 'btnDriveDisable', 'btnDriveMigrate', 'btnLogout', 'delConfirm', 'btnDeleteAcc', 'accMsg'], availability: 'always', kind: 'fixed' },
  ] },
  { id: 'subscriptionCredits', titleKey: 'settings.groups.subscriptionCredits', items: [
    { id: 'credits', titleKey: 'settings.secCredits', renderKey: 'credits', targetId: 'credits',
      aliases: ['hCredits', 'creditTier', 'creditMsg', 'creditTotal', 'creditBuckets', 'creditNext', 'creditExpire'], availability: 'always', kind: 'fixed' },
  ] },
  { id: 'publicIntegration', titleKey: 'settings.groups.publicIntegration', items: [
    { id: 'community', titleKey: 'community.settingsTitle', renderKey: 'community', targetId: 'community',
      aliases: ['hCommunity', 'settingsProfileLink', 'commAutosync', 'commPracticeLog', 'commProNotice', 'commNameRequiredNotice', 'commErrMsg'], availability: 'signedIn', kind: 'fixed' },
  ] },
  { id: 'appearanceLanguage', titleKey: 'settings.groups.appearanceLanguage', items: [
    { id: 'screen', titleKey: 'settings.secScreen', renderKey: 'screen', targetId: 'screen', aliases: ['hScreen'], availability: 'always', kind: 'fixed' },
    { id: 'language', titleKey: 'settings.secLang', renderKey: 'language', targetId: 'langSec', aliases: ['hLang', 'langDesc', 'langSelect'], availability: 'always', kind: 'fixed' },
  ] },
  { id: 'advancedData', titleKey: 'settings.groups.advancedData', items: [
    { id: 'backup', titleKey: 'settings.secNx', renderKey: 'backup', targetId: 'nx', aliases: ['hNx', 'chkExportAudio', 'btnExportZip', 'nxMsg'], availability: 'always', kind: 'fixed' },
    { id: 'advanced', titleKey: 'settings.advSummary', renderKey: 'advanced', targetId: 'advanced',
      aliases: ['advNotion', 'hAdvanced', 'btnNotionTemplate', 'notion', 'notionKeyStatus', 'ntnGuide', 'ntnToken', 'ntnSongsDb', 'ntnSessionsDb', 'ntnNotesDb', 'btnSaveNotionKey', 'btnCheckNotionKey', 'btnDelNotionKey', 'ntnKeyMsg', 'notionSyncPanel', 'syncStatusText', 'syncErrorText', 'btnSyncEnable', 'btnSyncDisable', 'btnSyncPull', 'btnSyncPush', 'syncMsg', 'inpImportZip', 'btnPreviewZip', 'nxPreviewBox', 'nxPreviewSummary', 'nxPreviewList', 'btnConfirmZip', 'btnCancelZip', 'links', 'hLinks', 'nlPractice', 'nlNotes', 'nlSave', 'nlMsg'], availability: 'always', kind: 'fixed' },
  ] },
  { id: 'operations', titleKey: 'settings.groups.operations', items: [
    { id: 'opsHost', titleKey: 'settings.groups.operations', renderKey: 'opsHost', targetId: 'ops', aliases: ['opsDetails', 'hOps', 'opsCreator', 'opsEmail', 'opsSearch', 'opsMsg'], availability: 'owner', kind: 'dynamicHost' },
  ] },
];

export function validateSettingsRegistry(
  groups: readonly SettingGroup[], rendered: readonly RenderContract[],
  dictionaries: Record<'ko' | 'en' | 'ja', Readonly<Record<string, string>>>,
): RegistryError[] {
  const errors: RegistryError[] = [];
  const add = (code: RegistryError['code'], subject: string) => errors.push({ code, subject });
  const ids = new Set<string>(), hashes = new Set<string>(), keys = new Set<string>();
  const titles = new Set(['settings.groups.navigation']);
  for (const group of groups) {
    for (const id of [group.id, ...group.items.map(item => item.id)]) {
      if (ids.has(id)) add('DUPLICATE_ID', id);
      ids.add(id);
    }
    titles.add(group.titleKey);
    for (const item of group.items) {
      titles.add(item.titleKey);
      if (keys.has(item.renderKey)) add('DUPLICATE_RENDER_KEY', item.renderKey);
      keys.add(item.renderKey);
      const contracts = rendered.filter(contract => contract.renderKey === item.renderKey);
      if (!contracts.length) add('UNKNOWN_RENDER_KEY', item.renderKey);
      for (const contract of contracts) {
        if (contract.availability !== item.availability || contract.kind !== item.kind) add('UNKNOWN_RENDER_KEY', item.renderKey);
        if (contract.targetId !== item.targetId) add('UNKNOWN_TARGET', item.targetId);
        for (const alias of item.aliases) {
          if (alias !== contract.targetId && !contract.descendantIds.includes(alias)) add('UNKNOWN_TARGET', alias);
        }
      }
      for (const hash of [item.targetId, ...item.aliases]) {
        if (hashes.has(hash)) add('DUPLICATE_ALIAS', hash);
        hashes.add(hash);
      }
    }
  }
  const renderedKeys = new Set<string>();
  for (const contract of rendered) {
    if (renderedKeys.has(contract.renderKey)) add('DUPLICATE_RENDER_KEY', contract.renderKey);
    renderedKeys.add(contract.renderKey);
    if (!keys.has(contract.renderKey)) add('MISSING_RENDER_KEY', contract.renderKey);
  }
  for (const [locale, dictionary] of Object.entries(dictionaries)) {
    for (const key of titles) {
      if (!Object.hasOwn(dictionary, key) || typeof dictionary[key] !== 'string' || !dictionary[key].trim()) add('MISSING_I18N_KEY', `${locale}:${key}`);
    }
  }
  return errors.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0);
}

export function resolveSettingsHash(hash: string, groups: readonly SettingGroup[]) {
  let targetId: string;
  try { targetId = decodeURIComponent(hash.startsWith('#') ? hash.slice(1) : hash); }
  catch { return null; }
  if (!targetId) return null;
  for (const group of groups) {
    const item = group.items.find(item => item.targetId === targetId || item.aliases.includes(targetId));
    if (item) return { groupId: group.id, renderKey: item.renderKey, targetId };
  }
  return null;
}
