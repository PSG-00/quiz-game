# 렌더링 비교

브랜치:

- `codex/perf-baseline`: 현재 r128 WebGL, GPU 인스턴싱, PC FXAA.
- `codex/perf-lod`: 같은 렌더러 + 원본 정점 속성을 유지하는 원격 캐릭터 3단계 LOD.
- `codex/perf-webgpu`: 같은 LOD + Three.js 0.186.1 WebGPURenderer, TSL 애니메이션 팔레트.

WebGPU 비교에 업스케일링/프레임 생성은 포함하지 않는다. 픽셀 비율, 해상도 제한, 144FPS 상한과 PC FXAA/모바일 직접 렌더링 조건을 유지한다. WebGPU와 구 WebGL 사이에는 조명/그림자/선 처리의 구현 차이가 남을 수 있다. 새 Three.js의 PCF 그림자와 구 PCFSoft 그림자도 동일 구현은 아니다. GPU 변경만의 이론적 성능 측정이 아닌 앱 이식 결과 비교다.

## 실행

`npm ci` 후 각 브랜치에서 `node scripts/export-perf-version.cjs baseline` / `lod` / `webgpu`를 실행하면 현재 client를 `artifacts/perf-versions/<이름>/client`와 gitignore 처리한 `client/perf/<이름>`에 복사한다. 마지막 복사 경로 덕분에 이미 떠 있는 3105 서버도 재시작 없이 제공할 수 있다. 원본 모델과 퀴즈 데이터는 지우지 않는다.

현재 브랜치의 client를 내보내는 명령이므로 반드시 이름과 해당 브랜치를 맞춘다. LOD 재생성: `node scripts/build-avatar-lod.cjs`. WebGPU 번들 재생성: `node scripts/build-webgpu.cjs`. 패키지 버전은 package-lock.json에 고정되어 있다.

3105 서버는 `npm run test:100`으로 실행한다. 이미 실행 중이면 다시 띄우지 않는다. 실제 100봇 방과 저장 퀴즈는 세 페이지가 같은 서버를 공유한다.

비교 목록: `http://localhost:3105/performance-compare.html`. 폰은 같은 ngrok HTTPS 주소의 `/performance-compare.html`로 접속한다. localhost가 아닌 일반 HTTP는 WebGPU 보안 컨텍스트가 아니므로 HTTPS가 필요하다.

`?benchmark=100`은 서버 방에 입장하지 않고 100개 원격 캐릭터 + 본인을 같은 좌표와 이동식으로 생성한다. 처음 모델 준비 후 10초 예열한다. 저사양 모드는 강제로 OFF이며 저장된 사용자 설정은 변경하지 않는다. 세 페이지에 각자 접속한 사용자가 같은 방 인원을 늘리는 문제를 피한다. 실제 방에서 확인하려면 쿼리를 빼고 입장한다.

한 번에 한 탭만 켜고 30초 측정 → 결과 저장. 같은 기기·브라우저·화면 크기·배터리/전원 모드·주사율로 ①②③, ③②① 순서를 반복한다. 발열 안정 시간을 준다. 평균 FPS와 P95 프레임 간격(낮을수록 좋음), 그려진 삼각형 수, draw calls, 실제 backend를 함께 본다. WebGPU 미지원 화면이면 측정하지 않고 ② WebGL + LOD 링크를 사용한다. Three.js의 자동 WebGL2 대체 경로는 이 앱의 대량 TSL 애니메이션 초기화가 지나치게 느려 비교에서 제외했다. `?forceWebGL=1&benchmark=100`은 미지원 안내 검증용이다.

노트북의 모바일 화면 에뮬레이션은 UI/레이아웃 검증이며 폰 GPU 측정이 아니다. 폰 결과는 실제 폰에서 저장한 JSON이 있어야 판정할 수 있다. 높은 FPS를 보장하지 않는다.

자동 브라우저 점검: `node scripts/perf-browser.cjs` (Playwright 필요, `PLAYWRIGHT_PATH` 지정 가능). 기본 laptop/모바일 레이아웃, 세 버전 각 8초 측정. 결과 `artifacts/perf-comparison.json`. 화면의 수동 측정은 30초다. 별도로 `npm test`로 게임 로직과 LOD 인덱스/로더 연결을 확인한다.

## LOD 정책

본인과 아바타 선택 미리보기는 원본. 원격 캐릭터만 카메라 공간에서 계산한 CSS 픽셀 높이에 따라 원본/중간/먼 단계로 선택한다. 대략 160px, 80px 경계에 히스테리시스를 둬 반복 전환을 방지한다. 원본 GLB를 수정하지 않고 인덱스만 바꿔 UV, 노멀, 스킨 가중치, 리깅을 유지한다. 단계마다 같은 모델을 인스턴싱하므로 단계가 섞이면 draw calls는 증가할 수 있다. 감소한 정점 작업량과 함께 실측으로 평가한다.
