# CPU / GPU 프레임 진단

게임과 LOD 비교 스냅샷에서 `CPU / GPU 진단`을 열고 `측정 켜기`를 선택한다. `?diagnostics=1`이면 처음부터 켜진다. 비교 A/B/C에 적용했으며 WebGPU 실험은 대상이 아니다. 기본 측정 OFF, GPU 쿼리는 약 250ms마다 최대 4개만 대기한다. 해제 시 대기 쿼리를 삭제한다. 기존 3105 프로세스와 방은 재시작하지 않는다.

- CPU: 렌더링된 게임 프레임 함수의 경과 시간(이동·애니메이션·DOM 변경·WebGL 제출 포함)을 지수 평균한다. 함수 밖 네트워크 이벤트, 브라우저의 후속 레이아웃/페인트, 다른 탭은 포함하지 않는다. 드라이버 대기가 포함될 수 있어 순수 CPU 사용률이 아니다.
- GPU: WebGL1/2의 EXT_disjoint_timer_query 확장으로 장면 및 FXAA 명령의 실행 시간을 비동기로 수집한다. 마지막 유효 표본과 표본 나이를 JSON에 남긴다. 미지원은 수치 대신 안내하고, disjoint 결과는 폐기한다.
- %: 각각을 60 FPS 프레임 예산인 16.67ms로 나눈 값이다. 기기 전체 CPU/GPU 사용률이 아니며 두 값을 합산하지 않는다. 전체 기기 사용률을 웹에서 읽는 것으로 오해하면 안 된다.
- 측정 자체에 비용이 있으므로 순수 FPS 비교에는 진단을 끈다. 임의의 CPU/GPU 병목 판정을 자동으로 표시하지 않는다.

`QuizPerformance.snapshot().diagnostics`에 측정값을 넣어 기존 측정 JSON에서도 보존한다. PC 및 PC GPU의 모바일 레이아웃으로 100명 표시, 실제 GPU 시간 반환, 화면 경계, OFF 시 쿼리 정리를 확인했고 오류 0건이었다. 실제 폰의 확장 지원은 해당 폰에서 확인해야 한다. 단위 테스트는 WebGL1/2, 미지원, 쿼리 제한 및 disjoint 폐기를 검증한다.

참조: https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
