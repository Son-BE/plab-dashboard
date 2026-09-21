function setupUploadSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "업로드자료";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  // 1. 헤더 입력 (A열: Company, B~J열: Q~Y열 대응 항목)
  var headers = [
    ["Company", "평가일자", "폴더NC", "권역", "멘티기업", "회차/구분", "완료여부", "이슈상태", "비고1", "비고2"]
  ];
  sheet.getRange("A1:J1").setValues(headers);
  
  // 2. 수식 입력
  // A열: rows 시트의 E열에서 고유 Company 목록 추출
  // B~J열: A열의 Company를 기준으로 rows 시트의 E열을 찾아 Q~Y열(9개 열) 데이터 일괄 매칭
  var formulas = [
    [
      '=ARRAYFORMULA(IFERROR(UNIQUE(FILTER(rows!E2:E, rows!E2:E<>"")), ""))',
      '=ARRAYFORMULA(IF(A2:A="","", XLOOKUP(A2:A, rows!E2:E, rows!Q2:Y, "")))'
    ]
  ];
  sheet.getRange("A2:B2").setFormulas(formulas);
  
  // 3. 1행 헤더 서식 설정
  var headerRange = sheet.getRange("A1:J1");
  headerRange.setBackground("#2c3e50")
             .setFontColor("#ffffff")
             .setFontWeight("bold")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
}