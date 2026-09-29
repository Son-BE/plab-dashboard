  function nowLabel(){
    var d = new Date();
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  function setSyncStatus(status){
    saveDot.className = 'save-dot ' + status;
    var map = {
      loading: '불러오는 중…',
      synced: '동기화됨 · ' + nowLabel(),
      syncing: '저장 중…',
      error: '연결에 실패했어요 (URL 또는 배포 설정을 확인해 주세요)',
      'setup-needed': '연결 설정이 필요해요'
    };
    saveText.textContent = map[status] || '';
  }

  function isPlaceholder(u){ return !u || u.indexOf('PASTE_YOUR') !== -1; }

  function resolveApiUrl(){
    try{
      var override = localStorage.getItem('mt_api_url');
      if(override) return override;
    }catch(e){}
    return CONFIG.API_URL;
  }

  function showLoginScreen(message){
    loginScreen.hidden = false;
    if(message){ loginError.textContent = message; loginError.hidden = false; }
    else { loginError.hidden = true; }
    loginSubmit.disabled = false;
    loginSubmit.textContent = '로그인';
    setTimeout(function(){ loginUsername.focus(); }, 0);
  }

  function hideLoginScreen(){
    loginScreen.hidden = true;
  }

  function startPolling(){
    if(pollingStarted) return;
    pollingStarted = true;
    setInterval(function(){ pollOnce(false); }, CONFIG.POLL_INTERVAL_MS);
  }

  function fetchRows(){
    // 캐시된(구버전) 응답을 절대 재사용하지 않도록 매번 새 쿼리스트링을 붙이고
    // cache:'no-store'를 지정합니다. Apps Script 웹 앱 GET 응답이 브라우저나
    // 중간 캐시에 저장되어, 배포를 새로 해도 예전 값(예전 날짜 형식, 예전 오류)이
    // 계속 보이는 문제를 막기 위한 처리예요.
    // 아이디/비밀번호는 매 요청에 같이 실어보내서, 서버가 그때그때 권한(관리자/열람,
    // 담당 권역)을 확인해서 그에 맞는 데이터만 돌려주도록 해요.
    var bustUrl = apiUrl + (apiUrl.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now() +
      '&u=' + encodeURIComponent(AUTH.u || '') + '&p=' + encodeURIComponent(AUTH.p || '');
    return fetch(bustUrl, { method:'GET', cache:'no-store' }).then(function(res){
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function(data){
      if(data && data.error === 'auth'){
        var err = new Error(data.message || '아이디 또는 비밀번호가 올바르지 않아요.');
        err.isAuthError = true;
        throw err;
      }
      if(data && data.role){ AUTH.role = data.role; AUTH.region = data.region; }
      // 로그인 계정(u)이 정해졌으니, 이 계정·이 브라우저에서 예전에 골라둔 기업이 있으면 불러와요.
      uploadCompanySelection = loadUploadCompanySelection();
      STATE.lastSync = (data && data.lastSync) || null;
      STATE.lastDigest = (data && data.lastDigest) || null;
      // sessionCount는 normalizeRow가 세션 배열 길이를 결정할 때 참조하니, map(normalizeRow)보다
      // 먼저 갱신해둬요.
      STATE.sessionCount = (data && data.sessionCount) || STATE.sessionCount || 6;
      // flagThresholds는 normalizeRow(아래에서 바로 호출)가 computeAutoFlag를 통해 참조하니,
      // map(normalizeRow)보다 먼저 갱신해둬요 (sessionCount와 같은 이유).
      if(data && data.flagThresholds) STATE.flagThresholds = data.flagThresholds;
      // 관리자 계정으로 응답 받을 때만 서버가 내려줘요(뷰어 계정엔 빠져있을 수 있음) — 있을 때만 갱신.
      if(data && data.adminNotifyEmail !== undefined) STATE.adminNotifyEmail = data.adminNotifyEmail;
      if(data && data.companyReminderEnabled !== undefined) STATE.companyReminderEnabled = data.companyReminderEnabled;
      return Array.isArray(data.rows) ? data.rows.map(normalizeRow) : [];
    });
  }

  var ACTION_LABELS_KO = { upsert: '수정/등록', delete: '삭제', setUpload: '업로드 체크', setSessionCount: '세션 수 변경' };

  function formatLogTime(iso){
    var d = new Date(iso);
    if(isNaN(d.getTime())) return String(iso || '');
    var hh = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + hh + ':' + mi;
  }

  function renderChangeLog(entries){
    if(!changeLogBody) return;
    if(!entries || !entries.length){
      changeLogBody.innerHTML = '<tr class="empty-row"><td colspan="5">아직 기록된 변경 이력이 없어요.</td></tr>';
      return;
    }
    changeLogBody.innerHTML = entries.map(function(e){
      return '<tr>' +
        '<td>' + escapeHtml(formatLogTime(e.at)) + '</td>' +
        '<td>' + escapeHtml(e.username || '') + '</td>' +
        '<td>' + escapeHtml(ACTION_LABELS_KO[e.action] || e.action || '') + '</td>' +
        '<td>' + escapeHtml(e.company || '') + '</td>' +
        '<td>' + escapeHtml(e.detail || '') + '</td>' +
      '</tr>';
    }).join('');
  }

  // 변경 이력 배너를 열 때·새로고침 버튼을 누를 때 호출돼요. fetchRows()와 같은 GET
  // 캐시버스팅 패턴에 action=getLog만 붙여요 (관리자만 서버에서 응답을 내려줘요).
  function fetchLog(){
    if(!changeLogBody || !apiUrl) return;
    changeLogBody.innerHTML = '<tr class="empty-row"><td colspan="5">불러오는 중…</td></tr>';
    var bustUrl = apiUrl + (apiUrl.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now() +
      '&u=' + encodeURIComponent(AUTH.u || '') + '&p=' + encodeURIComponent(AUTH.p || '') + '&action=getLog';
    return fetch(bustUrl, { method:'GET', cache:'no-store' }).then(function(res){
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function(data){
      if(!data || data.ok === false){
        changeLogBody.innerHTML = '<tr class="empty-row"><td colspan="5">' + escapeHtml((data && data.message) || '불러오지 못했어요.') + '</td></tr>';
        return;
      }
      renderChangeLog(data.log || []);
    }).catch(function(err){
      console.error(err);
      changeLogBody.innerHTML = '<tr class="empty-row"><td colspan="5">불러오는 중 문제가 생겼어요.</td></tr>';
    });
  }

  function attemptLogin(username, password){
    AUTH.u = username; AUTH.p = password;
    loginSubmit.disabled = true;
    loginSubmit.textContent = '확인 중…';
    loginError.hidden = true;
    setSyncStatus('loading');
    fetchRows().then(function(rows){
      saveAuth({ u: username, p: password });
      STATE.rows = rows.length ? rows : (isAdmin() ? exampleRows() : []);
      hideLoginScreen();
      setSyncStatus('synced');
      applyRoleUI();
      renderTableHeader();
      renderAll();
      startPolling();
    }).catch(function(err){
      console.error(err);
      AUTH.u = null; AUTH.p = null;
      loginSubmit.disabled = false;
      loginSubmit.textContent = '로그인';
      loginError.textContent = (err && err.isAuthError) ? err.message : '연결에 실패했어요. 잠시 후 다시 시도해 주세요.';
      loginError.hidden = false;
    });
  }

  function saveRow(id){
    if(!isAdmin()) return;
    var row = findRow(id);
    if(!row) return;
    inFlight++;
    setSyncStatus('syncing');
    fetch(apiUrl, {
      method:'POST',
      cache:'no-store',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify({ action:'upsert', row: row, u: AUTH.u, p: AUTH.p })
    }).catch(function(err){ console.error(err); })
      .finally(function(){
        inFlight--;
        setSyncStatus(inFlight > 0 ? 'syncing' : 'synced');
      });
  }

  function scheduleSaveRow(id){
    clearTimeout(pendingSaves[id]);
    pendingSaves[id] = setTimeout(function(){ saveRow(id); }, 700);
  }

  function deleteRowRemote(id){
    if(!isAdmin()) return;
    inFlight++;
    setSyncStatus('syncing');
    fetch(apiUrl, {
      method:'POST',
      cache:'no-store',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify({ action:'delete', id: id, u: AUTH.u, p: AUTH.p })
    }).catch(function(err){ console.error(err); })
      .finally(function(){
        inFlight--;
        setSyncStatus(inFlight > 0 ? 'syncing' : 'synced');
      });
  }

  // 업로드현황 체크 한 칸을 서버에 반영해요. 관리자·협력사 계정 모두 호출할 수 있고,
  // 담당 권역이 정해진 계정은 서버가 그 권역 데이터인지 한 번 더 확인해요.
  function saveUploadField(id, field, value){
    inFlight++;
    setSyncStatus('syncing');
    fetch(apiUrl, {
      method:'POST',
      cache:'no-store',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body: JSON.stringify({ action:'setUpload', id:id, field:field, value:value, u:AUTH.u, p:AUTH.p })
    }).then(function(res){
        if(!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data){
        if(data && data.error === 'auth'){
          clearAuth();
          AUTH.u = null; AUTH.p = null;
          showLoginScreen('로그인 정보가 만료됐어요. 다시 로그인해 주세요.');
        }
      })
      .catch(function(err){ console.error(err); })
      .finally(function(){
        inFlight--;
        setSyncStatus(inFlight > 0 ? 'syncing' : 'synced');
      });
  }

  function pollOnce(force){
    if(!force){
      if(document.activeElement && rowsBody.contains(document.activeElement)) return Promise.resolve();
      if(inFlight > 0 || Object.keys(pendingSaves).length) return Promise.resolve();
    }
    return fetchRows().then(function(rows){
      if(rows.length === 0 && STATE.rows.length && STATE.rows.every(function(r){ return r.isExample; })) return;
      STATE.rows = rows.length ? rows : STATE.rows;
      setSyncStatus('synced');
      renderTableHeader();
      renderAll();
      renderLastDigestLabel(isAdmin() && viewMode === 'collect');
    }).catch(function(err){
      console.error(err);
      if(err && err.isAuthError){
        clearAuth();
        AUTH.u = null; AUTH.p = null;
        showLoginScreen('로그인 정보가 만료됐어요. 다시 로그인해 주세요.');
        return;
      }
      setSyncStatus('error');
    });
  }
