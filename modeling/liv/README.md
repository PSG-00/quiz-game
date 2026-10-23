# 리브 사진 참고 아바타 — 첫 번째 모델

제공된 사진 4장을 참고해 Blender 4.5에서 스크립트로 만든 애니 스타일 아바타입니다. 사진 자체를 얼굴 텍스처로 사용하지 않았으며, 얼굴의 완전한 복제나 원신 수준의 완성 모델은 아닙니다.

- `liv-reference-v1.blend`: 편집 가능한 모델과 스튜디오 조명/카메라
- `../../client/assets/models/liv-reference-v1.glb`: 게임용 모델 (프로젝트 루트의 `client/assets/models/`)
- `liv-preview.png`: Blender 렌더 미리보기
- `build_liv.py`: 모델 재생성 스크립트. 프로젝트 루트에서 `blender --background --python modeling/liv/build_liv.py` 실행

차콜 카디건, 검은 단추와 어깨 꽃 장식, 은색 목걸이와 꽃 모양 귀걸이, 리본으로 묶은 긴 갈색 머리와 얇은 앞머리, 티어드 스커트, 검은 양말/플랫폼 부츠를 반영했습니다.

게임은 GLB를 한 번 로드한 뒤 메시를 공유합니다. 재질은 캐릭터마다 분리해 한 명의 유령 전환이 다른 사람에게 영향을 주지 않습니다. 팔과 다리의 피벗 그룹을 이용한 간단한 걷기/대기/유령 동작이며, 얼굴 표정 리깅이나 완전한 인체 스켈레톤은 아직 포함하지 않습니다. 로딩 실패 시 기존 기본 형태로 대체하고 다음 정상 로드에서 모델을 교체합니다.

GLTFLoader.js는 Three.js r128의 MIT 라이선스 로더입니다: https://github.com/mrdoob/three.js/tree/r128
