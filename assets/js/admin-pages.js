  // ── 알림 센터 — 지연(주의/경고/문제) 기업에 관리자가 직접 쓴 제목·본문으로 수동 일괄
  // 발송해요. sendCompanyReminders(고정 템플릿, 매일 새벽 자동 발송)와는 별개 경로예요.
  // notifySelected는 체크 상태를 재렌더 사이에도 유지해요(새로 나타난 기업만 기본값 부여).
  var notifySelected = {};
  var NOTIFY_FLAG_ORDER = { issue: 0, alert: 1, caution: 2 };

  function selectableNotifyRows(){
    return STATE.rows
      .filter(function(r){ return r.flag && r.flag !== 'none'; })
      .sort(function(a, b){ return NOTIFY_FLAG_ORDER[a.flag] - NOTIFY_FLAG_ORDER[b.flag]; });
  }

  function updateNotifySelectAllState(){
    if(!notifySelectAllEl) return;
    var selectable = selectableNotifyRows().filter(function(r){ return r.contactEmail; });
    var checkedCount = selectable.filter(function(r){ return notifySelected[r.id]; }).length;
    notifySelectAllEl.checked = selectable.length > 0 && checkedCount === selectable.length;
    notifySelectAllEl.indeterminate = checkedCount > 0 && checkedCount < selectable.length;
  }

  function updateNotifySendState(){
    if(!notifySendBtn) return;
    var count = selectableNotifyRows().filter(function(r){ return r.contactEmail && notifySelected[r.id]; }).length;
    notifySendBtn.textContent = '📧 선택한 ' + count + '개사에 발송';
  }

  function renderNotifyView(){
    if(!notifyRecipientListEl) return;
    var rows = selectableNotifyRows();
    rows.forEach(function(r){
      if(!(r.id in notifySelected)) notifySelected[r.id] = !!r.contactEmail;
    });

    if(notifyViewScopeEl){
      notifyViewScopeEl.textContent = rows.length ? ('지연 표시 기업 ' + rows.length + '개사(문제·경고·주의)') : '지연 표시된 기업이 없어요.';
    }

    notifyRecipientListEl.innerHTML = rows.length
      ? rows.map(function(r){
          var hasEmail = !!r.contactEmail;
          var checked = hasEmail && notifySelected[r.id];
          return '<li class="side-item">' +
            '<label style="display:flex; align-items:center; gap:10px; flex:1; min-width:0; cursor:' + (hasEmail ? 'pointer' : 'not-allowed') + ';">' +
              '<input type="checkbox" class="notify-recipient-checkbox" data-id="' + escapeHtml(r.id) + '"' + (checked ? ' checked' : '') + (hasEmail ? '' : ' disabled') + '>' +
              '<span style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + escapeHtml(r.company || '') + '</span>' +
              '<span style="color:var(--muted); font-size:12px; flex:none;">' + escapeHtml(r.region || '') + '</span>' +
            '</label>' +
            '<span style="display:flex; align-items:center; gap:8px; flex:none;">' +
              '<span class="flag-badge flag-' + r.flag + '">' + (FLAG_LABELS[r.flag] || '') + '</span>' +
              '<span style="font-size:12px; color:var(--muted);">' + (hasEmail ? escapeHtml(r.contactEmail) : '이메일 없음') + '</span>' +
            '</span>' +
          '</li>';
        }).join('')
      : '<li class="side-item"><span>지연 표시된 기업이 없어요.</span></li>';

    updateNotifySelectAllState();
    updateNotifySendState();
  }

  function sendReminderBatch(){
    if(!isAdmin() || !notifySendBtn) return;
    var subject = (notifySubjectInput.value || '').trim();
    var body = (notifyBodyInput.value || '').trim();
    var ids = selectableNotifyRows().filter(function(r){ return r.contactEmail && notifySelected[r.id]; }).map(function(r){ return r.id; });

    if(!subject || !body){
      alert('제목과 본문을 입력해주세요.');
      return;
    }
    if(!ids.length){
      alert('받는 기업을 1개 이상 선택해주세요.');
      return;
    }
    if(!confirm('선택한 ' + ids.length + '개 기업에게 메일을 보낼까요? 되돌릴 수 없어요.')) return;

    notifySendBtn.disabled = true;
    if(notifyResultEl) notifyResultEl.hidden = true;

    apiPost('sendReminderEmails', { ids:ids, subject:subject, body:body })
      .then(function(data){
        if(!data || data.ok === false){
          alert((data && data.message) || '메일 발송에 실패했어요.');
          return;
        }
        if(notifyResultEl){
          notifyResultEl.hidden = false;
          var text = '성공 ' + data.sent + '건';
          if(data.skipped && data.skipped.length) text += ' · 실패/제외 ' + data.skipped.length + '건 (' + data.skipped.join(', ') + ')';
          notifyResultEl.textContent = text;
        }
      })
      .catch(function(err){
        console.error(err);
        alert('메일 발송 중 문제가 생겼어요.');
      })
      .finally(function(){
        notifySendBtn.disabled = false;
      });
  }

  // 설정 페이지에 들어갈 때마다 입력칸을 서버에서 받아온 현재값으로 채워줘요(항상 보이는
  // 카드라 토글 시점이 아니라 페이지 진입 시점에 값을 넣어야 해요).
  function renderSettingsView(){
    if(!isAdmin()) return;
    if(sessionCountInput) sessionCountInput.value = STATE.sessionCount;
    if(stepOpenDateInput) stepOpenDateInput.value = getStep2OpenDate();
    if(flagCautionInput) flagCautionInput.value = STATE.flagThresholds.caution;
    if(flagAlertInput) flagAlertInput.value = STATE.flagThresholds.alert;
    if(flagIssueInput) flagIssueInput.value = STATE.flagThresholds.issue;
    if(adminEmailInput) adminEmailInput.value = STATE.adminNotifyEmail || '';
    if(reminderEnabledInput) reminderEnabledInput.checked = !!STATE.companyReminderEnabled;
  }

  // ── 사용자 권한 ──────────────────────────────────────────────────────
  // 계정 목록은 STATE.rows처럼 상시 캐싱하지 않고, 이 페이지에 들어갈 때마다 서버에서
  // 새로 받아와요 — 계정 변경은 드물고 민감한 데이터라 다른 뷰처럼 폴링에 얹지 않아요.
  function renderUsersList(users){
    if(!usersListEl) return;
    usersListEl.innerHTML = users.length ? users.map(function(u){
      var roleOptions = ['viewer', 'admin'].map(function(r){
        return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + (r === 'admin' ? '관리자' : '열람') + '</option>';
      }).join('');
      var regionOptions = ['all'].concat(REGION_PRESETS).map(function(r){
        return '<option value="' + escapeHtml(r) + '"' + (u.region === r ? ' selected' : '') + '>' + (r === 'all' ? '전체' : escapeHtml(r)) + '</option>';
      }).join('');
      return '<li class="side-item" style="flex-wrap:wrap; gap:10px;">' +
        '<div style="display:flex; align-items:center; gap:10px; flex:1; min-width:160px;">' +
          '<span style="font-weight:700;">' + escapeHtml(u.username) + '</span>' +
          '<span class="chip' + (u.role === 'admin' ? '' : ' muted') + '">' + (u.role === 'admin' ? '관리자' : '열람') + '</span>' +
        '</div>' +
        '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
          '<select class="compose-input user-role-select" data-username="' + escapeHtml(u.username) + '" style="height:34px; width:90px; font-size:13px;">' + roleOptions + '</select>' +
          '<select class="compose-input user-region-select" data-username="' + escapeHtml(u.username) + '" style="height:34px; width:100px; font-size:13px;">' + regionOptions + '</select>' +
          '<button type="button" class="btn btn-ghost user-save-role-btn" data-username="' + escapeHtml(u.username) + '">저장</button>' +
          '<button type="button" class="btn btn-ghost user-reset-pw-btn" data-username="' + escapeHtml(u.username) + '">비밀번호 재설정</button>' +
          '<button type="button" class="btn btn-ghost user-delete-btn" data-username="' + escapeHtml(u.username) + '" style="color:var(--danger);">삭제</button>' +
        '</div>' +
      '</li>';
    }).join('') : '<li class="side-item"><span>계정이 없어요.</span></li>';
  }

  function fetchUsers(){
    if(!usersListEl || !apiUrl) return;
    usersListEl.innerHTML = '<li class="side-item"><span>불러오는 중…</span></li>';
    return apiGet('getUsers').then(function(data){
      if(!data || data.ok === false){
        usersListEl.innerHTML = '<li class="side-item"><span>' + escapeHtml((data && data.message) || '불러오지 못했어요.') + '</span></li>';
        return;
      }
      renderUsersList(data.users || []);
    }).catch(function(err){
      console.error('[사용자 권한] 목록 조회 실패:', err);
      usersListEl.innerHTML = '<li class="side-item"><span>불러오는 중 문제가 생겼어요.</span></li>';
    });
  }

  // ── 고객사 관리 ────────────────────────────────────────────────────────
  // 기업 마스터 정보(companies 시트)는 회차와 무관해서, rows 시트의 회차별 기록과는
  // 이름 문자열로만 연결돼요(별도 companyId는 두지 않음 — 드라이브 동기화도 같은 방식).
  var CLIENT_STATUS_LABELS = { active: '활성', inactive: '비활성' };

  function sameCompanyName(a, b){
    return String(a||'').trim().toLowerCase() === String(b||'').trim().toLowerCase();
  }

  // 이미 STATE.rows에 모든 회차가 로드돼있어서(readAll이 회차로 안 나눠 전체를 줌),
  // 새 API 없이 클라이언트에서 이름으로 묶어 이력을 만들어요.
  function clientHistoryHTML(companyName){
    var rows = STATE.rows.filter(function(r){ return sameCompanyName(r.company, companyName); });
    if(!rows.length) return '<div style="color:var(--muted); font-size:13px; padding:6px 0;">아직 회차별 참여 기록이 없어요.</div>';
    rows = rows.slice().sort(function(a,b){ return String(a.round||'').localeCompare(String(b.round||'')); });
    return '<div style="display:flex; flex-direction:column; gap:6px;">' + rows.map(function(r){
      var p = rowProgress(r);
      var flag = FLAG_LABELS[r.flag || 'none'] || '정상';
      return '<div style="display:flex; align-items:center; gap:10px; font-size:13px; padding:6px 10px; background:var(--panel-soft); border-radius:8px; flex-wrap:wrap;">' +
        '<span style="font-weight:700; min-width:56px;">' + escapeHtml(r.round || DEFAULT_ROUND) + '</span>' +
        '<span style="color:var(--muted); min-width:90px;">' + escapeHtml(r.date || '협약일자 미설정') + '</span>' +
        '<span>진행 ' + p.checked + '/' + p.total + ' (' + p.pct + '%)</span>' +
        '<span>' + (r.complete ? '완료' : '진행중') + '</span>' +
        '<span class="chip' + (flag === '정상' ? ' muted' : '') + '">' + escapeHtml(flag) + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function clientMatchesFilters(c){
    var q = ((clientSearchInput && clientSearchInput.value) || '').trim().toLowerCase();
    if(q){
      var hay = ((c.name||'') + ' ' + (c.contactName||'') + ' ' + (c.contactEmail||'')).toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    var region = clientRegionFilterInput && clientRegionFilterInput.value;
    if(region && region !== 'all' && c.region !== region) return false;
    var status = clientStatusFilterInput && clientStatusFilterInput.value;
    if(status && status !== 'all' && (c.status || 'active') !== status) return false;
    return true;
  }

  function renderClientsList(){
    if(!clientsListEl) return;
    var list = STATE.companies.filter(clientMatchesFilters);
    if(!list.length){
      clientsListEl.innerHTML = '<li class="side-item"><span>' + (STATE.companies.length ? '검색 결과가 없어요.' : '등록된 고객사가 없어요.') + '</span></li>';
      return;
    }
    clientsListEl.innerHTML = list.map(function(c){
      var status = c.status || 'active';
      return '<li class="side-item client-item" style="flex-direction:column; align-items:stretch; gap:10px;">' +
        '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">' +
          '<span style="font-weight:700;">' + escapeHtml(c.name) + '</span>' +
          (c.region ? '<span class="chip muted">' + escapeHtml(c.region) + '</span>' : '') +
          '<span class="chip' + (status === 'active' ? '' : ' muted') + '">' + (CLIENT_STATUS_LABELS[status] || status) + '</span>' +
          '<span style="color:var(--muted); font-size:13px;">' + escapeHtml(c.contactEmail || '담당자 이메일 미등록') + '</span>' +
          '<div style="margin-left:auto; display:flex; gap:6px;">' +
            '<button type="button" class="btn btn-ghost client-toggle-btn" data-id="' + escapeHtml(c.id) + '">상세</button>' +
            '<button type="button" class="btn btn-ghost client-delete-btn" data-id="' + escapeHtml(c.id) + '" style="color:var(--danger);">삭제</button>' +
          '</div>' +
        '</div>' +
        '<div class="client-detail" data-id="' + escapeHtml(c.id) + '" hidden>' +
          '<div class="settings-actions" style="align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">' +
            '<label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted);">담당자명' +
              '<input class="compose-input client-field-contactName" type="text" value="' + escapeHtml(c.contactName||'') + '" style="height:34px; width:110px;"></label>' +
            '<label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted);">담당자 연락처' +
              '<input class="compose-input client-field-contactPhone" type="text" value="' + escapeHtml(c.contactPhone||'') + '" style="height:34px; width:130px;"></label>' +
            '<label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted);">담당자 이메일' +
              '<input class="compose-input client-field-contactEmail" type="email" value="' + escapeHtml(c.contactEmail||'') + '" style="height:34px; width:170px;"></label>' +
            '<label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted);">사업자번호' +
              '<input class="compose-input client-field-businessNo" type="text" value="' + escapeHtml(c.businessNo||'') + '" style="height:34px; width:130px;"></label>' +
            '<label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted);">권역' +
              '<input class="compose-input client-field-region" type="text" list="region-list" value="' + escapeHtml(c.region||'') + '" style="height:34px; width:110px;"></label>' +
            '<label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted);">상태' +
              '<select class="compose-input client-field-status" style="height:34px; width:90px;">' +
                '<option value="active"' + (status === 'active' ? ' selected' : '') + '>활성</option>' +
                '<option value="inactive"' + (status === 'inactive' ? ' selected' : '') + '>비활성</option>' +
              '</select></label>' +
            '<button type="button" class="btn btn-primary client-save-btn" data-id="' + escapeHtml(c.id) + '">저장</button>' +
          '</div>' +
          '<label style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); margin-bottom:10px;">메모' +
            '<textarea class="compose-textarea client-field-memo" style="min-height:60px;">' + escapeHtml(c.memo||'') + '</textarea></label>' +
          '<div style="font-size:13px; font-weight:700; margin-bottom:6px; color:var(--muted);">회차별 참여 이력</div>' +
          clientHistoryHTML(c.name) +
        '</div>' +
      '</li>';
    }).join('');
  }

  // 계정 변경 없이 그 사이 새 데이터가 안 들어와도, 페이지 진입 시점엔 서버에서 새로 받아와요
  // (users-view와 동일 패턴 — 관리 데이터는 폴링에 얹지 않아요).
  function fetchClients(){
    if(!clientsListEl || !apiUrl) return;
    clientsListEl.innerHTML = '<li class="side-item"><span>불러오는 중…</span></li>';
    return apiGet('getCompanies').then(function(data){
      if(!data || data.ok === false){
        clientsListEl.innerHTML = '<li class="side-item"><span>' + escapeHtml((data && data.message) || '불러오지 못했어요.') + '</span></li>';
        return;
      }
      STATE.companies = data.companies || [];
      renderClientsList();
    }).catch(function(err){
      console.error('[고객사 관리] 목록 조회 실패:', err);
      clientsListEl.innerHTML = '<li class="side-item"><span>불러오는 중 문제가 생겼어요.</span></li>';
    });
  }
