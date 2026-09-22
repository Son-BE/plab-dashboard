function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    Logger.log('doGet action=' + params.action + ' user=' + params.u);
    var user = authenticate(params.u, params.p);
    if (!user) {
      return respond({ error: 'auth', message: '아이디 또는 비밀번호가 올바르지 않아요.' });
    }
    if (params.action === 'getLog') {
      if (user.role !== 'admin') {
        return respond({ ok: false, error: 'forbidden', message: '관리자만 볼 수 있어요.' });
      }
      return respond({ ok: true, log: readLog(200) });
    }
    var data = readAll();
    var rows = data.rows;
    if (user.region && user.region !== 'all') {
      rows = rows.filter(function (r) { return (r.region || '미지정') === user.region; });
    }
    return respond({ rows: rows, role: user.role, region: user.region, lastSync: getLastSyncInfo(), sessionCount: data.sessionCount, lastDigest: getLastDigestInfo(), flagThresholds: getFlagThresholds() });
  } catch (err) {
    Logger.log('doGet 오류: ' + err + (err && err.stack ? ('\n' + err.stack) : ''));
    return respond({ error: 'server', message: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    Logger.log('doPost action=' + body.action + ' user=' + body.u);
    var user = authenticate(body.u, body.p);
    if (!user) {
      return respond({ ok: false, error: 'auth', message: '아이디 또는 비밀번호가 올바르지 않아요.' });
    }

    if (body.action === 'setUpload') {
      return respond(setUploadField(user, body.id, body.field, body.value));
    }

    if (user.role !== 'admin') {
      return respond({ ok: false, error: 'forbidden', message: '이 계정은 수정 권한이 없어요.' });
    }

    if (body.action === 'upsert' && body.row) {
      upsertRow(body.row, user);
      return respond({ ok: true });
    }
    if (body.action === 'delete' && body.id) {
      deleteRow(body.id, user);
      return respond({ ok: true });
    }
    if (body.action === 'syncFromDrive') {
      var result = syncFromDrive();
      recordSyncResult(result);
      return respond({ ok: true, result: result, lastSync: getLastSyncInfo() });
    }
    if (body.action === 'setSessionCount') {
      return respond(setSessionCountConfig(body.value, user));
    }
    if (body.action === 'setFlagThresholds') {
      return respond(setFlagThresholds(body.value, user));
    }
    if (body.action === 'sendReminderEmails') {
      return respond(sendCustomReminderEmails(body.ids, body.subject, body.body, user));
    }
    return respond({ ok: false, error: 'unknown action', message: '알 수 없는 요청이에요(action: ' + body.action + '). 배포가 최신 코드로 안 됐을 수 있어요.' });
  } catch (err) {
    Logger.log('doPost 오류: ' + err + (err && err.stack ? ('\n' + err.stack) : ''));
    return respond({ ok: false, error: String(err), message: String(err) });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
