function syncFromDrive() {
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

    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();
    var companyCol = HEADERS.indexOf('company');
    var sessionCols = sessionNums.map(function (n) { return HEADERS.indexOf('session' + n); });
    var planCol = HEADERS.indexOf('plan');
    var reportCol = HEADERS.indexOf('report');
    var folderIdCol = HEADERS.indexOf('folderId');

    var foldersScanned = 0, matched = 0, created = 0, skipped = 0;
    var startTime = Date.now();
    var TIME_BUDGET_MS = 4.5 * 60 * 1000;

    for (var idx = 0; idx < companyFolders.length; idx++) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        return {
          foldersScanned: foldersScanned,
          matched: matched,
          created: created,
          skipped: skipped,
          debug: '시간이 오래 걸려서 일부만 처리했어요 (전체 ' + companyFolders.length + '개 중 ' + foldersScanned + '개 확인). 이미 다 채워진 기업은 다음 실행 때 건너뛰니, "드라이브에서 불러오기"를 몇 번 더 누르면 나머지가 이어서 처리돼요.'
        };
      }

      var info = companyFolders[idx];
      foldersScanned++;

      var rowIndex = -1;
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][companyCol]).trim() === info.company) {
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
          round: CURRENT_SYNC_ROUND,
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
          round: existing.round || CURRENT_SYNC_ROUND,
          folderId: info.id || existing.folderId || ''
        };
        upsertRow(updatedRow);
        matched++;
      }
    }

    return { foldersScanned: foldersScanned, matched: matched, created: created, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
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
