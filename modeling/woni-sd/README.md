# 원이 SD v3

검정 긴 생머리와 흰 이중 줄무늬 트레이닝복, 짙은색 클로그. 분리된 두피와 긴 머리 튜브를 폐기하고 가르마부터 끝단까지 하나의 연결된 닫힌 가발로 교체했습니다. 정수리의 돌출부를 제거했습니다.

공통 `standard-lean-v2` 몸/관절과 매끈한 다리를 사용합니다. 기본 몸 높이는 2.95이며 모자/장식은 제외합니다.

게임용 편집 원본 `woni-sd-v3.blend`, 실제 모델 `../../client/assets/models/woni-sd-v3-walk.glb`. 의상 원본은 같은 폴더의 `*-outfit-source.blend`입니다.

재생성: 프로젝트 루트에서 Blender --background --python modeling/member-build/build_reference_members.py -- woni 실행. 공통 익스포터와 `member-build/standardize_sd_body.py`를 사용합니다. 가발 생성은 `member-build/build_woni_continuous_wig.py`, 캡 생성은 `member-build/build_minami_continuous_cap.py`가 담당하며 연결 성분 1개와 열린 경계 0개를 검사합니다.
