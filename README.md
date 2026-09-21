# PLAB Dashboard

멘토링 운영을 위한 내부 대시보드입니다. Google Apps Script, Google Sheets, Google Drive를 연동하여 멘티 기업의 진행 상황과 제출 현황을 관리할 수 있도록 구성했습니다.

## Overview

이 대시보드는 다음을 위해 사용됩니다.

- 멘티 기업별 멘토링 진행 상태 확인
- 회차별 세션 완료 여부 추적
- 제출 자료 상태 관리
- 권역별 필터링을 통한 운영 편의성 확보
- Drive 내 기업 폴더와 데이터 정합성 유지

## Key Features

- 기업별 진행 현황 조회
- 회차별 세션 상태 관리
- 계획서/보고서 제출 여부 확인
- 권역별 데이터 필터링
- Drive 폴더 기반 자동 동기화
- 지연 상태 확인 및 관리자 안내
- 역할 기반 접근 제어

## Tech Stack

- Google Apps Script
- Google Sheets
- Google Drive
- HTML, CSS, JavaScript

## Repository Structure

- `index.html` : 대시보드 UI
- `config.js` : 기본 설정 및 운영 상수
- `auth.js` : 로그인 인증 로직
- `sheet.js` : 시트 데이터 처리
- `drive.js` : Drive 스캔 및 동기화
- `digest.js` : 지연 안내 로직
- `triggers.js` : 자동 실행 트리거
- `main.js` : Apps Script 진입점
- `apps-script-code.gs.js` : 호환용 레거시 파일
- `appsscript.json` : Apps Script 설정

## Prerequisites

다음 환경이 필요합니다.

1. Google Workspace 계정
2. Google Apps Script 프로젝트
3. Google Sheet 생성
4. Drive 폴더 구조 준비
5. 필요한 Apps Script 권한 승인

## Setup Guide

### 1. Apps Script 프로젝트 생성

Google Apps Script에서 새 프로젝트를 만들고, 저장소의 파일을 프로젝트에 업로드합니다.

### 2. Sheet 생성

시트 이름을 `rows`로 설정해 주세요. 이 시트는 메인 데이터 저장소로 사용됩니다.

### 3. Drive 폴더 ID 설정

`config.js`에서 루트 폴더 ID를 실제 운영 환경에 맞는 값으로 설정합니다.

### 4. 접근 보안 설정

운영 환경에 맞는 보안 정책을 아래와 같이 적용해야 합니다.

- 관리자 계정은 별도 관리
- 비밀번호는 운영 환경에서 직접 설정
- 사용자 권한은 최소 권한 원칙 적용
- 공유 범위는 필요한 인원으로 제한

### 5. 앱 배포

Apps Script에서 웹 앱으로 배포하고, 필요한 사용자에게만 접근 권한을 부여합니다.

## Deployment

### 웹 앱 배포 절차

1. Apps Script 프로젝트를 엽니다.
2. 코드를 업로드합니다.
3. 배포 메뉴에서 웹 앱을 생성합니다.
4. 실행 권한과 액세스 권한을 설정합니다.
5. 발급된 URL을 운영 환경에 맞게 배포합니다.

## How It Works

### 대시보드 사용

- 좌측 사이드바에서 권역 또는 회차를 선택합니다.
- 표에서 기업 정보를 확인하고 필요한 상태를 수정합니다.
- 세션 상태와 제출 상태를 확인합니다.
- Drive 기반 데이터 동기화를 활용합니다.

### Drive 동기화

`드라이브에서 불러오기` 기능을 통해 지정된 폴더를 스캔합니다.

- 폴더 구조와 파일 구성은 운영 규칙에 맞게 유지해야 합니다.
- 자료 상태는 파일명과 폴더 구조에 기반해 자동 반영됩니다.

### 자동 알림

지연 상태가 발생하면 정해진 일정에 따라 관리자 안내 흐름이 실행됩니다.

## Access Control

권한은 다음 기준으로 구분됩니다.

- 관리자: 전체 관리 가능
- 일반 사용자: 조회 및 제한된 수정 가능
- 권역 기반 접근: 담당 권역 데이터에만 제한적으로 접근

## Security Notes

- 비밀번호와 계정 정보는 코드에 노출하지 않습니다.
- 운영 환경에서는 별도 인증 체계를 적용하는 것을 권장합니다.
- 공유 링크와 접근 권한은 최소 범위로 유지합니다.
- Drive 및 Sheet 권한은 필요한 사람에게만 부여합니다.

## Summary

이 프로젝트는 Google Workspace 환경에서 운영 편의성과 데이터 관리 효율성을 높이기 위해 설계된 내부 대시보드입니다. 보안과 운영 편의성을 함께 고려해 구성되었습니다.
