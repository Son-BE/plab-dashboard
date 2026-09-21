var SHEET_NAME = 'rows';
var MAX_SESSIONS = 12;
var DEFAULT_ROUND = '1회차';
var CURRENT_SYNC_ROUND = '1회차';
var DRIVE_FOLDER_ID = '0ANj2IaPNW8JTUk9PVA';
var FOLDER_MIME = 'application/vnd.google-apps.folder';

var HEADERS = (function () {
  var headers = [
    'id', 'date', 'folderNc', 'region', 'company',
    'session1', 'session2', 'session3', 'session4', 'session5', 'session6',
    'plan', 'report', 'complete', 'flag', 'remark', 'round',
    'upSession1', 'upSession2', 'upSession3', 'upSession4', 'upSession5', 'upSession6', 'upPlan', 'upReport'
  ];
  for (var n = 7; n <= MAX_SESSIONS; n++) headers.push('session' + n);
  for (var n2 = 7; n2 <= MAX_SESSIONS; n2++) headers.push('upSession' + n2);
  headers.push('contactEmail');
  headers.push('folderId');
  return headers;
})();

var USERS = [
  { username: 'Admin_ai', role: 'admin', region: 'all' },
  { username: 'All_ai', role: 'viewer', region: 'all' },
  { username: 'Sccei_ai', role: 'viewer', region: '수도권' },
  { username: 'Gccei_ai', role: 'viewer', region: '강원권' },
  { username: 'Jccei_ai', role: 'viewer', region: '제주권' }
];

var FLAG_DAY_THRESHOLDS = [
  { days: 7, flag: 'issue' },
  { days: 5, flag: 'alert' },
  { days: 3, flag: 'caution' }
];
var FLAG_LABELS_KO = { caution: '주의', alert: '경고', issue: '문제' };
var COMPANY_REMINDER_FLAGS = ['alert', 'issue'];

function getSessionCount() {
  var v = Number(PropertiesService.getScriptProperties().getProperty('SESSION_COUNT'));
  if (!v || v < 1 || v > MAX_SESSIONS || Math.floor(v) !== v) return 6;
  return v;
}

function setSessionCountConfig(n) {
  n = Number(n);
  if (!n || n < 1 || n > MAX_SESSIONS || Math.floor(n) !== n) {
    return { ok: false, error: 'invalid', message: '세션 수는 1~' + MAX_SESSIONS + ' 사이의 정수여야 해요.' };
  }
  PropertiesService.getScriptProperties().setProperty('SESSION_COUNT', String(n));
  return { ok: true, sessionCount: n };
}

function getUploadFieldNames(count) {
  var arr = [];
  for (var n = 1; n <= count; n++) arr.push('upSession' + n);
  arr.push('upPlan', 'upReport');
  return arr;
}

function getUploadToSourceMap(count) {
  var map = {};
  for (var n = 1; n <= count; n++) map['upSession' + n] = 'session' + n;
  map.upPlan = 'plan';
  map.upReport = 'report';
  return map;
}

function getKeywordMapForCount(count) {
  var map = [
    { field: 'plan', keywords: ['계획서'] },
    { field: 'report', keywords: ['결과보고서', '보고서'] }
  ];
  for (var n = 1; n <= count; n++) {
    map.push({ field: 'session' + n, keywords: [n + '회차', n + '차'] });
  }
  return map;
}
