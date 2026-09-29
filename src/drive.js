// 회차 마스터(rounds 시트)에 아직 '1회차' 레코드가 없고 기존 DRIVE_FOLDER_ID 상수가
// 설정돼있으면, 그 값으로 '1회차' 레코드를 한 번만 자동으로 만들어줘요. 프로그램 탭으로
// 드라이브 폴더 설정을 옮기면서도, 이미 잘 되고 있던 1회차 동기화가 끊기지 않게 하는
// 안전한 이전 경로예요. 이미 '1회차' 레코드가 있으면 아무것도 안 해요.
// 회차 관리 화면에 드라이브 폴더 ID 대신 전체 URL을 붙여넣거나(예: ".../folders/xxxx?hl=ko"),
// 앞뒤에 공백이 섞여 들어오는 실수를 방어해요. 공백이 남아있으면 문자열 비교(exclude 목록
// 매칭)가 조용히 실패해서 다른 회차 폴더를 걸러내지 못하는 원인이 될 수 있어서, 쓰는
// 곳마다 다시 안 짜도 되게 여기 한 곳에서 정리해요.
function normalizeDriveFolderId(v) {
  v = String(v || '').trim();
  var m = v.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return v;
}

function ensureRoundHasDefaultFolder() {
  if (findRoundByName(CURRENT_SYNC_ROUND)) return;
  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.indexOf('PASTE_YOUR') === 0) return;
  upsertRound({ name: CURRENT_SYNC_ROUND, driveFolderId: DRIVE_FOLDER_ID, status: 'ongoing' }, null);
}

function syncFromDrive() {
  ensureRoundHasDefaultFolder();
  var rounds = readRounds()
    .map(function (r) { return Object.assign({}, r, { driveFolderId: normalizeDriveFolderId(r.driveFolderId) }); })
    .filter(function (r) { return r.driveFolderId; });
  if (!rounds.length) {
    return { error: '동기화할 회차가 없어요. 프로그램 탭에서 회차를 만들고 드라이브 폴더 ID를 입력해주세요.' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sessionCount = getSessionCount();
    var keywordMap = getKeywordMapForCount(sessionCount);
    var sessionNums = [];
    for (var sn = 1; sn <= sessionCount; sn++) sessionNums.push(sn);

    var startTime = Date.now();
    var TIME_BUDGET_MS = 4.5 * 60 * 1000;
    var totals = { foldersScanned: 0, matched: 0, created: 0, skipped: 0 };
    var debugParts = [];

    for (var ri = 0; ri < rounds.length; ri++) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        debugParts.push('시간이 오래 걸려서 일부 회차는 처리하지 못했어요. "드라이브에서 불러오기"를 다시 누르면 이어서 처리돼요.');
        break;
      }
      // 다른 회차 전용 폴더가 지금 회차 폴더 밑에 우연히 중첩돼 있어도(예: 공용 상위
      // 폴더 밑에 회차별 폴더가 형제로 있는 게 아니라 실수로 안쪽에 들어간 경우) 그 안까지
      // 잘못 훑지 않도록, 다른 회차들의 driveFolderId는 재귀 탐색에서 건너뛰어요.
      var otherRoundFolderIds = rounds.filter(function (r) { return r.driveFolderId !== rounds[ri].driveFolderId; })
        .map(function (r) { return r.driveFolderId; });
      var result = syncRoundFolder(rounds[ri], sessionCount, keywordMap, sessionNums, startTime, TIME_BUDGET_MS, otherRoundFolderIds);
      totals.foldersScanned += result.foldersScanned;
      totals.matched += result.matched;
      totals.created += result.created;
      totals.skipped += result.skipped;
      if (result.debug) debugParts.push('[' + rounds[ri].name + '] ' + result.debug);
    }

    if (debugParts.length) totals.debug = debugParts.join(' / ');
    return totals;
  } finally {
    lock.releaseLock();
  }
}

// 회차 하나의 드라이브 루트 폴더를 스캔해서 rows 시트에 반영해요. 기존 행을 찾을 때
// "기업명 + 회차"로 매칭해서, 같은 기업이 다른 회차에도 있어도 서로 안 섞이고 독립된
// 행으로 남아요.
function syncRoundFolder(round, sessionCount, keywordMap, sessionNums, startTime, TIME_BUDGET_MS, excludeFolderIds) {
  var folderId = round.driveFolderId;
  var roundName = round.name;
  var excludeList = excludeFolderIds || [];
  // 진단용 접두어 — folderId·exclude 목록·실제로 제외된 폴더가 몇 개였는지를 항상 결과에
  // 남겨서, "다른 회차 폴더가 왜 안 걸러지는지" 같은 문제를 화면에서 바로 확인할 수 있게 해요.
  function diagPrefix(companyFolders) {
    var excludedNames = (companyFolders && companyFolders.excludedNames) || [];
    return 'folderId=' + folderId + ', exclude=[' + excludeList.join(', ') + '], 실제 제외된 폴더=[' + excludedNames.join(', ') + ']';
  }

  var companyFolders;
  try {
    companyFolders = collectCompanyFolders(folderId, excludeFolderIds);
  } catch (err) {
    return { foldersScanned: 0, matched: 0, created: 0, skipped: 0, debug: '드라이브 폴더에 접근할 수 없어요: ' + err.message + ' — ID가 정확한지, Drive API 서비스를 추가했는지 확인해주세요. (' + diagPrefix() + ')' };
  }

  if (companyFolders.length === 0) {
    var rootChildren = [];
    try { rootChildren = listDriveChildren(folderId); } catch (e) {}
    var debugMsg;
    if (rootChildren.length === 0) {
      debugMsg = '지정한 위치(' + folderId + ') 바로 아래에 항목이 하나도 없어요. ID가 맞는지, 스크립트를 실행하는 계정이 그 위치에 접근 권한이 있는지 확인해주세요.';
    } else {
      debugMsg = '멘티기업 폴더("번호_권역_기업명" 형태)를 찾지 못했어요. 바로 아래 항목 ' + rootChildren.length + '개: ' +
        rootChildren.slice(0, 20).map(function (f) { return f.name + ' [' + f.mimeType + ']'; }).join(', ');
    }
    return { foldersScanned: 0, matched: 0, created: 0, skipped: 0, debug: debugMsg + ' (' + diagPrefix(companyFolders) + ')' };
  }

  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var companyCol = HEADERS.indexOf('company');
  var roundCol = HEADERS.indexOf('round');
  var sessionCols = sessionNums.map(function (n) { return HEADERS.indexOf('session' + n); });
  var planCol = HEADERS.indexOf('plan');
  var reportCol = HEADERS.indexOf('report');
  var folderIdCol = HEADERS.indexOf('folderId');

  var foldersScanned = 0, matched = 0, created = 0, skipped = 0;

  for (var idx = 0; idx < companyFolders.length; idx++) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      return {
        foldersScanned: foldersScanned, matched: matched, created: created, skipped: skipped,
        debug: '시간이 오래 걸려서 일부만 처리했어요 (전체 ' + companyFolders.length + '개 중 ' + foldersScanned + '개 확인). 이미 다 채워진 기업은 다음 실행 때 건너뛰니, "드라이브에서 불러오기"를 몇 번 더 누르면 나머지가 이어서 처리돼요.'
      };
    }

    var info = companyFolders[idx];
    foldersScanned++;

    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      var rowRound = values[i][roundCol] || DEFAULT_ROUND;
      if (String(values[i][companyCol]).trim() === info.company && rowRound === roundName) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex !== -1) {
      var alreadyDone = sessionCols.every(function (c) { return !!values[rowIndex][c]; }) &&
        !!values[rowIndex][planCol] && !!values[rowIndex][reportCol];
      var hasFolderId = !!values[rowIndex][folderIdCol];
      if (alreadyDone && hasFolderId) {
        skipped++;
        continue;
      }
      if (alreadyDone && !hasFolderId) {
        sheet.getRange(rowIndex + 1, folderIdCol + 1).setValue(info.id || '');
        values[rowIndex][folderIdCol] = info.id || '';
        matched++;
        continue;
      }
    }

    var fileNames = listDriveChildren(info.id, false).map(function (f) { return f.name; });
    var flags = {};
    keywordMap.forEach(function (k) {
      flags[k.field] = fileNames.some(function (name) {
        return k.keywords.some(function (kw) { return name.indexOf(kw) !== -1; });
      });
    });

    if (rowIndex === -1) {
      var newSessions = sessionNums.map(function (n) { return !!flags['session' + n]; });
      var newPlan = !!flags.plan, newReport = !!flags.report;
      var newRow = {
        id: Utilities.getUuid(),
        date: '',
        folderNc: info.folderNc || '',
        region: info.region || '',
        company: info.company,
        sessions: newSessions,
        plan: newPlan,
        report: newReport,
        complete: newSessions.every(function (v) { return v; }) && newPlan && newReport,
        flag: 'none',
        remark: '',
        round: roundName,
        folderId: info.id || ''
      };
      upsertRow(newRow);
      created++;
    } else {
      var existingArr = values[rowIndex];
      var existing = {};
      for (var c = 0; c < HEADERS.length; c++) existing[HEADERS[c]] = existingArr[c];
      var sessionsArr = sessionNums.map(function (n) { return !!existing['session' + n]; });
      sessionNums.forEach(function (n) {
        if (flags['session' + n]) sessionsArr[n - 1] = true;
      });
      var mergedPlan = existing.plan || !!flags.plan;
      var mergedReport = existing.report || !!flags.report;
      var updatedRow = {
        id: existing.id,
        date: existing.date,
        folderNc: existing.folderNc || info.folderNc || '',
        region: existing.region || info.region || '',
        company: existing.company,
        sessions: sessionsArr,
        plan: mergedPlan,
        report: mergedReport,
        complete: sessionsArr.every(function (v) { return v; }) && mergedPlan && mergedReport,
        flag: existing.flag,
        remark: existing.remark,
        round: roundName,
        folderId: info.id || existing.folderId || ''
      };
      upsertRow(updatedRow);
      matched++;
    }
  }

  var companyList = companyFolders.length <= 8
    ? companyFolders.map(function (f) { return f.company; }).join(', ')
    : companyFolders.slice(0, 8).map(function (f) { return f.company; }).join(', ') + ' 외 ' + (companyFolders.length - 8) + '개';
  return {
    foldersScanned: foldersScanned, matched: matched, created: created, skipped: skipped,
    debug: diagPrefix(companyFolders) + ', 찾은 기업 ' + companyFolders.length + '개(' + companyList + ')'
  };
}

function listDriveChildren(parentId, foldersOnly) {
  var mimeClause = '';
  if (foldersOnly === true) mimeClause = " and mimeType = '" + FOLDER_MIME + "'";
  else if (foldersOnly === false) mimeClause = " and mimeType != '" + FOLDER_MIME + "'";

  var query = "'" + parentId + "' in parents and trashed = false" + mimeClause;
  var results = [];
  var pageToken = null;
  do {
    var response = Drive.Files.list({
      q: query,
      fields: 'nextPageToken, files(id, name, mimeType)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
      pageSize: 1000,
      pageToken: pageToken || undefined
    });
    results = results.concat(response.files || []);
    pageToken = response.nextPageToken;
  } while (pageToken);
  return results;
}

// excludeFolderIds: 이 ID들과 일치하는 하위 폴더는 재귀 탐색에서 건너뛰어요. 회차별
// 드라이브 폴더가 공용 상위 폴더 밑에 형제로 있지 않고 실수로 서로 안쪽에 중첩돼 있어도,
// 다른 회차 전용 폴더 안의 기업 폴더까지 이 회차로 잘못 잡아오는 걸 막기 위해서예요.
// excludedNames: 실제로 몇 번, 어떤 이름의 폴더가 제외됐는지 진단용으로 같이 모아둬요 —
// 제외가 기대대로 작동하는지 동기화 결과 메시지로 바로 확인할 수 있게.
function collectCompanyFolders(rootId, excludeFolderIds) {
  var results = [];
  var excludedNames = [];
  var COMPANY_NAME_RE = /^(\d+)[_.]\s*([^_]+)_(.+)$/;
  var exclude = excludeFolderIds || [];

  function walk(folderId, depth) {
    if (depth > 6) return;
    var children = listDriveChildren(folderId, true);
    children.forEach(function (child) {
      if (exclude.indexOf(child.id) !== -1) {
        excludedNames.push(child.name + '(' + child.id + ')');
        return;
      }
      var m = child.name.match(COMPANY_NAME_RE);
      if (m) {
        results.push({ id: child.id, folderNc: m[1], region: m[2].trim(), company: m[3].trim() });
      } else {
        walk(child.id, depth + 1);
      }
    });
  }

  walk(rootId, 0);
  results.excludedNames = excludedNames;
  return results;
}
