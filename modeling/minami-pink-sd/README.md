# 미나미 SD v2

갈색 웨이브, 핑크캡, 민트 티셔츠와 분홍 프릴치마, 흰색·분홍색 플랫폼 부츠. 핑크캡은 모자 표면에서 귀가 솟고 챙과 같은 정점을 공유하는 한 개의 닫힌 표면입니다. 별도 삼각형 귀는 제거했습니다.

공통 `standard-lean-v2` 몸/관절과 매끈한 다리를 사용합니다. 기본 몸 높이는 2.95이며 모자/장식은 제외합니다.

게임용 편집 원본 `minami-pink-sd-v2.blend`, 실제 모델 `../../client/assets/models/minami-pink-sd-v2-walk.glb`. 의상 원본은 같은 폴더의 `*-outfit-source.blend`입니다.

재생성: 프로젝트 루트에서 Blender --background --python modeling/minami-pink-sd/build_minami_pink_sd.py 실행. 공통 익스포터와 `member-build/standardize_sd_body.py`를 사용합니다. 가발 생성은 `member-build/build_woni_continuous_wig.py`, 캡 생성은 `member-build/build_minami_continuous_cap.py`가 담당하며 연결 성분 1개와 열린 경계 0개를 검사합니다.
