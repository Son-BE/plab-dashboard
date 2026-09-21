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
  for (var i = 0; i < USERS.length; i++) {
    if (USERS[i].username === username) {
      var stored = getStoredPassword(username);
      return stored && stored === password ? USERS[i] : null;
    }
  }
  return null;
}
