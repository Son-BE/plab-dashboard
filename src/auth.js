function setupInitialPasswords() {
  var DEFAULTS = {
    Admin_ai: 'admin-1234',
    All_ai: 'all-1234',
    Sccei_ai: 'metro-1234',
    Gccei_ai: 'gangwon-1234',
    Jccei_ai: 'jeju-1234'
  };
  var props = PropertiesService.getScriptProperties();
  var filled = [];
  Object.keys(DEFAULTS).forEach(function (username) {
    var key = 'PW_' + username.toUpperCase();
    if (!props.getProperty(key)) {
      props.setProperty(key, DEFAULTS[username]);
      filled.push(username);
    }
  });
  Logger.log(filled.length ? '다음 계정에 기본 비밀번호를 채웠어요: ' + filled.join(', ') + ' — 꼭 "프로젝트 설정 → 스크립트 속성"에서 실제 비밀번호로 바꿔주세요.' : '이미 모든 계정에 비밀번호가 설정되어 있어서 아무것도 바꾸지 않았어요.');
}

function getStoredPassword(username) {
  return PropertiesService.getScriptProperties().getProperty('PW_' + String(username).toUpperCase());
}

function authenticate(username, password) {
  if (!username || !password) return null;
  var users = getUsers();
  for (var i = 0; i < users.length; i++) {
    if (users[i].username === username) {
      var stored = getStoredPassword(username);
      return stored && stored === password ? users[i] : null;
    }
  }
  return null;
}

// ── 사용자 권한 관리 ──────────────────────────────────────────────────
// USERS_JSON(config.js의 getUsers/saveUsers)과 PW_<USERNAME> 속성을 같이 다뤄요.
// 마지막 관리자를 지우거나 강등하는 것, 본인 계정을 스스로 지우는 것만 막아요 — 그
// 외 제약은 두지 않아요(권한 판단은 이걸 쓰는 관리자에게 맡김).
function countAdmins(users) {
  return users.filter(function (u) { return u.role === 'admin'; }).length;
}

function addUser(username, role, region, password, actingUser) {
  username = String(username || '').trim();
  role = role === 'admin' ? 'admin' : 'viewer';
  region = String(region || 'all').trim() || 'all';
  password = String(password || '');
  if (!username) return { ok: false, error: 'invalid', message: '아이디를 입력해주세요.' };
  if (password.length < 6) return { ok: false, error: 'invalid', message: '비밀번호는 6자 이상이어야 해요.' };
  if (findUser(username)) return { ok: false, error: 'duplicate', message: '이미 있는 아이디예요.' };

  var users = getUsers();
  users.push({ username: username, role: role, region: region });
  saveUsers(users);
  PropertiesService.getScriptProperties().setProperty('PW_' + username.toUpperCase(), password);
  if (actingUser) appendLog(actingUser, 'addUser', '', username, '계정 추가 — ' + username + ' (' + role + ', ' + region + ')');
  return { ok: true, users: users };
}

function updateUserRole(username, role, region, actingUser) {
  var users = getUsers();
  var target = null;
  for (var i = 0; i < users.length; i++) { if (users[i].username === username) { target = users[i]; break; } }
  if (!target) return { ok: false, error: 'not-found', message: '계정을 찾을 수 없어요.' };

  role = role === 'admin' ? 'admin' : 'viewer';
  if (target.role === 'admin' && role !== 'admin' && countAdmins(users) <= 1) {
    return { ok: false, error: 'last-admin', message: '마지막 관리자 계정은 권한을 바꿀 수 없어요.' };
  }

  var oldRole = target.role, oldRegion = target.region;
  target.role = role;
  target.region = String(region || 'all').trim() || 'all';
  saveUsers(users);
  if (actingUser) {
    appendLog(actingUser, 'updateUserRole', '', username,
      username + ' 권한 변경 — 역할 ' + oldRole + '→' + target.role + ', 권역 ' + oldRegion + '→' + target.region);
  }
  return { ok: true, users: users };
}

function resetUserPassword(username, newPassword, actingUser) {
  newPassword = String(newPassword || '');
  if (!findUser(username)) return { ok: false, error: 'not-found', message: '계정을 찾을 수 없어요.' };
  if (newPassword.length < 6) return { ok: false, error: 'invalid', message: '비밀번호는 6자 이상이어야 해요.' };
  PropertiesService.getScriptProperties().setProperty('PW_' + username.toUpperCase(), newPassword);
  // 실제 비밀번호 값은 로그에 남기지 않아요 — "재설정했다"는 사실만 기록.
  if (actingUser) appendLog(actingUser, 'resetUserPassword', '', username, username + ' 비밀번호 재설정');
  return { ok: true };
}

function deleteUser(username, actingUser) {
  if (actingUser && actingUser.username === username) {
    return { ok: false, error: 'self', message: '본인 계정은 스스로 삭제할 수 없어요.' };
  }
  var users = getUsers();
  var target = findUser(username);
  if (!target) return { ok: false, error: 'not-found', message: '계정을 찾을 수 없어요.' };
  if (target.role === 'admin' && countAdmins(users) <= 1) {
    return { ok: false, error: 'last-admin', message: '마지막 관리자 계정은 삭제할 수 없어요.' };
  }

  var remaining = users.filter(function (u) { return u.username !== username; });
  saveUsers(remaining);
  PropertiesService.getScriptProperties().deleteProperty('PW_' + username.toUpperCase());
  if (actingUser) appendLog(actingUser, 'deleteUser', '', username, '계정 삭제 — ' + username);
  return { ok: true, users: remaining };
}
