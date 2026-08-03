# swagger-docs-mcp

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | **한국어**

[![npm version](https://img.shields.io/npm/v/swagger-docs-mcp?label=npm&color=CB3837)](https://www.npmjs.com/package/swagger-docs-mcp)
[![CI](https://github.com/qipeijun/swagger-docs-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/qipeijun/swagger-docs-mcp/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Swagger 2.0](https://img.shields.io/badge/Swagger-2.0-85EA2D?logo=swagger&logoColor=111)](#지원-범위)
[![MCP Server](https://img.shields.io/badge/MCP-Server-1B5E3C)](#mcp-tools)
[![License MIT](https://img.shields.io/badge/License-MIT-2F6FEB)](LICENSE)
[![Website](https://img.shields.io/badge/Website-랜딩_페이지-1B5E3C)](https://qipeijun.github.io/swagger-docs-mcp/?lang=ko)

AI Agent가 Swagger 2.0 / Knife4j API 정의를 실시간으로 검색하고 펼칠 수 있게 하는 읽기 전용 MCP 서버입니다.

`swagger-docs-mcp`는 백엔드 API 문서를 읽어야 하는 AI Agent를 위해 설계되었습니다. Swagger 2.0 문서를 실시간으로 가져와 엔드포인트, 매개변수, Schema를 구조화된 결과로 변환하며, 상태 비저장, 읽기 전용, 출처 추적 가능이라는 경계를 유지합니다.

## 주요 기능

- **실시간 조회**: Swagger JSON과 Knife4j(Springfox) `doc.html` 문서 탐색을 지원합니다.
- **다차원 검색**: 카테고리, 경로, HTTP Method, 키워드, Knife4j 딥 링크로 API를 찾습니다.
- **구조화된 Schema**: 지원되는 요청 및 응답 모델을 재귀적으로 펼치고 동적 Map, 순환, 누락 참조, 외부 참조의 경계를 명확히 보존합니다.
- **추적 가능한 결과**: 모든 조회에 문서 진입점, 실제 명세 URL, 조회 시각, 문서 지문이 포함됩니다.
- **명확한 경계**: 문서 URL을 저장하지 않고, 호출 간 캐시를 사용하지 않으며, 비즈니스 API를 호출하거나 해석할 수 없는 필드를 추측하지 않습니다.
- **다중 클라이언트**: Codex, Claude Code, Gemini CLI 및 IDE 기반 Agent 클라이언트 설정을 제공합니다.

## 빠른 시작

Node.js 20 이상이 필요합니다. 전역 설치는 필요하지 않습니다.

### MCP 클라이언트 연결

[`swagger-docs-mcp`](https://www.npmjs.com/package/swagger-docs-mcp)는 npm에 배포되어 있습니다. Codex, Claude Code, Gemini CLI는 설정을 자동으로 기록하고 실제 실행 명령이 기대한 명령과 일치하는지 검증합니다.

```bash
npx --yes swagger-docs-mcp@latest setup codex
npx --yes swagger-docs-mcp@latest setup claude
npx --yes swagger-docs-mcp@latest setup gemini
```

IDE 기반 클라이언트도 같은 진입점에서 해당 형식의 설정을 생성합니다.

```bash
npx --yes swagger-docs-mcp@latest setup cursor
npx --yes swagger-docs-mcp@latest setup vscode
npx --yes swagger-docs-mcp@latest setup opencode
```

지원되는 모든 클라이언트를 확인합니다.

```bash
npx --yes swagger-docs-mcp@latest setup list
```

자동 설정은 이후 실행을 재현할 수 있도록 현재의 정확한 패키지 버전을 클라이언트 설정에 기록합니다. 이 프로젝트가 생성한 이전 설정을 제거하려면 다음을 실행합니다.

```bash
npx --yes swagger-docs-mcp@latest remove claude
```

현재 `upgrade`는 소유권과 안전성 검사만 수행합니다. 공식 클라이언트 CLI가 검증 가능한 원자적 교체와 완전한 롤백을 제공하지 않으므로, 이전 버전을 발견하면 기존 설정을 먼저 삭제하지 않고 중단한 뒤 수동 업그레이드를 요청합니다.

### Agent에게 설정 요청

로컬 명령과 파일 작업이 가능한 Agent에게 아래 작업을 전달하십시오. 기존 설정을 덮어쓰지 않도록 설치와 설정 전에 클라이언트 및 설정 계약을 검증하게 합니다.

```text
현재 MCP 클라이언트에 swagger-docs-mcp를 설치하고 설정해 주세요.

요구 사항:
1. Node.js가 버전 20 이상인지 확인하고 현재 클라이언트의 정확한 이름을 식별하세요. 클라이언트나 설정 형식을 추측하지 마세요.
2. `npx --yes swagger-docs-mcp@latest setup list`를 실행하고 출력에서 정확한 클라이언트 ID를 선택하세요.
3. `npx --yes swagger-docs-mcp@latest setup <client>`를 실행하세요.
4. 명령이 설정을 자동으로 기록한다면 실행 명령 일관성 검증이 명시적으로 통과했는지 확인하세요.
5. 명령이 JSON만 출력한다면 현재 클라이언트의 공식 설정 파일 위치와 구조를 먼저 확인하세요. 다른 설정을 유지하면서 `swagger-docs` 항목을 병합한 뒤 다시 파싱하여 전체 실행 명령을 검증하세요.
6. 같은 이름의 설정, 권한 오류, 검증 실패 또는 불명확한 외부 계약이 있으면 즉시 중단하고 원인을 설명하세요. 덮어쓰기, 삭제 또는 추측에 의한 수정을 하지 마세요.
7. 마지막으로 `npx --yes swagger-docs-mcp@latest doctor`를 실행하고 실제 클라이언트 ID, 명령, 수정 위치, 검증 결과를 보고하세요.

Swagger 문서 URL, 비밀번호 또는 Token을 저장하지 말고 이번 연결과 무관한 MCP 설정을 수정하지 마세요.
```

### 진단 실행

```bash
# 로컬 실행 환경 확인
npx --yes swagger-docs-mcp@latest doctor

# 실시간 문서 탐색 확인
npx --yes swagger-docs-mcp@latest doctor http://127.0.0.1:8080/doc.html

# 지정 그룹 확인
npx --yes swagger-docs-mcp@latest doctor https://example.com/doc.html --group exact-group-name

# CI 또는 스크립트용 JSON 출력
npx --yes swagger-docs-mcp@latest doctor https://example.com/doc.html --json
```

## 지원 클라이언트

| ID | 클라이언트 | 연결 방식 |
| --- | --- | --- |
| `codex` | OpenAI Codex | 설정을 기록하고 실행 명령 일관성을 검증 |
| `claude` | Claude Code | 설정을 기록하고 실행 명령 일관성을 검증 |
| `gemini` | Gemini CLI | 설정을 기록하고 실행 명령 일관성을 검증 |
| `vscode` | VS Code / GitHub Copilot | `servers` 설정 생성 |
| `cursor` | Cursor | `mcpServers` 설정 생성 |
| `windsurf` | Windsurf | `mcpServers` 설정 생성 |
| `trae` | Trae | `mcpServers` 설정 생성 |
| `cline` | Cline | `mcpServers` 설정 생성 |
| `roo` | Roo Code | `mcpServers` 설정 생성 |
| `kiro` | Kiro | `mcpServers` 설정 생성 |
| `opencode` | OpenCode v2 | `mcp.servers` 설정 생성 |

자동 설정은 공식 클라이언트 CLI만 호출합니다. 탐색 명령은 시스템 임시 디렉터리에서 실행되며 제한 시간은 15초입니다. 설정 생성 모드는 JSON만 출력하고 사용자 파일을 읽거나 수정하지 않습니다. `setup`은 같은 이름의 설정을 덮어쓰지 않습니다. npm alias, 추가 실행 인수 및 파싱할 수 없는 설정은 외부 설정으로 취급합니다. 추가나 검증 실패 시 동시 기록된 설정을 잘못 삭제하지 않도록 서비스 이름 기준 자동 정리를 하지 않고 수동 확인을 요청합니다. 제거 시 실행 전에 실행 명령을 다시 검증하고 실행 후 같은 이름의 설정이 사라졌는지 확인합니다.

"설정 생성"은 클라이언트가 공개한 설정 구조에 따라 템플릿을 출력한다는 의미입니다. 모든 클라이언트 버전에서 런타임 연동을 검증했다는 뜻은 아닙니다. 설정 형식이 바뀌면 공식 문서를 기준으로 호환성 Issue를 등록하십시오.

## 사용 예시

대화에서 문서 URL과 조회 대상을 함께 제공합니다.

```text
http://203.0.113.10:8080/doc.html의 모든 API 카테고리를 나열해 주세요.
```

```text
http://203.0.113.10:8080/doc.html의
/api/v1/study-exam-stat/baseline-class-stat POST를 조회하고
모든 요청 및 응답 필드를 펼쳐 주세요.
```

```text
http://203.0.113.10:8080/doc.html에서 "성적 통계"를 검색해 주세요.
```

Knife4j 딥 링크를 직접 조회할 수도 있습니다.

```text
다음 API를 조회해 주세요:
http://203.0.113.10:8080/doc.html#/default/uniform-study-exam-stat-controller/getUniformStudyExamStatDetailUsingGET
```

예시 주소 `203.0.113.10`은 IANA 예약 주소이며 실제 서비스를 가리키지 않습니다.

### 메인 Agent에서 개발과 디버깅 계속하기

`swagger-docs-mcp`는 실시간 API 문서를 읽고 검증한 Tool 결과를 현재 메인 Agent에 직접 반환합니다. Agent는 요청 및 응답 필드를 수동으로 복사하지 않고 프로젝트 코드를 확인하고 연동을 완성하며 테스트를 실행할 수 있습니다.

```text
아래 API 문서를 기준으로 현재 기능을 디버깅해 주세요:

http://203.0.113.10:8080/doc.html#/default/uniform-study-exam-stat-controller/getUniformStudyExamStatDetailUsingGET

요구 사항:
1. 먼저 swagger-docs-mcp로 API를 실시간 조회하고 검증하세요. 필드를 추측하지 마세요.
2. 요청 Method, 경로, 필수 매개변수, 요청 본문, 응답 필드를 확인하세요.
3. 현재 프로젝트의 기존 API 래퍼, 호출 위치, 페이지 상태를 확인하세요.
4. 프로젝트의 기존 패턴에 따라 수정하거나 연동을 완료하고 추측성 호환 분기를 추가하지 마세요.
5. 필요한 테스트 또는 페이지 진단을 실행하고 문서 출처와 실제 검증 결과를 보고하세요.
```

메인 Agent에는 대상 코드, 터미널 또는 브라우저 디버깅 환경, 테스트 환경에 필요한 네트워크 및 로그인 상태도 필요합니다. 이 MCP는 문서만 읽고 Swagger에 기술된 비즈니스 API를 호출하지 않습니다. 비즈니스 요청은 프로젝트 런타임 또는 메인 Agent의 디버깅 도구가 수행합니다.

## MCP Tools

| Tool | 설명 |
| --- | --- |
| `inspect_api_docs` | 문서 진입점 또는 딥 링크를 식별하고 탐색 단서를 검증하여 다음 작업을 반환 |
| `list_api_categories` | API 카테고리와 작업 수를 페이지 단위로 나열 |
| `get_api_category` | 정확한 카테고리 이름의 요약 또는 전체 문서를 반환 |
| `get_api_by_path` | 정확한 경로와 선택적 HTTP Method의 전체 API 문서를 반환 |
| `search_apis` | 경로, 요약, 설명, 카테고리, operationId 검색 |

모든 Tool은 `docsUrl`을 명시적으로 전달하고 `outputSchema`를 선언해야 합니다. 성공 결과에는 공통으로 `source`, `sourceNotice`, `data`, `warnings`, `completeness`가 포함됩니다. 오류 결과는 `isError: true`와 안정적인 오류 코드 및 실패 단계를 반환합니다. API 상세에는 요청 매개변수, 요청 본문 Schema, 응답 상태와 함께 다음 항목이 포함됩니다.

- `schemaTree`: 모델 계층을 유지하는 필드 트리.
- `flatFields`: 검색 및 표시용 평면 필드 경로.
- `schemaReferences`: 해석 과정에서 참조한 Schema.
- `unresolvedDynamicFields`: 정적으로 펼칠 수 없는 동적 필드.
- `warnings`, `completeness`: 파싱 경계와 결과 완전성.

### 조회 흐름

1. `inspect_api_docs`가 문서 진입점과 Knife4j hash 단서를 실시간으로 확인합니다.
2. 여러 그룹이 있으면 정확한 사용자 선택을 위해 후보를 반환하며 서버는 추측하지 않습니다.
3. 카테고리나 API가 유일하지 않으면 후보를 반환하고 유일하게 식별된 뒤 `get_api_by_path`를 호출합니다.
4. 이후 호출에서도 원래 `docsUrl`과 확인된 `group`, `path`, `method`를 전달합니다.

`sourceNotice`는 이번 조회의 출처와 캐시 상태를 설명합니다. Agent는 최종 답변에도 이 정보를 유지해야 합니다.

## 지원 범위

| 항목 | 상태 |
| --- | --- |
| Swagger 2.0 JSON | 지원 |
| Knife4j / Springfox 문서 탐색 | 지원 |
| Knife4j hash 딥 링크 | 지원 |
| OpenAPI 3.x | 아직 지원하지 않으며 명시적인 버전 오류 반환 |
| MCP 전송 | stdio |
| 문서 프로토콜 | HTTP, HTTPS |
| URL 내장 인증 정보 | 지원하지 않음 |
| 외부 `$ref` | 가져오지 않고 파싱 경계를 보존 |
| 최상위 매개변수 / 응답 로컬 `$ref` | 지원하며 누락 참조는 부분 완전으로 표시 |
| Schema 로컬 `$ref`, 배열, `allOf` | 재귀적으로 펼침 |
| 동적 Map, 순환 참조, 최대 깊이 | 경계를 보존하고 부분 완전으로 표시 |

## 보안 경계

- 사용자가 명시한 문서 진입점과 동일 출처의 탐색 URL에만 접근하고 명세에 기술된 비즈니스 API는 호출하지 않습니다.
- Tool 호출마다 문서를 다시 가져오며 URL, 선택 상태, 과거 응답을 저장하지 않습니다.
- 요청 제한 시간은 10초, 최대 응답 본문은 20 MB입니다.
- 동일 출처 리디렉션을 최대 3회만 따르고 교차 호스트 리디렉션 및 탐색 URL을 거부합니다.
- 사용자 이름이나 비밀번호가 포함된 URL을 거부하고 외부 `$ref`를 읽지 않습니다.
- 동적 필드, 누락 참조, 순환, 최대 깊이 경계를 명확한 경고로 반환합니다.
- 업스트림 실패 시 실패 단계와 요청 URL을 반환하고 과거 문서로 대체하지 않습니다.
- 추적을 위해 문서 URL을 결과에 포함합니다. URL 쿼리 매개변수에 비밀번호나 Token을 넣지 마세요.

기본적으로 프로세스가 접근할 수 있는 공용, 사설 네트워크 및 localhost HTTP(S) 주소에 접근할 수 있으므로 이 도구는 SSRF 격리 프록시가 아닙니다. 신뢰할 수 없는 URL을 처리할 때는 정확한 출처 허용 목록을 설정하십시오.

```bash
SWAGGER_DOCS_ALLOWED_ORIGINS=https://api.example.com,http://127.0.0.1:8080 \
  npx --yes swagger-docs-mcp@latest
```

전체 신뢰 경계와 취약점 보고 방법은 [SECURITY.md](SECURITY.md)를 참고하십시오.

## 개발

```bash
npm run dev               # TypeScript 진입점 직접 실행
npm run typecheck         # 타입 검사
npm test                  # 전체 테스트
npm run test:integration  # MCP 통합 테스트
npm run build             # dist 빌드
npm run check             # 타입 검사, 테스트, 빌드
```

빌드 후 `node dist/index.js setup <client> --local`로 로컬 소스에 연결할 수 있습니다. `--local`은 이 저장소의 `dist/index.js` 절대 경로를 기록하므로 저장소를 이동한 뒤 설정을 다시 생성해야 합니다.

| 디렉터리 | 역할 |
| --- | --- |
| `src/source` | 안전한 HTTP 조회와 문서 탐색 |
| `src/navigation` | Knife4j hash 탐색 파싱 |
| `src/parser` | 공통 파서 계약 |
| `src/swagger2` | Swagger 2.0 파서 구현 |
| `src/service` | 조회, 페이지 처리, 출처 메타데이터 |
| `src/server` | MCP Tool 계약 |
| `src/cli` | 진단 및 클라이언트 설정 |
| `src/domain` | 공유 도메인 모델 |

새 명세 버전을 추가할 때는 새 `ApiSpecParser`를 구현하고 기존 Service 및 MCP Tool 계약을 재사용할 수 있습니다.

### JavaScript / TypeScript API

npm 루트 내보내기는 CLI 부작용이 없습니다. `createMcpServer`, `ApiDocsService`, `Swagger2Parser`, `SafeHttpClient` 및 도메인 타입을 공개합니다. 루트에서 내보내지 않은 `dist` 내부 경로는 Semantic Versioning 호환 범위에 포함되지 않습니다.

```ts
import { ApiDocsService } from "swagger-docs-mcp";

const service = new ApiDocsService();
const result = await service.listCategories("https://api.example.com/v2/api-docs", undefined, 1, 20);
```

## 릴리스

1. 버전과 [CHANGELOG.md](CHANGELOG.md)를 갱신하고 `npm run check`와 `npm pack --dry-run`을 실행합니다.
2. npm Trusted Publisher가 이 저장소의 `publish.yml`을 가리키고 GitHub `npm` Environment 보호 및 배포 권한이 의도한 정책과 일치하는지 확인합니다. 이는 일회성 설정이며 계약이 바뀔 때만 갱신합니다.
3. `package.json`과 일치하는 `vX.Y.Z` GitHub Release를 생성합니다. 워크플로가 배포 게이트를 다시 실행하고 OIDC 및 provenance로 패키지를 배포합니다.

수동 `npm publish`에서는 `prepublishOnly`가 타입 검사, 전체 테스트, 빌드를 강제합니다. `0.x` 단계에서는 실험 기능이 마이너 버전에서 변경될 수 있으며 공개 계약이 안정된 후 `1.0.0`을 배포합니다.

## License

[MIT](LICENSE)
