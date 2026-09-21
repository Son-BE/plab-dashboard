function setupViewSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = "취합자료";
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  // 1. 헤더 데이터 및 수식 입력
  var headers = [
    ["평가일자", "폴더NC", "권역", "멘티기업", "1회차", "2회차", "3회차", "4회차", "5회차", "6회차", "계획서", "보고서", "완료", "이슈", "비고"]
  ];
  sheet.getRange("A1:O1").setValues(headers);
  
  var formulas = [
    [
      '=ARRAYFORMULA(IF(rows!B2:B="","",rows!B2:B))',
      '=ARRAYFORMULA(IF(rows!C2:C="","",rows!C2:C))',
      '=ARRAYFORMULA(IF(rows!D2:D="","",rows!D2:D))',
      '=ARRAYFORMULA(IF(rows!E2:E="","",rows!E2:E))',
      '=ARRAYFORMULA(IF(rows!F2:F="","",IF(rows!F2:F=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!G2:G="","",IF(rows!G2:G=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!H2:H="","",IF(rows!H2:H=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!I2:I="","",IF(rows!I2:I=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!J2:J="","",IF(rows!J2:J=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!K2:K="","",IF(rows!K2:K=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!L2:L="","",IF(rows!L2:L=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!M2:M="","",IF(rows!M2:M=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!N2:N="","",IF(rows!N2:N=TRUE,"Y","")))',
      '=ARRAYFORMULA(IF(rows!O2:O="","",IF(rows!O2:O="issue","문제",IF(rows!O2:O="caution","주의","정상"))))',
      '=ARRAYFORMULA(IF(rows!P2:P="","",rows!P2:P))'
    ]
  ];
  sheet.getRange("A2:O2").setFormulas(formulas);

  // 2. 1행 헤더 서식 설정 (디자인 스타일링)
  var headerRange = sheet.getRange("A1:O1");
  headerRange.setBackground("#2c3e50") // 어두운 블루 계열 배경색
             .setFontColor("#ffffff") // 흰색 글자
             .setFontWeight("bold")   // 굵은 글씨
             .setHorizontalAlignment("center") // 가운데 정렬
             .setVerticalAlignment("middle");  // 수직 중앙 정렬
             
  sheet.setRowHeight(1, 35); // 헤더 행 높이 여유 있게 조절

  // 3. 데이터 영역 전체 서식 설정
  var dataRange = sheet.getRange("A2:O100");
  dataRange.setHorizontalAlignment("center")
           .setVerticalAlignment("middle");

  // 4. 전체 테두리 선 적용
  var fullRange = sheet.getRange("A1:O100");
  fullRange.setBorder(true, true, true, true, true, true, "#d3d3d3", SpreadsheetApp.BorderStyle.SOLID);
}