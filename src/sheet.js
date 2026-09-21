function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  } else {
    if (sheet.getMaxColumns() < HEADERS.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
    }
    var firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    var isCorrect = HEADERS.every(function (h, i) { return firstRow[i] === h; });
    if (!isCorrect) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
  }
  return sheet;
}

function formatDateCell(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  }
  if (typeof value === 'string' && value) {
    return value.length >= 10 ? value.slice(0, 10) : value;
  }
  return '';
}

function readAll() {
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var sessionCount = getSessionCount();
  if (values.length < 2) return { rows: [], sessionCount: sessionCount };

  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var raw = values[i];
    if (!raw[0]) continue;

    var obj = {};
    for (var c = 0; c < HEADERS.length; c++) obj[HEADERS[c]] = raw[c];
    obj.date = formatDateCell(obj.date);

    var sessions = [];
    for (var n = 1; n <= sessionCount; n++) sessions.push(!!obj['session' + n]);

    for (var n2 = 1; n2 <= MAX_SESSIONS; n2++) {
      delete obj['session' + n2];
      if (n2 > sessionCount) delete obj['upSession' + n2];
    }

    obj.sessions = sessions;
    obj.plan = !!obj.plan;
    obj.report = !!obj.report;
    obj.complete = !!obj.complete;
    obj.round = obj.round || DEFAULT_ROUND;

    for (var n3 = 1; n3 <= sessionCount; n3++) obj['upSession' + n3] = !!obj['upSession' + n3];
    obj.upPlan = !!obj.upPlan;
    obj.upReport = !!obj.upReport;
    rows.push(obj);
  }

  return { rows: rows, sessionCount: sessionCount };
}

function rowToArray(row, existingArr) {
  var sessionCount = getSessionCount();
  return HEADERS.map(function (h, i) {
    var sMatch = /^session(\d+)$/.exec(h);
    if (sMatch) {
      var sn = Number(sMatch[1]);
      if (sn <= sessionCount) return row.sessions ? !!row.sessions[sn - 1] : false;
      return existingArr ? existingArr[i] : false;
    }

    var uMatch = /^upSession(\d+)$/.exec(h);
    if (uMatch) {
      var un = Number(uMatch[1]);
      if (un > sessionCount) return existingArr ? existingArr[i] : false;
      return row[h] !== undefined && row[h] !== null ? row[h] : (existingArr ? existingArr[i] : false);
    }

    if (row[h] !== undefined && row[h] !== null) return row[h];
    return existingArr ? existingArr[i] : '';
  });
}

function upsertRow(row) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();
    var idCol = HEADERS.indexOf('id');
    var rowIndex = -1;
    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] === row.id) {
        rowIndex = i + 1;
        break;
      }
    }
    var existingArr = rowIndex !== -1 ? values[rowIndex - 1] : null;
    var arr = rowToArray(row, existingArr);
    if (rowIndex === -1) {
      sheet.appendRow(arr);
    } else {
      sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([arr]);
    }
  } finally {
    lock.releaseLock();
  }
}

function deleteRow(id) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function setUploadField(user, id, field, value) {
  var sessionCount = getSessionCount();
  var uploadFields = getUploadFieldNames(sessionCount);
  var uploadToSource = getUploadToSourceMap(sessionCount);
  if (!id || uploadFields.indexOf(field) === -1) {
    return { ok: false, error: 'invalid field' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();
    var idCol = HEADERS.indexOf('id');
    var regionCol = HEADERS.indexOf('region');
    var fieldCol = HEADERS.indexOf(field);
    var sourceField = uploadToSource[field];
    var sourceCol = sourceField ? HEADERS.indexOf(sourceField) : -1;

    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] === id) {
        var rowRegion = values[i][regionCol] || '미지정';
        if (user.region && user.region !== 'all' && rowRegion !== user.region) {
          return { ok: false, error: 'forbidden', message: '담당 권역 데이터만 체크할 수 있어요.' };
        }
        if (value && sourceCol !== -1 && !values[i][sourceCol]) {
          return { ok: false, error: 'not-available', message: '취합현황에 아직 자료가 없어서 체크할 수 없어요.' };
        }
        sheet.getRange(i + 1, fieldCol + 1).setValue(!!value);
        return { ok: true };
      }
    }
    return { ok: false, error: 'not found' };
  } finally {
    lock.releaseLock();
  }
}
