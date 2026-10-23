# 제나 SD v2

빨간 베레모, 갈색 긴 생머리, 흰 티셔츠와 붉은 체크치마. 가발을 원이와 같은 연결된 전체 표면으로 교체했습니다. 베레모는 별도 착용물입니다. 참고에서 보이지 않는 신발은 흰 양말과 검정 메리제인으로 보완했습니다.

공통 `standard-lean-v2` 몸/관절과 매끈한 다리를 사용합니다. 기본 몸 높이는 2.95이며 모자/장식은 제외합니다.

게임용 편집 원본 `zena-sd-v2.blend`, 실제 모델 `../../client/assets/models/zena-sd-v2-walk.glb`. 의상 원본은 같은 폴더의 `*-outfit-source.blend`입니다.

재생성: 프로젝트 루트에서 Blender --background --python modeling/member-build/build_reference_members.py -- zena 실행. 공통 익스포터와 `member-build/standardize_sd_body.py`를 사용합니다. 가발 생성은 `member-build/build_woni_continuous_wig.py`, 캡 생성은 `member-build/build_minami_continuous_cap.py`가 담당하며 연결 성분 1개와 열린 경계 0개를 검사합니다.
