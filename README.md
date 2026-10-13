# jobs

한국 기업의 경력 채용 공고를 수집하고 변경 사항을 보여주는 TypeScript 기반 모니터입니다. Playwright로 사이트를 읽어 공고 스냅샷과 정적 HTML을 생성합니다.

## 수집 범위

[config/sites.json](config/sites.json)에 다음 출처와 기업이 설정되어 있습니다.

- Samsung Careers. 삼성전자 DX·DS.
- 현대자동차 채용.
- 기아 채용.
- 현대모비스 채용.
- LG Careers. LG전자·LG에너지솔루션.

경력 공고를 대상으로 하며, 회사명 별칭과 제외 문구는 설정 파일에서 관리합니다.

## 화면과 데이터

신규·변경·마감 임박·현재 공고를 비교합니다. 마감 임박은 오늘부터 7일 이내의 공고입니다. 데이터의 날짜 기준은 한국 시간입니다.

| 경로 | 역할 |
| --- | --- |
| [src/index.ts](src/index.ts) | 수집·비교·저장·화면 생성 진입점 |
| [src/scrapers](src/scrapers) | 출처별 수집기 |
| [src/diff.ts](src/diff.ts) | 이전·현재 공고 비교 |
| [src/generate-html.ts](src/generate-html.ts) | 정적 HTML 생성 |
| data/snapshot.json | 마지막 저장 스냅샷 |
| data/history | 날짜별 스냅샷 |
| [public/index.html](public/index.html) | 생성된 결과 화면 |
| [tests](tests) | 설정·수집·비교·저장·화면 검사 |

## 로컬 실행

CI와 같은 Node.js 20 환경을 기준으로 합니다. 저장소 루트에서 실행합니다.

~~~powershell
npm ci
npx playwright install chromium
npm test
npm run build
npm run update
~~~

build는 TypeScript 타입 검사이며 배포 HTML을 생성하지 않습니다. update가 실제 사이트에 접속하고 data와 public의 결과를 갱신합니다. 실행 결과에서 postings, sources, failed 수를 확인하고 public/index.html을 브라우저로 엽니다.

## 자동 실행과 배포

[GitHub Actions 워크플로](.github/workflows/update-jobs.yml)는 main push, 수동 실행, 매일 UTC 00:30에 실행하도록 정의되어 있습니다. 한국 시간으로 오전 09:30입니다. 예약 실행은 지연될 수 있습니다.

워크플로는 테스트·타입 검사·수집을 수행하고 생성된 data와 public을 커밋한 뒤 public을 GitHub Pages에 배포합니다. GitHub Pages의 배포 소스를 GitHub Actions로 설정해야 합니다. 워크플로 정의만으로 현재 사이트 접속과 예약 실행 성공을 보장하지 않습니다.

## 수집 실패와 해석

출처 수집이 실패하면 해당 출처의 이전 공고를 보존합니다. 이전보다 수집 건수가 줄어든 출처도 보존 표시와 함께 과거 공고를 유지합니다. 모든 출처가 실패하면 저장 스냅샷·날짜별 이력을 갱신하지 않고 화면에 실패 상태를 반영합니다.

이 보존 정책 때문에 종료된 공고가 계속 보일 수 있습니다. 지원 여부와 마감일은 원래 채용 페이지에서 확인합니다. 사이트 구조·접근 제한이 바뀌면 수집기 검토가 필요합니다.

2026-10-14 기준 코드·설정·워크플로에 근거한 문서입니다. 이번 문서 작업에서 전체 수집과 Pages 접속은 실행하지 않았습니다.
