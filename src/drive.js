// 회차는 더 이상 "어느 드라이브 폴더에서 찾았는지"로 자동 판별하지 않아요. 공유 루트 폴더
// (DRIVE_FOLDER_ID) 하나만 쓰고, 회차 구분은 각 기업 폴더 "안"의 하위 폴더 이름으로 해요:
// - 1회차(CURRENT_SYNC_ROUND): 기존처럼 기업 폴더 바로 안의 파일을 봐요(마이그레이션 불필요).
// - 2회차 이후: 기업 폴더 밑에 그 회차 이름과 똑같은 하위 폴더(예: "2회차")를 만들어서 그
//   안에 자료를 넣어요. 그 하위 폴더가 아직 없으면 "이 기업은 이 회차 자료가 아직 없음"으로
//   보고 건너뛰어요(에러 아님).
// 이러면 회차마다 별도 루트 폴더 ID를 프로그램 탭에 등록할 필요가 없고, 폴더 배치 실수로
// 다른 회차 자료가 섞여 들어올 걱정도 없어요(공유 트리가 하나뿐이라 애초에 겹칠 폴더가 없음).

function syncFromDrive(onlyRoundName) {
  var allRounds = readRounds();
  if (!allRounds.length) {
    return { error: '동기화할 회차가 없어요. 프로그램 탭에서 회차를 먼저 만들어주세요.' };
  }

  var rounds = allRounds;
  if (onlyRoundName && onlyRoundName !== 'all') {
    rounds = allRounds.filter(function (r) { return r.name === onlyRoundName; });
    if (!rounds.length) {
      return { error: '"' + onlyRoundName + '" 회차를 찾을 수 없어요. 프로그램 탭에서 먼저 만들어주세요.' };
    }
  }

  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.indexOf('PASTE_YOUR') === 0) {
    return { error: 'DRIVE_FOLDER_ID가 설정되지 않았어요. 코드 상단에 드라이브 폴더 ID를 붙여넣어 주세요.' };
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

    // 공유 트리 탐색은 동기화 대상 회차 수와 무관하게 한 번만 해요 — 회차가 여러 개여도
    // 기업 폴더 자체를 찾는 비용은 늘지 않아요.
    var companyFolders;
    try {
      companyFolders = collectCompanyFolders(DRIVE_FOLDER_ID);
    } catch (err) {
      return { error: '드라이브 폴더에 접근할 수 없어요: ' + err.message + ' — ID가 정확한지, Drive API 서비스를 추가했는지 확인해주세요.' };
    }

    if (companyFolders.length === 0) {
      var rootChildren = [];
      try { rootChildren = listDriveChildren(DRIVE_FOLDER_ID); } catch (e) {}
      var debugMsg;
      if (rootChildren.length === 0) {
        debugMsg = '지정한 위치(' + DRIVE_FOLDER_ID + ') 바로 아래에 항목이 하나도 없어요. ID가 맞는지, 스크립트를 실행하는 계정이 그 위치에 접근 권한이 있는지 확인해주세요.';
      } else {
        debugMsg = '멘티기업 폴더("번호_권역_기업명" 형태)를 찾지 못했어요. 바로 아래 항목 ' + rootChildren.length + '개: ' +
          rootChildren.slice(0, 20).map(function (f) { return f.name + ' [' + f.mimeType + ']'; }).join(', ');
      }
      return { foldersScanned: 0, matched: 0, created: 0, debug: debugMsg };
    }

    var totals = { foldersScanned: 0, matched: 0, created: 0, skipped: 0 };
    var debugParts = [];

    for (var ri = 0; ri < rounds.length; ri++) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        debugParts.push('시간이 오래 걸려서 일부 회차는 처리하지 못했어요. "드라이브에서 불러오기"를 다시 누르면 이어서 처리돼요.');
        break;
      }
      var result = syncRoundFromFolders(rounds[ri], companyFolders, sessionNums, keywordMap, startTime, TIME_BUDGET_MS);
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

// 회차 하나를, 이미 탐색해둔 공유 기업 폴더 목록(companyFolders) 기준으로 처리해요. 1회차면
// 기업 폴더 자체를, 그 외 회차면 그 이름의 하위 폴더를 파일 위치로 써요.
function syncRoundFromFolders(round, companyFolders, sessionNums, keywordMap, startTime, TIME_BUDGET_MS) {
  var roundName = round.name;
  var isBaseline = roundName === CURRENT_SYNC_ROUND;

  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var companyCol = HEADERS.indexOf('company');
  var roundCol = HEADERS.indexOf('round');
  var sessionCols = sessionNums.map(function (n) { return HEADERS.indexOf('session' + n); });
  var planCol = HEADERS.indexOf('plan');
  var reportCol = HEADERS.indexOf('report');
  var folderIdCol = HEADERS.indexOf('folderId');

  var foldersScanned = 0, matched = 0, created = 0, skipped = 0;

  // 1차: 시트만 보고 이미 다 채워졌고 폴더ID도 있는 건 API 호출 없이 바로 건너뛰어요.
  var needsWork = [];
  companyFolders.forEach(function (info) {
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
      if (alreadyDone && !!values[rowIndex][folderIdCol]) { skipped++; return; }
    }
    needsWork.push({ info: info, rowIndex: rowIndex });
  });

  // 2차: 1회차가 아니면, 각 기업 폴더 밑에서 회차 이름과 똑같은 하위 폴더를 배치로 찾아요.
  // 못 찾으면 이 기업은 이 회차 자료가 아직 없는 거라 건너뛰어요(에러 아님).
  var sourceFolderById = {};
  if (isBaseline) {
    needsWork.forEach(function (w) { sourceFolderById[w.info.id] = w.info.id; });
  } else {
    var subfolderMap = batchFindSubfolder(needsWork.map(function (w) { return w.info.id; }), roundName);
    needsWork.forEach(function (w) { sourceFolderById[w.info.id] = subfolderMap[w.info.id] || null; });
  }
  var pending = needsWork.filter(function (w) { return sourceFolderById[w.info.id]; });

  // 3차: 파일 목록이 실제로 필요한 것만 한꺼번에 병렬 조회.
  var fileListsBySource = batchListDriveFiles(pending.map(function (w) { return sourceFolderById[w.info.id]; }));

  for (var pi = 0; pi < pending.length; pi++) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      return {
        foldersScanned: foldersScanned, matched: matched, created: created, skipped: skipped,
        debug: '시간이 오래 걸려서 일부만 처리했어요. "드라이브에서 불러오기"를 다시 누르면 이어서 처리돼요.'
      };
    }

    var info = pending[pi].info;
    var rowIndex = pending[pi].rowIndex;
    var sourceFolderId = sourceFolderById[info.id];
    var fileNames = fileListsBySource[sourceFolderId] || [];
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
        folderId: sourceFolderId || ''
      };
      // syncFromDrive()가 이미 전체 동기화 동안 잠금을 쥐고 있어서(Lock timeout 방지),
      // 여기서는 잠금을 또 걸지 않는 버전을 써요.
      upsertRowUnlocked(newRow);
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
        folderId: sourceFolderId || existing.folderId || ''
      };
      upsertRowUnlocked(updatedRow);
      matched++;
    }
  }

  return { foldersScanned: foldersScanned, matched: matched, created: created, skipped: skipped };
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

// 여러 부모 폴더 밑의 자식들을 한 번에 병렬로 조회하는 범용 헬퍼예요(파일 목록 조회, 이름이
// 같은 하위 폴더 찾기 둘 다 이걸로 처리). Drive 고급 서비스는 폴더 하나당 순서대로 기다려야
// 해서 확인할 폴더가 많을수록 왕복 시간이 그대로 쌓이는데, UrlFetchApp.fetchAll로 한 번에
// 보내면 네트워크 대기 시간이 거의 다 겹쳐져서 훨씬 빨라져요.
function batchQueryChildren(parentIds, extraClause, fields) {
  var byId = {};
  if (!parentIds.length) return byId;
  var token = ScriptApp.getOAuthToken();
  var BATCH_SIZE = 80; // 한 번에 너무 많이 보내면 오히려 불안정해질 수 있어서 적당히 나눠 보내요.
  for (var start = 0; start < parentIds.length; start += BATCH_SIZE) {
    var chunk = parentIds.slice(start, start + BATCH_SIZE);
    var requests = chunk.map(function (id) {
      var q = "'" + id + "' in parents and trashed = false" + extraClause;
      var url = 'https://www.googleapis.com/drive/v3/files' +
        '?q=' + encodeURIComponent(q) +
        '&fields=' + encodeURIComponent('files(' + fields + ')') +
        '&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives&pageSize=1000';
      return { url: url, headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
    });
    var responses;
    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (err) {
      // 병렬 조회 자체가 실패하면(권한 재승인이 필요한 경우 등) 빈 목록으로 처리해서, 이번
      // 실행에서는 해당 항목들을 건너뛰고 다음 실행 때 다시 시도하게 해요.
      chunk.forEach(function (id) { byId[id] = []; });
      continue;
    }
    responses.forEach(function (res, i) {
      var id = chunk[i];
      try {
        if (res.getResponseCode() !== 200) { byId[id] = []; return; }
        var data = JSON.parse(res.getContentText());
        byId[id] = data.files || [];
      } catch (e) {
        byId[id] = [];
      }
    });
  }
  return byId;
}

function batchListDriveFiles(folderIds) {
  var byId = batchQueryChildren(folderIds, " and mimeType != '" + FOLDER_MIME + "'", 'name');
  var result = {};
  Object.keys(byId).forEach(function (id) { result[id] = byId[id].map(function (f) { return f.name; }); });
  return result;
}

// 각 parentId 밑에서 이름이 subfolderName과 똑같은 하위 폴더를 찾아요(회차별 자료 폴더 찾기
// 용도). 없으면 null.
function batchFindSubfolder(parentIds, subfolderName) {
  var safeName = String(subfolderName).replace(/'/g, "\\'");
  var byId = batchQueryChildren(parentIds, " and mimeType = '" + FOLDER_MIME + "' and name = '" + safeName + "'", 'id');
  var result = {};
  Object.keys(byId).forEach(function (id) {
    result[id] = byId[id].length ? byId[id][0].id : null;
  });
  return result;
}

function collectCompanyFolders(rootId) {
  var results = [];
  var COMPANY_NAME_RE = /^(\d+)[_.]\s*([^_]+)_(.+)$/;

  function walk(folderId, depth) {
    if (depth > 6) return;
    var children = listDriveChildren(folderId, true);
    children.forEach(function (child) {
      var m = child.name.match(COMPANY_NAME_RE);
      if (m) {
        results.push({ id: child.id, folderNc: m[1], region: m[2].trim(), company: m[3].trim() });
      } else {
        walk(child.id, depth + 1);
      }
    });
  }

  walk(rootId, 0);
  return results;
}
