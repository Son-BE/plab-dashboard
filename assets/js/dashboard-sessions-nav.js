  // ── 세션 현황 ────────────────────────────────────────────────────────
  // 회차별(1~N회차) 체크 완료율을 계산해요. 대시보드의 "회차 진행률"과 달리 여기는
  // 항상 matchesFilters()로 걸러진(사이드바 권역·회차 선택이 반영된) 행 기준이에요.
  function computeSessionStats(rows, sessionCount){
    var perSession = [];
    for(var i = 0; i < sessionCount; i++){
      var checked = 0;
      for(var r = 0; r < rows.length; r++){ if(rows[r].sessions[i]) checked++; }
      perSession.push({ n: i + 1, checked: checked, total: rows.length, pct: rows.length ? Math.round(checked / rows.length * 100) : 0 });
    }
    var totalChecked = 0;
    rows.forEach(function(row){ totalChecked += row.sessions.filter(Boolean).length; });
    var totalSlots = rows.length * sessionCount;
    var stuck = null;
    perSession.forEach(function(s){ if(!stuck || s.pct < stuck.pct) stuck = s; });
    return {
      perSession: perSession,
      total: rows.length,
      overallRate: totalSlots ? Math.round(totalChecked / totalSlots * 100) : 0,
      avgSession: rows.length ? (totalChecked / rows.length) : 0,
      stuck: stuck
    };
  }

  // 회차별 완료율을 1회차→N회차로 이어지는 라인+영역 차트로 그려요. 회차가 순차적으로
  // 진행되며 값이 바뀌는 데이터라 막대보다 선이 데이터 성격에 더 맞아요. 단일 시리즈라
  // 범례는 없고, 끝점(마지막 회차)과 가장 정체된 회차만 선택적으로 직접 라벨링해요.
  function buildSessionChartSVG(perSession){
    if(!perSession.length){
      return '<p class="subtitle" style="margin:4px 0 0;">표시할 회차가 없어요.</p>';
    }
    var leftPad = 34, rightPad = 16, topPad = 16, bottomPad = 26, plotH = 160;
    var count = perSession.length;
    var plotW = Math.max(count - 1, 1) * 64;
    var viewW = leftPad + plotW + rightPad;
    var baseY = topPad + plotH;
    var viewH = baseY + bottomPad;

    function xAt(i){ return count > 1 ? leftPad + (plotW * i / (count - 1)) : leftPad + plotW / 2; }
    function yAt(pct){ return topPad + plotH - (plotH * pct / 100); }

    var stuckN = perSession.reduce(function(min, s){ return s.pct < min.pct ? s : min; }, perSession[0]).n;
    var lastN = perSession[perSession.length - 1].n;

    var gridlines = [0, 25, 50, 75, 100].map(function(v){
      var y = yAt(v);
      return '<line class="session-chart-gridline" x1="' + leftPad + '" y1="' + y + '" x2="' + (leftPad + plotW) + '" y2="' + y + '"></line>' +
        '<text class="session-chart-tick" x="' + (leftPad - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + v + '</text>';
    }).join('');

    var points = perSession.map(function(s, i){ return { x: xAt(i), y: yAt(s.pct), s: s }; });
    var linePath = points.map(function(p, i){ return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y; }).join(' ');
    var last = points[points.length - 1];
    var areaPath = linePath + ' L' + last.x + ',' + baseY + ' L' + points[0].x + ',' + baseY + ' Z';

    var dots = points.map(function(p){
      var cls = 'session-trend-dot';
      if(p.s.n === lastN) cls += ' end';
      if(p.s.n === stuckN) cls += ' stuck';
      return '<circle class="' + cls + '" cx="' + p.x + '" cy="' + p.y + '"></circle>';
    }).join('');

    var labels = points.filter(function(p){ return p.s.n === lastN || p.s.n === stuckN; })
      .map(function(p){ return '<text class="session-chart-value-label" x="' + p.x + '" y="' + (p.y - 10) + '" text-anchor="middle">' + p.s.pct + '%</text>'; })
      .join('');

    var xLabels = points.map(function(p){
      return '<text class="session-chart-tick" x="' + p.x + '" y="' + (baseY + 18) + '" text-anchor="middle">' + p.s.n + '회차</text>';
    }).join('');

    var slotW = count > 1 ? plotW / (count - 1) : plotW;
    var hits = points.map(function(p, i){
      return '<rect class="session-trend-hit" x="' + (p.x - slotW / 2) + '" y="' + topPad + '" width="' + slotW + '" height="' + plotH + '" ' +
        'data-n="' + p.s.n + '" data-pct="' + p.s.pct + '" data-checked="' + p.s.checked + '" data-total="' + p.s.total + '"></rect>';
    }).join('');

    return '<svg class="session-chart-svg" viewBox="0 0 ' + viewW + ' ' + viewH + '" preserveAspectRatio="xMidYMid meet">' +
      gridlines +
      '<line class="session-trend-crosshair" x1="' + leftPad + '" y1="' + topPad + '" x2="' + leftPad + '" y2="' + baseY + '"></line>' +
      '<path class="session-trend-area" d="' + areaPath + '"></path>' +
      '<path class="session-trend-line" d="' + linePath + '"></path>' +
      dots + labels + xLabels + hits +
    '</svg>';
  }

  function showChartTooltip(tooltipEl, evt, text){
    if(!tooltipEl) return;
    tooltipEl.textContent = text;
    tooltipEl.style.left = evt.clientX + 'px';
    tooltipEl.style.top = evt.clientY + 'px';
    tooltipEl.classList.add('visible');
  }
  function moveChartTooltip(tooltipEl, evt){
    if(!tooltipEl) return;
    tooltipEl.style.left = evt.clientX + 'px';
    tooltipEl.style.top = evt.clientY + 'px';
  }
  function hideChartTooltip(tooltipEl){
    if(tooltipEl) tooltipEl.classList.remove('visible');
  }

  function bindSessionChartHover(mount){
    var hits = mount.querySelectorAll('.session-trend-hit');
    var dots = mount.querySelectorAll('.session-trend-dot');
    var crosshair = mount.querySelector('.session-trend-crosshair');
    for(var i = 0; i < hits.length; i++){
      (function(hit, idx){
        hit.addEventListener('pointerenter', function(evt){
          var dot = dots[idx];
          if(dot && crosshair){
            crosshair.setAttribute('x1', dot.getAttribute('cx'));
            crosshair.setAttribute('x2', dot.getAttribute('cx'));
            crosshair.style.opacity = '1';
          }
          for(var j = 0; j < dots.length; j++){
            if(!dots[j].classList.contains('end') && !dots[j].classList.contains('stuck')) dots[j].setAttribute('r', '3');
          }
          if(dot) dot.setAttribute('r', '5');
          var text = hit.getAttribute('data-n') + '회차 · ' + hit.getAttribute('data-checked') + ' / ' + hit.getAttribute('data-total') + '개사 (' + hit.getAttribute('data-pct') + '%)';
          showChartTooltip(sessionChartTooltipEl, evt, text);
        });
        hit.addEventListener('pointermove', function(evt){ moveChartTooltip(sessionChartTooltipEl, evt); });
        hit.addEventListener('pointerleave', function(){
          if(crosshair) crosshair.style.opacity = '0';
          var dot = dots[idx];
          if(dot && !dot.classList.contains('end') && !dot.classList.contains('stuck')) dot.setAttribute('r', '3');
          hideChartTooltip(sessionChartTooltipEl);
        });
      })(hits[i], i);
    }
  }

  function renderSessionView(){
    if(!sessionStatsGridEl) return;
    var rows = STATE.rows.filter(matchesFilters);
    var s = computeSessionStats(rows, STATE.sessionCount);

    if(sessionViewScopeEl){
      var regionLabel = (filters.region === 'all' || !filters.region) ? '전체 권역' : filters.region;
      var roundLabel = (filters.round === 'all' || !filters.round) ? '전체 회차' : filters.round;
      sessionViewScopeEl.textContent = regionLabel + ' · ' + roundLabel + ' · ' + s.total + '개사 기준';
    }

    sessionStatsGridEl.innerHTML =
      '<div class="stat-card"><div class="stat-label">평균 진행 회차</div><div class="stat-value">' + s.avgSession.toFixed(1) + '<span class="stat-unit">/ ' + STATE.sessionCount + '회차</span></div></div>' +
      '<div class="stat-card"><div class="stat-label">가장 정체된 회차</div><div class="stat-value">' + (s.stuck ? (s.stuck.n + '회차') : '-') + '<span class="stat-unit">' + (s.stuck ? (s.stuck.pct + '%') : '') + '</span></div></div>' +
      '<div class="stat-card"><div class="stat-label">전체 세션 체크율</div><div class="stat-value">' + s.overallRate + '<span class="stat-unit">%</span></div>' +
        '<div class="progress"><div class="progress-bar" style="width:' + s.overallRate + '%"></div></div></div>';

    if(sessionChartMountEl){
      sessionChartMountEl.innerHTML = buildSessionChartSVG(s.perSession);
      bindSessionChartHover(sessionChartMountEl);
    }

    if(sessionTableBodyEl){
      sessionTableBodyEl.innerHTML = s.perSession.length
        ? s.perSession.map(function(row){
            return '<tr><td>' + row.n + '회차</td><td>' + row.checked + ' / ' + row.total + '</td><td>' + row.pct + '%</td></tr>';
          }).join('')
        : '<tr class="empty-row"><td colspan="3">표시할 회차가 없어요.</td></tr>';
    }
  }

  function renderStats(){
    var s = computeStats(STATE.rows);
    var regionEntries = Object.keys(s.byRegion).map(function(k){ return [k, s.byRegion[k]]; });
    var regionChips = regionEntries.length
      ? regionEntries.map(function(e){ return '<span class="chip">' + escapeHtml(e[0]) + ' ' + e[1] + '</span>'; }).join('')
      : '<span class="chip muted">데이터 없음</span>';

    // 이슈 심각도 미터: 정상 비율은 total에서 나머지 세 상태를 뺀 값이에요 (computeStats가
    // 따로 안 돌려줘서 여기서만 파생시켜요 — 다른 로직에는 영향 없음).
    var normalCount = Math.max(0, s.total - s.issueCount - s.alertCount - s.cautionCount);
    var meterTotal = s.total || 1;
    var severityMeter = '<div class="severity-meter" title="정상 ' + normalCount + ' · 주의 ' + s.cautionCount + ' · 경고 ' + s.alertCount + ' · 문제 ' + s.issueCount + '">' +
      '<div class="severity-seg normal" style="width:' + (normalCount / meterTotal * 100) + '%"></div>' +
      '<div class="severity-seg caution" style="width:' + (s.cautionCount / meterTotal * 100) + '%"></div>' +
      '<div class="severity-seg alert" style="width:' + (s.alertCount / meterTotal * 100) + '%"></div>' +
      '<div class="severity-seg issue" style="width:' + (s.issueCount / meterTotal * 100) + '%"></div>' +
    '</div>';

    statsGrid.innerHTML =
      '<div class="stat-card"><div class="stat-label">전체 멘티기업</div><div class="stat-value">' + s.total + '<span class="stat-unit">개사</span></div></div>' +
      '<div class="stat-card"><div class="stat-label">완료</div><div class="stat-value">' + s.completeCount + '<span class="stat-unit">/ ' + s.total + '</span></div>' +
        '<div class="progress"><div class="progress-bar" style="width:' + s.completeRate + '%"></div></div></div>' +
      '<div class="stat-card"><div class="stat-label">회차 진행률</div><div class="stat-value">' + s.sessionRate + '<span class="stat-unit">%</span></div>' +
        '<div class="progress"><div class="progress-bar success" style="width:' + s.sessionRate + '%"></div></div></div>' +
      '<div class="stat-card"><div class="stat-label">서류 제출</div><div class="stat-value">' + s.planCount + '<span class="stat-unit">수행계획서</span></div>' +
        '<div class="stat-value small">' + s.reportCount + '<span class="stat-unit">결과보고서</span></div></div>' +
      '<div class="stat-card"><div class="stat-label">이슈 표시</div><div class="stat-value">' + s.issueCount + '<span class="stat-unit">문제</span></div>' +
        '<div class="stat-value small">' + s.alertCount + '<span class="stat-unit">경고</span> · ' + s.cautionCount + '<span class="stat-unit">주의</span></div>' + severityMeter + '</div>' +
      '<div class="stat-card wide"><div class="stat-label">권역별 현황</div><div class="chip-row">' + regionChips + '</div></div>';
  }

  // "즉시 처리 필요"·"회차별 참여 현황" — 전부 STATE.rows에서 바로 계산하는 실데이터예요.
  // 새로 만든 값이 없어서 renderStats()의 computeStats()와는 별도로 여기서만 파생시켜요.
  function renderQuickPanels(){
    if(!quickPanelsEl) return;
    var rows = STATE.rows;
    var delayed = rows.filter(function(r){ return r.flag === 'alert' || r.flag === 'issue'; }).length;
    var missingDocs = rows.filter(function(r){ return !r.plan || !r.report; }).length;
    var missingDate = rows.filter(function(r){ return !r.date; }).length;
    var missingEmail = rows.filter(function(r){ return !r.contactEmail; }).length;
    var exampleCount = rows.filter(function(r){ return r.isExample; }).length;

    var roundCounts = {};
    rows.forEach(function(r){ var k = r.round || DEFAULT_ROUND; roundCounts[k] = (roundCounts[k] || 0) + 1; });
    var roundKeys = Object.keys(roundCounts).sort();
    var roundItems = roundKeys.length
      ? roundKeys.map(function(k){
          var stepNum = String(k).replace(/[^0-9]/g, '');
          var label = stepNum ? 'Step ' + stepNum : k;
          return '<li class="side-item"><span>' + escapeHtml(label) + '</span><span class="chip">' + roundCounts[k] + '개사</span></li>';
        }).join('')
      : '<li class="side-item"><span>데이터 없음</span></li>';

    quickPanelsEl.innerHTML =
      '<div class="mini-card">' +
        '<h3>즉시 처리 필요</h3>' +
        '<ul class="side-list">' +
          '<li class="side-item"><span>지연 표시 기업(경고·문제)</span><span class="chip' + (delayed ? '' : ' muted') + '">' + delayed + '건</span></li>' +
          '<li class="side-item"><span>수행계획서·결과보고서 미제출</span><span class="chip' + (missingDocs ? '' : ' muted') + '">' + missingDocs + '건</span></li>' +
          '<li class="side-item"><span>협약일자 미설정</span><span class="chip' + (missingDate ? '' : ' muted') + '">' + missingDate + '건</span></li>' +
          '<li class="side-item"><span>담당자 이메일 미등록</span><span class="chip' + (missingEmail ? '' : ' muted') + '">' + missingEmail + '건</span></li>' +
        '</ul>' +
      '</div>' +
      '<div class="mini-card">' +
        '<h3>회차별 참여 현황</h3>' +
        '<ul class="side-list">' + roundItems + '</ul>' +
        (exampleCount ? '<div class="task-item"><span>예시 데이터 남음</span><strong>' + exampleCount + '개</strong></div>' : '') +
      '</div>';
  }

  // ── 보고서: 회차별·권역별 비교 ──────────────────────────────────────────
  // computeStats(rows)가 이미 범용이라(어떤 row 부분집합이든 받아 완료율·회차 진행률·서류
  // 제출·이슈 건수를 계산) 그룹별로 한 번씩 돌리기만 하면 돼요 — 새 집계 로직 불필요.
  function comparisonRowHTML(label, rows){
    var s = computeStats(rows);
    return '<tr>' +
      '<td>' + escapeHtml(label) + '</td>' +
      '<td>' + s.total + '개사</td>' +
      '<td>' + s.completeRate + '%</td>' +
      '<td>' + s.sessionRate + '%</td>' +
      '<td>' + s.planCount + '</td>' +
      '<td>' + s.reportCount + '</td>' +
      '<td>' + s.issueCount + '</td>' +
      '<td>' + s.alertCount + '</td>' +
      '<td>' + s.cautionCount + '</td>' +
    '</tr>';
  }

  // 회차별/권역별 비교는 사이드바에서 지금 어떤 필터가 선택돼있든 상관없이 항상 전체
  // 기준으로 계산해요 — 필터에 좌우되면 "비교"라는 목적 자체가 흐려지기 때문이에요.
  // 화면 렌더링과 엑셀 내보내기(table-view.js의 exportReportToExcel)가 같은 그룹핑을
  // 쓰도록 여기 한 곳에 모아뒀어요.
  function reportRoundGroups(){
    var usedRounds = [];
    STATE.rows.forEach(function(r){ var k = r.round || DEFAULT_ROUND; if(usedRounds.indexOf(k) === -1) usedRounds.push(k); });
    var allRounds = ROUND_PRESETS.slice();
    usedRounds.forEach(function(r){ if(allRounds.indexOf(r) === -1) allRounds.push(r); });
    STATE.rounds.forEach(function(r){ if(r.name && allRounds.indexOf(r.name) === -1) allRounds.push(r.name); });
    allRounds.sort();
    return allRounds.map(function(name){
      return { name: name, rows: STATE.rows.filter(function(r){ return (r.round || DEFAULT_ROUND) === name; }) };
    });
  }

  function reportRegionGroups(){
    var usedRegions = [];
    STATE.rows.forEach(function(r){ var k = r.region || '미지정'; if(usedRegions.indexOf(k) === -1) usedRegions.push(k); });
    var allRegions = REGION_PRESETS.slice();
    usedRegions.forEach(function(r){ if(allRegions.indexOf(r) === -1) allRegions.push(r); });
    return allRegions.map(function(name){
      return { name: name, rows: STATE.rows.filter(function(r){ return (r.region || '미지정') === name; }) };
    });
  }

  function renderReportView(){
    if(!roundComparisonBodyEl || !regionComparisonBodyEl) return;
    var roundGroups = reportRoundGroups();
    roundComparisonBodyEl.innerHTML = roundGroups.length
      ? roundGroups.map(function(g){ return comparisonRowHTML(g.name, g.rows); }).join('')
      : '<tr class="empty-row"><td colspan="9">표시할 회차가 없어요.</td></tr>';

    var regionGroups = reportRegionGroups();
    regionComparisonBodyEl.innerHTML = regionGroups.length
      ? regionGroups.map(function(g){ return comparisonRowHTML(g.name, g.rows); }).join('')
      : '<tr class="empty-row"><td colspan="9">표시할 권역이 없어요.</td></tr>';
  }

  function buildNavHTML(items, activeKey, dataAttr){
    return items.map(function(it){
      return '<button type="button" class="region-nav-item' + (it.key === activeKey ? ' active' : '') + '" data-' + dataAttr + '="' + escapeHtml(it.key) + '">' +
        '<span class="region-nav-name">' + escapeHtml(it.label) + '</span>' +
        '<span class="region-nav-count">' + it.count + '</span></button>';
    }).join('');
  }

  // 권역/회차 목록·유효성 검증을 각자 렌더 함수 안에만 두면, 한쪽이 먼저 실행될 때
  // 상대 필터가 아직 검증 전(=구식 값)인 상태로 카운트를 계산하게 돼요 — 예를 들어
  // renderRegionNav()가 matchesRound()로 권역별 개수를 셀 때, filters.round가 그 시점에
  // 아직 유효하지 않은 값이면 모든 권역이 0으로 잘못 계산된 채 그려지고, 그 다음에야
  // renderRoundNav()가 filters.round를 정상값으로 되돌려요(그마저도 한 렌더 늦게). 그래서
  // 두 렌더 함수 모두 시작할 때 "내 필터"뿐 아니라 "상대 필터"까지 같이 검증해요 — 어느
  // 쪽이 먼저 호출되든 카운트를 계산하는 시점엔 둘 다 이미 정상값이 되도록.
  function validateRegionFilter(){
    var used = [];
    STATE.rows.forEach(function(r){ var k = r.region || '미지정'; if(used.indexOf(k) === -1) used.push(k); });
    var all = REGION_PRESETS.slice();
    used.forEach(function(r){ if(r !== '미지정' && all.indexOf(r) === -1) all.push(r); });
    if(used.indexOf('미지정') !== -1) all.push('미지정');
    if(filters.region !== 'all' && all.indexOf(filters.region) === -1) filters.region = 'all';
    return all;
  }

  function validateRoundFilter(){
    var used = [];
    STATE.rows.forEach(function(r){ var k = r.round || DEFAULT_ROUND; if(used.indexOf(k) === -1) used.push(k); });
    var all = ROUND_PRESETS.slice();
    used.forEach(function(r){ if(all.indexOf(r) === -1) all.push(r); });
    // 회차 마스터(프로그램 탭에서 관리)에만 있고 아직 기업이 하나도 없는 회차도 미리 보이게 해요.
    STATE.rounds.forEach(function(r){ if(r.name && all.indexOf(r.name) === -1) all.push(r.name); });
    all.sort(); // "1회차","2회차"... 순서대로 (문자열 정렬이라 10회차 이상이면 따로 손봐야 할 수 있어요)
    if(filters.round !== 'all' && all.indexOf(filters.round) === -1) filters.round = 'all';
    return all;
  }

  function renderRegionNav(){
    validateRoundFilter();
    var all = validateRegionFilter();

    // 자동완성용 datalist에는 "미지정"은 굳이 안 넣어도 돼요 (직접 입력할 값이 아니라서).
    regionListEl.innerHTML = all.filter(function(r){ return r !== '미지정'; })
      .map(function(r){ return '<option value="' + escapeHtml(r) + '">'; }).join('');

    var current = filters.region;

    // 회차 필터·검색·상태·이슈 조건은 유지한 채, "권역"만 무시하고 센 개수예요
    // (다른 사이드바를 고를 때 이 목록의 개수도 같이 갱신되도록).
    var baseRows = STATE.rows.filter(function(r){ return matchesCommon(r) && matchesRound(r); });
    var counts = {};
    baseRows.forEach(function(r){ var k = r.region || '미지정'; counts[k] = (counts[k] || 0) + 1; });

    var items = [{ key:'all', label:'전체', count: baseRows.length }]
      .concat(all.map(function(r){ return { key:r, label:r, count: counts[r] || 0 }; }));
    regionNavEl.innerHTML = buildNavHTML(items, current, 'region');
  }

  function renderRoundNav(){
    validateRegionFilter();
    var all = validateRoundFilter();

    var current = filters.round;
    var baseRows = STATE.rows.filter(function(r){ return matchesCommon(r) && matchesRegion(r); });
    var counts = {};
    baseRows.forEach(function(r){ var k = r.round || DEFAULT_ROUND; counts[k] = (counts[k] || 0) + 1; });

    var items = [{ key:'all', label:'전체', count: baseRows.length }]
      .concat(all.map(function(r){
        var stepNum = String(r).replace(/[^0-9]/g, '');
        var label = stepNum ? 'Step ' + stepNum : r;
        return { key:r, label:label, count: counts[r] || 0 };
      }));
    roundNavEl.innerHTML = buildNavHTML(items, current, 'round');
    if(!stepMessageEl) return;
    // 선택된 회차의 마스터 데이터(프로그램 탭에서 등록)에 시작일이 있으면 오픈예정 메시지를
    // 보여줘요 — 예전엔 "회차 번호가 2일 때만" 하드코딩이었는데, 이제 회차 무관하게 다 됨.
    var roundInfo = current !== 'all' ? STATE.rounds.find(function(r){ return r.name === current; }) : null;
    if(roundInfo && roundInfo.startDate){
      stepMessageEl.textContent = current + '는 ' + formatOpenDateText(roundInfo.startDate) + '에 오픈예정입니다.';
      stepMessageEl.style.display = 'block';
    } else {
      stepMessageEl.textContent = '';
      stepMessageEl.style.display = 'none';
    }
  }
