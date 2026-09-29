// ── 고객사(기업 마스터) 관리 ─────────────────────────────────────────────
// rows 시트는 회차별 기록이라, 같은 기업이 회차마다 별도 행으로 흩어져 있다. 이 파일은
// 회차와 독립된 기업 자체의 프로필(담당자, 사업자정보, 활성 상태 등)을 다루는 별도
// "companies" 시트를 관리한다. 기업 식별은 rows 시트와 동일하게 ID가 아니라 이름
// 문자열을 기준으로 한다(드라이브 동기화도 이름으로 매칭하므로 일관성을 맞춤).

function getCompanySheet() {
  return ensureSheetWithHeaders(COMPANY_SHEET_NAME, COMPANY_HEADERS);
}

function normalizeCompanyName(name) {
  return String(name || '').trim();
}

function readCompanies() {
  var sheet = getCompanySheet();
  var values = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var raw = values[i];
    if (!raw[0]) continue;
    var obj = {};
    for (var c = 0; c < COMPANY_HEADERS.length; c++) obj[COMPANY_HEADERS[c]] = raw[c];
    list.push(obj);
  }
  return list;
}

function findCompanyByName(name) {
  var target = normalizeCompanyName(name).toLowerCase();
  if (!target) return null;
  var list = readCompanies();
  for (var i = 0; i < list.length; i++) {
    if (normalizeCompanyName(list[i].name).toLowerCase() === target) return list[i];
  }
  return null;
}

// rows 시트나 드라이브 동기화에서 처음 보는 기업이 나타났을 때 자동으로 stub 레코드를
// 만들어준다. 사람이 직접 한 액션이 아니라서 로그는 남기지 않는다.
function ensureCompanyExists(name, region) {
  name = normalizeCompanyName(name);
  if (!name) return;
  if (findCompanyByName(name)) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (findCompanyByName(name)) return;
    var now = new Date().toISOString();
    var sheet = getCompanySheet();
    var arr = COMPANY_HEADERS.map(function (h) {
      if (h === 'id') return Utilities.getUuid();
      if (h === 'name') return name;
      if (h === 'region') return region || '';
      if (h === 'status') return 'active';
      if (h === 'createdAt' || h === 'updatedAt') return now;
      return '';
    });
    sheet.appendRow(arr);
  } finally {
    lock.releaseLock();
  }
}

function companyToArray(company, existingArr) {
  var now = new Date().toISOString();
  return COMPANY_HEADERS.map(function (h, i) {
    if (h === 'updatedAt') return now;
    if (h === 'createdAt') return existingArr ? existingArr[i] : now;
    if (h === 'id') return existingArr ? existingArr[i] : Utilities.getUuid();
    if (company[h] !== undefined && company[h] !== null) return company[h];
    return existingArr ? existingArr[i] : '';
  });
}

function upsertCompany(company, user) {
  var name = normalizeCompanyName(company && company.name);
  if (!name) return { ok: false, error: 'invalid', message: '기업명을 입력해주세요.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getCompanySheet();
    var values = sheet.getDataRange().getValues();
    var idCol = COMPANY_HEADERS.indexOf('id');
    var nameCol = COMPANY_HEADERS.indexOf('name');
    var rowIndex = -1;
    if (company.id) {
      for (var i = 1; i < values.length; i++) {
        if (values[i][idCol] === company.id) { rowIndex = i + 1; break; }
      }
    }

    var duplicate = null;
    for (var j = 1; j < values.length; j++) {
      if (values[j][idCol] !== company.id && normalizeCompanyName(values[j][nameCol]).toLowerCase() === name.toLowerCase()) {
        duplicate = values[j][nameCol];
        break;
      }
    }

    var existingArr = rowIndex !== -1 ? values[rowIndex - 1] : null;
    var arr = companyToArray(Object.assign({}, company, { name: name }), existingArr);
    if (rowIndex === -1) {
      sheet.appendRow(arr);
    } else {
      sheet.getRange(rowIndex, 1, 1, COMPANY_HEADERS.length).setValues([arr]);
    }

    if (user) {
      appendLog(user, 'upsertCompany', '', name, existingArr ? '고객사 정보 수정' : '고객사 신규 등록');
    }

    var result = { ok: true, companies: readCompanies() };
    if (duplicate) result.warning = '이미 같은 이름의 고객사가 있어요 — 오탈자가 아닌지 확인해주세요.';
    return result;
  } finally {
    lock.releaseLock();
  }
}

function deleteCompany(id, user) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getCompanySheet();
    var values = sheet.getDataRange().getValues();
    var idCol = COMPANY_HEADERS.indexOf('id');
    var nameCol = COMPANY_HEADERS.indexOf('name');
    for (var i = 1; i < values.length; i++) {
      if (values[i][idCol] === id) {
        var name = values[i][nameCol];
        sheet.deleteRow(i + 1);
        if (user) appendLog(user, 'deleteCompany', '', name, '고객사 삭제(회차별 기록은 유지됨)');
        return { ok: true, companies: readCompanies() };
      }
    }
    return { ok: false, error: 'not-found', message: '고객사를 찾을 수 없어요.' };
  } finally {
    lock.releaseLock();
  }
}
