function recordSyncResult(result) {
  var summary;
  if (result && result.error) {
    summary = '오류: ' + result.error;
  } else if (result) {
    summary = (result.foldersScanned || 0) + '개 폴더 확인 · 갱신 ' + (result.matched || 0) + '건 · 신규 ' + (result.created || 0) + '건' +
      (result.skipped ? (' · 건너뜀 ' + result.skipped + '건') : '') +
      (result.debug ? (' — ' + result.debug) : '');
  } else {
    summary = '완료';
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LAST_SYNC_AT', new Date().toISOString());
  props.setProperty('LAST_SYNC_SUMMARY', summary);
}

function getLastSyncInfo() {
  var props = PropertiesService.getScriptProperties();
  var at = props.getProperty('LAST_SYNC_AT');
  if (!at) return null;
  return { at: at, summary: props.getProperty('LAST_SYNC_SUMMARY') || '' };
}

function daysSinceServer(dateStr) {
  if (!dateStr) return null;
  var start = new Date(dateStr + 'T00:00:00');
  if (isNaN(start.getTime())) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today - start) / 86400000);
}

function computeAutoFlagServer(dateStr, complete) {
  if (complete) return 'none';
  var days = daysSinceServer(dateStr);
  if (days === null) return 'none';
  var t = getFlagThresholds();
  if (days >= t.issue) return 'issue';
  if (days >= t.alert) return 'alert';
  if (days >= t.caution) return 'caution';
  return 'none';
}

function missingItemsLabel(row, sessionCount) {
  var missing = [];
  for (var n = 1; n <= sessionCount; n++) {
    if (!row.sessions[n - 1]) missing.push(n + '회차');
  }
  if (!row.plan) missing.push('계획서');
  if (!row.report) missing.push('보고서');
  return missing;
}

function buildOverdueList() {
  var data = readAll();
  var sessionCount = data.sessionCount;
  var list = [];
  data.rows.forEach(function (r) {
    var flag = r.flagOverride || computeAutoFlagServer(r.date, r.complete);
    if (flag === 'none') return;
    list.push({
      region: r.region || '미지정',
      company: r.company,
      date: r.date,
      days: daysSinceServer(r.date),
      flag: flag,
      contactEmail: r.contactEmail || '',
      missing: missingItemsLabel(r, sessionCount)
    });
  });
  return list;
}

function getAdminNotifyEmail() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_NOTIFY_EMAIL') || '';
}

function getCompanyReminderEnabled() {
  return PropertiesService.getScriptProperties().getProperty('COMPANY_REMINDER_ENABLED') === 'true';
}

function sendOverdueDigest() {
  var adminEmail = getAdminNotifyEmail();
  if (!adminEmail) {
    var skippedResult = { skipped: true, reason: 'ADMIN_NOTIFY_EMAIL 미설정' };
    recordDigestResult(skippedResult);
    Logger.log('ADMIN_NOTIFY_EMAIL이 설정되지 않아서 관리자 알림 메일을 건너뛰었어요.');
    return skippedResult;
  }

  var list = buildOverdueList();
  if (list.length === 0) {
    var emptyResult = { overdueCount: 0 };
    recordDigestResult(emptyResult);
    return emptyResult;
  }

  var order = { issue: 0, alert: 1, caution: 2 };
  list.sort(function (a, b) { return (order[a.flag] - order[b.flag]) || (b.days - a.days); });
  var counts = { issue: 0, alert: 0, caution: 0 };
  list.forEach(function (item) { counts[item.flag]++; });

  var lines = [];
  ['issue', 'alert', 'caution'].forEach(function (flag) {
    var items = list.filter(function (i) { return i.flag === flag; });
    if (!items.length) return;
    lines.push('■ ' + FLAG_LABELS_KO[flag] + ' (' + items.length + '개)');
    items.forEach(function (i) {
      lines.push('- [' + i.region + '] ' + i.company + ' · 협약일자 ' + i.date + ' · ' + i.days + '일 경과' +
        (i.missing.length ? (' · 미완료: ' + i.missing.join(', ')) : ''));
    });
    lines.push('');
  });

  var subject = '[멘토링 트래커] 지연 기업 알림 — 문제 ' + counts.issue + ' · 경고 ' + counts.alert + ' · 주의 ' + counts.caution;
  MailApp.sendEmail(adminEmail, subject, lines.join('\n'));
  var result = { overdueCount: list.length, counts: counts };
  recordDigestResult(result);
  return result;
}

function sendCompanyReminders() {
  if (!getCompanyReminderEnabled()) {
    return { skipped: true, reason: '잠김(COMPANY_REMINDER_ENABLED=false)' };
  }

  var list = buildOverdueList().filter(function (i) {
    return COMPANY_REMINDER_FLAGS.indexOf(i.flag) !== -1 && i.contactEmail;
  });

  list.forEach(function (i) {
    var subject = '[멘토링 트래커] ' + i.company + ' 서류 제출 기한 안내';
    var body = i.company + ' 담당자님,\n\n' +
      '협약일자(' + i.date + ')로부터 ' + i.days + '일이 지났는데 아직 제출되지 않은 항목이 있어 안내드려요.\n\n' +
      '미완료 항목: ' + (i.missing.length ? i.missing.join(', ') : '없음') + '\n\n' +
      '확인 후 빠른 시일 내에 제출 부탁드립니다.\n감사합니다.';
    MailApp.sendEmail(i.contactEmail, subject, body);
  });

  return { sent: list.length, targeted: list.length };
}

// 알림 센터에서 관리자가 직접 쓴 제목·본문으로 선택한 기업들에게 수동으로 보내는 독촉메일.
// sendCompanyReminders()(고정 템플릿, 매일 새벽 자동 발송)와는 완전히 별개 경로예요.
function sendCustomReminderEmails(ids, subject, body, user) {
  if (!subject || !body || !ids || !ids.length) {
    return { ok: false, error: 'invalid', message: '제목·본문과 받는 기업을 확인해주세요.' };
  }
  var data = readAll();
  var byId = {};
  data.rows.forEach(function (r) { byId[r.id] = r; });

  var sentCount = 0;
  var skipped = [];
  ids.forEach(function (id) {
    var r = byId[id];
    if (!r) { skipped.push(id + '(존재하지 않음)'); return; }
    if (!r.contactEmail) { skipped.push(r.company + '(이메일 없음)'); return; }
    try {
      MailApp.sendEmail(r.contactEmail, subject, body);
      sentCount++;
    } catch (err) {
      skipped.push(r.company + '(' + err + ')');
    }
  });

  if (user) {
    appendLog(user, 'sendReminder', '', '',
      '독촉메일 발송 — 제목: ' + subject + ' · 성공 ' + sentCount + '건' + (skipped.length ? (' · 실패/제외 ' + skipped.length + '건') : ''));
  }
  return { ok: true, sent: sentCount, skipped: skipped };
}

function recordDigestResult(result) {
  var summary;
  if (result && result.skipped) {
    summary = '건너뜀: ' + (result.reason || '');
  } else if (result && typeof result.overdueCount === 'number') {
    summary = result.overdueCount === 0
      ? '지연 기업 없음'
      : ('지연 ' + result.overdueCount + '건 (문제 ' + result.counts.issue + ' · 경고 ' + result.counts.alert + ' · 주의 ' + result.counts.caution + ')');
  } else {
    summary = '완료';
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LAST_DIGEST_AT', new Date().toISOString());
  props.setProperty('LAST_DIGEST_SUMMARY', summary);
}

function getLastDigestInfo() {
  var props = PropertiesService.getScriptProperties();
  var at = props.getProperty('LAST_DIGEST_AT');
  if (!at) return null;
  return { at: at, summary: props.getProperty('LAST_DIGEST_SUMMARY') || '' };
}
