// Mobile-first quiz stage: the reference specifications define layout and game rules.

const ARENA_HALF_W = 10;
const STAGE_MIN_Z = -7;
const STAGE_MAX_Z = 7;
const SPECTATOR_MIN_Z = 8.6;
const SPECTATOR_MAX_Z = 9.8;
const SPECTATOR_HALF_W = 7.5;
let layoutScaleX = 1, layoutScaleZ = 1;
const STAGE_HEIGHT = 2.2; // 관전석보다 높게 올라온 무대
const CAMERA_ELEVATION = 24 * Math.PI / 180;
const cameraFollow={enabled:false,x:0,targetX:0,maxX:0,initialized:false};
let chatSceneLayout = null;

let ws = null;
let serverFeatures={};
let myClientId = null;
let currentRoomId = null;
let roomState = null;
let renderedPhaseKey = null;
const NICKNAME_STORAGE_KEY = 'ox-nickname-v1';
let serverTimeOffset = 0;
let isMuted = false;
let hasSeenRules = false;
try { hasSeenRules = sessionStorage.getItem("ox-rules-seen") === "1"; } catch {}
let findMeUntil = 0;
let resultStorage;
try { resultStorage = window.sessionStorage; } catch {}
const winnerNoticeGate = QuizResultNotices.createGate(resultStorage);

// 상태판 이전 인원 (탈락/부활 시 숫자 강조 애니메이션용)
let prevAliveCount = -1;
let prevGhostCount = -1;

// 방 만들기 퀴즈 빌더 목록
let builderQuestions = [];

// 플레이어 렌더링 엔티티 맵
const playerEntities = new Map();

// 내 캐릭터 로컬 위치
let myPos = { x: -6, z: 0 };
let myMoveTarget = null;
let lastSentPosTime = 0;

const keysPressed = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  KeyW: false,
  KeyS: false,
  KeyA: false,
  KeyD: false
};

// 간단한 Web Audio 효과음 합성기 (음소거 버튼 연동)
let audioCtx = null;
function playTone(freq, duration = 0.12, type = 'sine') {
  if (isMuted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch {
    // 오디오 컨텍스트 제한 시 무시
  }
}

// ==================== 1. Three.js 파스텔 2.5D 스튜디오 초기화 ====================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeee8e2);


const camera = new THREE.PerspectiveCamera(42,window.innerWidth/window.innerHeight,.1,600);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
const nameplates = document.createElement('div');
nameplates.id = 'player-names';
container.appendChild(nameplates);
const nicknamePosition = new THREE.Vector3();
const badgePosition = new THREE.Vector3();

// 부드럽고 따뜻한 스튜디오 조명
const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff9f4, 0.75);
dirLight.position.set(12, 42, 26);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
Object.assign(dirLight.shadow.camera, {left:-30, right:30, top:30, bottom:-30, far:100});
dirLight.shadow.normalBias = .04;
dirLight.shadow.bias = -.0002;
dirLight.shadow.radius = 4;
scene.add(dirLight);

const worldGroup = new THREE.Group();
scene.add(worldGroup);

// (1) 스튜디오 전체 하단 바닥 (관전 구역 바닥 y = 0)
const hallFloorGeo = new THREE.PlaneGeometry(160, 120);
const hallFloorMat = new THREE.MeshStandardMaterial({ color: 0xd3cbc4, roughness: 0.85 });
const hallFloor = new THREE.Mesh(hallFloorGeo, hallFloorMat);
hallFloor.rotation.x = -Math.PI / 2;
hallFloor.position.y = -0.02;
hallFloor.receiveShadow = true;
hallFloorMat.color.convertSRGBToLinear();
worldGroup.add(hallFloor);
const spectatorStrip = new THREE.Mesh(new THREE.BoxGeometry(15.6, .08, 1.65), new THREE.MeshStandardMaterial({color:new THREE.Color(0xd6cce2).convertSRGBToLinear(),roughness:.9}));
spectatorStrip.receiveShadow = true;
scene.add(spectatorStrip);

const grid = new THREE.GridHelper(100, 35, 0xd8cec4, 0xe0d6cd);
grid.position.y = .005; grid.material.transparent = true; grid.material.opacity = .32; worldGroup.add(grid);
for (const x of [-15, 15]) {
  const column = new THREE.Mesh(new THREE.CylinderGeometry(.7,.9,14,20), new THREE.MeshStandardMaterial({color:0xdfd4ca,roughness:.85}));
  column.position.set(x,7,-15); column.castShadow=true; worldGroup.add(column);
  const planter = new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.1,1.6,20),new THREE.MeshStandardMaterial({color:0xe0d4c4}));
  planter.position.set(x, .8,-8); worldGroup.add(planter);
  for(let i=0;i<3;i++) {
    const leaf=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshStandardMaterial({color:0x86a78b,roughness:.9}));
    leaf.position.set(x+(i-1)*.65,1.9+i*.2,-8); leaf.scale.set(.8,1.1,.7);worldGroup.add(leaf);
  }
}

// (2) 입체 메인 무대 베이스 (앞쪽 벽면 단차가 보이도록 y = STAGE_HEIGHT로 돌출)
const stageDepth = STAGE_MAX_Z - STAGE_MIN_Z; // 17
const stageCenterZ = (STAGE_MIN_Z + STAGE_MAX_Z) / 2; // -1.5

function roundedSlab(width, height, depth, radius = .55) {
  const shape = new THREE.Shape(), w = width / 2, d = depth / 2, r = radius;
  shape.moveTo(-w+r,-d); shape.lineTo(w-r,-d); shape.quadraticCurveTo(w,-d,w,-d+r);
  shape.lineTo(w,d-r); shape.quadraticCurveTo(w,d,w-r,d); shape.lineTo(-w+r,d);
  shape.quadraticCurveTo(-w,d,-w,d-r); shape.lineTo(-w,-d+r); shape.quadraticCurveTo(-w,-d,-w+r,-d);
  const geometry = new THREE.ExtrudeGeometry(shape,{depth:height-.12,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:3,steps:1});
  geometry.rotateX(-Math.PI/2); geometry.translate(0,-height/2,0); return geometry;
}
const stageBaseGeo = roundedSlab(ARENA_HALF_W * 2 + 1.6, STAGE_HEIGHT, stageDepth + 1.4);
const stageBaseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7 });
const stageBaseMesh = new THREE.Mesh(stageBaseGeo, stageBaseMat);
stageBaseMesh.position.set(0, STAGE_HEIGHT / 2, stageCenterZ);
worldGroup.add(stageBaseMesh);

// 무대 상단 아이보리 테두리 림
const stageRimGeo = roundedSlab(ARENA_HALF_W * 2 + 1.9, .22, stageDepth + 1.7);
const stageRimMat = new THREE.MeshStandardMaterial({ color: 0xfff3de, roughness: 0.55 });
const stageRimMesh = new THREE.Mesh(stageRimGeo, stageRimMat);
stageRimMesh.position.set(0, STAGE_HEIGHT - 0.08, stageCenterZ);
worldGroup.add(stageRimMesh);

// 무대 모서리 조명 기둥 (볼라드 라이트)
function addCornerBollard(x, z, yBase) {
  const postGeo = new THREE.CylinderGeometry(0.42, 0.48, 1.3, 16);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x948c9e, roughness: 0.6 });
  const post = new THREE.Mesh(postGeo, postMat);
  post.position.set(x, yBase + 0.65, z);
  worldGroup.add(post);

  const lampGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.38, 16);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(x, yBase + 1.4, z);
  worldGroup.add(lamp);
}

addCornerBollard(-ARENA_HALF_W - 0.7, STAGE_MIN_Z - 0.6, STAGE_HEIGHT);
addCornerBollard(ARENA_HALF_W + 0.7, STAGE_MIN_Z - 0.6, STAGE_HEIGHT);
addCornerBollard(-ARENA_HALF_W - 0.7, STAGE_MAX_Z + 0.6, STAGE_HEIGHT);
addCornerBollard(ARENA_HALF_W + 0.7, STAGE_MAX_Z + 0.6, STAGE_HEIGHT);

// The MC stands on a separate dais at the head of the arena. Keep this group
// outside worldGroup so adapting the board depth never stretches the host.
const podiumGroup = new THREE.Group();
scene.add(podiumGroup);

const podiumStepGeo = roundedSlab(6,.6,3,.4);
const podiumStepMat = new THREE.MeshStandardMaterial({ color: 0xbca7d0, roughness: .7 });
const podiumStep = new THREE.Mesh(podiumStepGeo, podiumStepMat);
podiumStep.position.y = .3;
podiumStep.receiveShadow=true;
podiumGroup.add(podiumStep);

const deskGeo = roundedSlab(3.3,1.4,1,.18);
const deskMat = new THREE.MeshStandardMaterial({ color: 0xf5ebd6, roughness: 0.5 });
const deskMesh = new THREE.Mesh(deskGeo, deskMat);
deskMesh.position.set(0,1.3,.65);
podiumGroup.add(deskMesh);

const hostSprite = window.ClayAvatars.create(0, true);
hostSprite.position.set(0,.6,-.3);
hostSprite.scale.setScalar(1.25);
podiumGroup.add(hostSprite);
const crownTex = window.PixelSprites.createFloorSymbolTexture('♛', '#c9984c', THREE);
const crown = new THREE.Sprite(new THREE.SpriteMaterial({map: crownTex, transparent: true}));
crown.position.set(0,1.3,1.18);crown.scale.set(.9,.9,1);podiumGroup.add(crown);
const hostSpeechBubble=document.getElementById('host-speech-bubble');
const hostSpeechAnchor=new THREE.Vector3();

// (4) 무대 바닥 구역 플랫폼 생성 함수
function createStageZone(width, depth, colorHex, symbol, symbolColor, x, z) {
  const group = new THREE.Group();
  group.position.set(x, STAGE_HEIGHT + 0.02, z);

  const geo = new THREE.BoxGeometry(width, 0.3, depth);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex).convertSRGBToLinear(), roughness: 0.55 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.12;
  mesh.receiveShadow = true;
  group.add(mesh);

  let symbolMesh = null;
  if (symbol) {
    const symTex = window.PixelSprites.createFloorSymbolTexture(symbol, symbolColor, THREE);
    const size = Math.min(width, depth) * 0.72;
    const symGeo = new THREE.PlaneGeometry(size, size);
    const symMat = new THREE.MeshBasicMaterial({ map: symTex, transparent: true, depthWrite: false });
    const symMesh = new THREE.Mesh(symGeo, symMat);
    symMesh.rotation.x = -Math.PI / 2;
    symMesh.position.y = 0.05;
    scene.add(symMesh);
    symbolMesh = symMesh;
  }

  return { group, mesh, symbolMesh, targetY: STAGE_HEIGHT + 0.02 };
}

// (A) OX 무대 (좌: 파스텔 민트 O, 우: 파스텔 코랄 X)
const oxFloorGroup = new THREE.Group();
worldGroup.add(oxFloorGroup);

const zoneO = createStageZone(ARENA_HALF_W - 0.15, stageDepth, 0x4cd4b0, 'O', 'rgba(255,255,255,0.88)', -ARENA_HALF_W / 2, stageCenterZ);
const zoneX = createStageZone(ARENA_HALF_W - 0.15, stageDepth, 0xf6877f, 'X', 'rgba(255,255,255,0.88)', ARENA_HALF_W / 2, stageCenterZ);
oxFloorGroup.add(zoneO.group, zoneX.group);

const centerLineGeo = new THREE.PlaneGeometry(0.45, stageDepth);
const centerLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const centerLineMesh = new THREE.Mesh(centerLineGeo, centerLineMat);
centerLineMesh.rotation.x = -Math.PI / 2;
centerLineMesh.position.set(0, STAGE_HEIGHT + 0.07, stageCenterZ);
oxFloorGroup.add(centerLineMesh);

// (B) 객관식 2×2 무대 (시안 02번: 1 파랑, 2 민트, 3 옐로우, 4 코랄)
const multiFloorGroup = new THREE.Group();
multiFloorGroup.visible = false;
worldGroup.add(multiFloorGroup);

const laneW = (ARENA_HALF_W * 2) / 4;
const lane1 = createStageZone(ARENA_HALF_W - .1, stageDepth / 2 - .1, 0x84b9ed, '1', '#ffffff', -5, -stageDepth / 4);
const lane2 = createStageZone(ARENA_HALF_W - .1, stageDepth / 2 - .1, 0x74cdb4, '2', '#ffffff', 5, -stageDepth / 4);
const lane3 = createStageZone(ARENA_HALF_W - .1, stageDepth / 2 - .1, 0xf1d385, '3', '#ffffff', -5, stageDepth / 4);
const lane4 = createStageZone(ARENA_HALF_W - .1, stageDepth / 2 - .1, 0xf0a29a, '4', '#ffffff', 5, stageDepth / 4);
multiFloorGroup.add(lane1.group, lane2.group, lane3.group, lane4.group);

// (C) 주관식 단일 에메랄드 민트 무대 (시안 01번)
const shortFloorGroup = new THREE.Group();
shortFloorGroup.visible = false;
worldGroup.add(shortFloorGroup);
const singleStage = createStageZone(ARENA_HALF_W * 2, stageDepth, 0x4cd4b0, '', '', 0, stageCenterZ);
shortFloorGroup.add(singleStage.group);

// 바닥 터치 이동용 레이캐스트 평면
const rayPlaneGeo = new THREE.PlaneGeometry(100, 200);
const rayPlaneMat = new THREE.MeshBasicMaterial({ visible: false });
const rayPlane = new THREE.Mesh(rayPlaneGeo, rayPlaneMat);
rayPlane.rotation.x = -Math.PI / 2;
rayPlane.position.y = STAGE_HEIGHT;
scene.add(rayPlane);

const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!canMove()) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  const onStage = playerEntities.get(myClientId)?.onStage;
  rayPlane.position.y = onStage ? STAGE_HEIGHT : 0;
  rayPlane.updateMatrixWorld();
  raycaster.setFromCamera(mouseNDC, camera);
  const hits = raycaster.intersectObject(rayPlane);
  if (hits.length > 0) {
    const rawHit = hits[0].point;
    const hit = {x:rawHit.x/layoutScaleX,z:rawHit.z/layoutScaleZ};
    const pt = onStage ? screenToStage(hit.x, hit.z) : spectatorFromScene(rawHit.x,rawHit.z);
    const minZ = onStage ? STAGE_MIN_Z + .8 : SPECTATOR_MIN_Z;
    const maxZ = onStage ? STAGE_MAX_Z - .8 : SPECTATOR_MAX_Z;
    const halfW = onStage ? ARENA_HALF_W - .8 : SPECTATOR_HALF_W;
    myMoveTarget = {x:Math.max(-halfW,Math.min(halfW,pt.x)),z:Math.max(minZ,Math.min(maxZ,pt.z))};
  }
});

// 텍스트 입력에 포커스가 있을 때 키보드 이동 입력을 중지
function isInputFocused() {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
}

window.addEventListener('keydown', (e) => {
  if (isInputFocused()) {
    // 입력창 포커스 중에는 키보드 이동 상태 초기화
    for (const k in keysPressed) keysPressed[k] = false;
    return;
  }
  if (e.code in keysPressed) {
    keysPressed[e.code] = true;
    myMoveTarget = null;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code in keysPressed) {
    keysPressed[e.code] = false;
  }
});

// Portrait-only analogue stick. Pointer capture keeps movement working when a
// finger leaves the ring; releasing/cancelling always clears the movement.
const joystickRoot=document.getElementById('movement-joystick');
const joystickBase=document.getElementById('joystick-base');
const joystickKnob=document.getElementById('joystick-knob');
const joystick={pointerId:null,x:0,z:0};
function resetJoystick(){
  const pointerId=joystick.pointerId;
  joystick.pointerId=null;joystick.x=0;joystick.z=0;
  joystickKnob.style.transform='translate(0px,0px)';
  joystickBase.classList.remove('is-active');
  if(pointerId!==null&&joystickBase.hasPointerCapture(pointerId))joystickBase.releasePointerCapture(pointerId);
}
function updateJoystickPointer(event){
  const rect=joystickBase.getBoundingClientRect();
  const radius=(rect.width-joystickKnob.offsetWidth)/2-5;
  const dx=event.clientX-rect.left-rect.width/2,dz=event.clientY-rect.top-rect.height/2;
  const distance=Math.hypot(dx,dz),travel=Math.min(radius,distance),strength=Math.max(0,(travel/radius-.12)/.88);
  joystick.x=distance?dx/distance*strength:0;joystick.z=distance?dz/distance*strength:0;
  joystickKnob.style.transform=`translate(${distance?dx/distance*travel:0}px,${distance?dz/distance*travel:0}px)`;
}
joystickBase.addEventListener('pointerdown',event=>{
  if(event.button!==0||joystick.pointerId!==null||!portraitScreen()||!canMove())return;
  event.preventDefault();event.stopPropagation();
  joystick.pointerId=event.pointerId;myMoveTarget=null;
  joystickBase.setPointerCapture(event.pointerId);joystickBase.classList.add('is-active');
  updateJoystickPointer(event);
});
joystickBase.addEventListener('pointermove',event=>{
  if(event.pointerId!==joystick.pointerId)return;
  event.preventDefault();event.stopPropagation();updateJoystickPointer(event);
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])joystickBase.addEventListener(type,event=>{
  if(event.pointerId===joystick.pointerId){event.stopPropagation();resetJoystick();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetJoystick();});

// 가로 / 세로 화면 비율에 맞춰 무대와 상단/하단 HUD가 절대 겹치지 않도록 카메라 구도 자동 조정
function portraitScreen() { return window.innerHeight > window.innerWidth; }
function sceneLayout(x,z) { return {x:x*layoutScaleX,z:z*layoutScaleZ}; }
function spectatorSceneStart(){return (STAGE_MAX_Z+1)*layoutScaleZ+1.2;}
function spectatorToScene(x,z) { return {x:x*layoutScaleX,z:spectatorSceneStart()+(z-SPECTATOR_MIN_Z)*.7}; }
function spectatorFromScene(x,z) { return {x:x/layoutScaleX,z:SPECTATOR_MIN_Z+(z-spectatorSceneStart())/.7}; }
// All devices share one wide board and the same left/right answer directions.
function stageToScreen(x,z) { return {x,z}; }
function screenToStage(x,z) { return {x,z}; }
function fitStageCamera(w,h){
  camera.aspect=w/h;camera.clearViewOffset();camera.updateProjectionMatrix();
  const wasFollowing=cameraFollow.enabled;
  cameraFollow.enabled=portraitScreen();
  if(wasFollowing!==cameraFollow.enabled)cameraFollow.initialized=false;
  const points=[];
  for(const x of [-11*layoutScaleX,11*layoutScaleX])for(const y of [0,STAGE_HEIGHT+5.95])for(const z of [STAGE_MIN_Z*layoutScaleZ-1,STAGE_MAX_Z*layoutScaleZ+1])points.push(new THREE.Vector3(x,y,z));
  for(const x of [-5,5])for(const y of [STAGE_HEIGHT,STAGE_HEIGHT+4.3])points.push(new THREE.Vector3(x,y,STAGE_MIN_Z*layoutScaleZ-3.4));
  for(const x of [-SPECTATOR_HALF_W*layoutScaleX,SPECTATOR_HALF_W*layoutScaleX])for(const y of [0,5.95])for(const z of [spectatorSceneStart()-.5,spectatorToScene(0,SPECTATOR_MAX_Z).z+1])points.push(new THREE.Vector3(x,y,z));
  const target=new THREE.Vector3(0,STAGE_HEIGHT*.6,1.2);
  const direction=new THREE.Vector3(0,Math.sin(CAMERA_ELEVATION),Math.cos(CAMERA_ELEVATION));
  function bounds(distance){
    camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,valid=true;
    for(const point of points){const p=point.clone().project(camera);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);if(p.z<=-1||p.z>=1)valid=false;}
    return {minX,maxX,minY,maxY,valid};
  }
  let low=15,high=300;
  for(let i=0;i<24;i++){
    const distance=(low+high)/2,b=bounds(distance);
    // Portrait fits the board's height, leaving its sides available to pan.
    if(b.valid&&b.maxY-b.minY<=1.72&&(cameraFollow.enabled||b.maxX-b.minX<=1.90))high=distance;else low=distance;
  }
  const b=bounds(high);
  camera.setViewOffset(w,h,0,(.88-b.maxY)*h/2,w,h);
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const frontDepth=-new THREE.Vector3(0,STAGE_HEIGHT,STAGE_MAX_Z*layoutScaleZ).applyMatrix4(camera.matrixWorldInverse).z;
  const frontHalfWidth=frontDepth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect;
  cameraFollow.maxX=Math.max(0,ARENA_HALF_W*layoutScaleX-frontHalfWidth);
  updateFollowCamera(0,true);
}
function updateFollowCamera(dt,restore=false){
  if(!cameraFollow.enabled){cameraFollow.x=0;cameraFollow.targetX=0;camera.position.x=0;camera.updateMatrixWorld(true);return;}
  const mine=currentRoomId?playerEntities.get(myClientId):null;
  if(mine&&currentRoomId){
    const worldX=mine.x*layoutScaleX;
    if(!cameraFollow.initialized){cameraFollow.x=cameraFollow.targetX=worldX;cameraFollow.initialized=true;}
    const z=mine.onStage?mine.z*layoutScaleZ:spectatorToScene(mine.x,mine.z).z;
    const depth=-new THREE.Vector3(worldX,mine.y+1.5,z).applyMatrix4(camera.matrixWorldInverse).z;
    const deadZone=Math.max(.3,depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*.16);
    if(worldX>cameraFollow.targetX+deadZone)cameraFollow.targetX=worldX-deadZone;
    else if(worldX<cameraFollow.targetX-deadZone)cameraFollow.targetX=worldX+deadZone;
  }
  cameraFollow.targetX=THREE.MathUtils.clamp(cameraFollow.targetX,-cameraFollow.maxX,cameraFollow.maxX);
  cameraFollow.x=THREE.MathUtils.clamp(cameraFollow.x,-cameraFollow.maxX,cameraFollow.maxX);
  if(!restore)cameraFollow.x+=(cameraFollow.targetX-cameraFollow.x)*(1-Math.exp(-7*dt));
  camera.position.x=cameraFollow.x;camera.updateMatrixWorld(true);
}
function updateCameraForScreen() {
  if(chatSceneLayout){
    if(window.innerWidth===chatSceneLayout.windowWidth)return;
    releaseChatScene();
  }
  const hud=document.getElementById('game-hud');
  if(!hud.classList.contains('hidden')){
    const top=document.querySelector('.top-hud-stack').getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--scene-top',(top+3)+'px');
  }
  // Answer panels float over the same viewport; only header height affects it.
  document.documentElement.style.setProperty('--scene-bottom','0px');
  const w=container.clientWidth||window.innerWidth,h=container.clientHeight||window.innerHeight;
  const portrait=portraitScreen();
  layoutScaleX=1.4;layoutScaleZ=1.3;
  fitStageCamera(w,h);
  worldGroup.scale.set(layoutScaleX,1,layoutScaleZ);
  podiumGroup.position.set(0,STAGE_HEIGHT,STAGE_MIN_Z*layoutScaleZ-1.9);
  // Always frame the outside spectator walkway, even before anyone is eliminated.
  spectatorStrip.scale.x=layoutScaleX;
  spectatorStrip.visible=true;
  spectatorStrip.position.set(0,.02,spectatorSceneStart()+.42);
  worldGroup.updateMatrixWorld(true);
  const focal=h/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  for(const zone of [zoneO,zoneX,lane1,lane2,lane3,lane4]){
    const mark=zone.symbolMesh;if(!mark)continue;
    const position=zone.group.getWorldPosition(new THREE.Vector3());
    mark.position.set(position.x,STAGE_HEIGHT+.09,position.z);mark.visible=zone.group.parent.visible;
    const distance=-mark.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const isOX=zone===zoneO||zone===zoneX;
    const desiredPixels=Math.min(isOX?(portrait?85:120):(portrait?64:90),w*.24,h*.24);
    const fit=Math.min(.9,desiredPixels/(mark.geometry.parameters.width*focal/distance));
    mark.scale.set(fit,fit/Math.sin(CAMERA_ELEVATION),1);
  }
  renderer.setSize(w,h);
  if(isSceneInputFocused()&&!chatSceneLayout)freezeSceneForInput();
}
window.addEventListener('resize', updateCameraForScreen);
const layoutObserver = new ResizeObserver(updateCameraForScreen);
[container, document.querySelector('.top-hud-stack'), document.querySelector('.bottom-controls-row')].forEach(el => layoutObserver.observe(el));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => {
  document.documentElement.style.setProperty('--app-height', window.visualViewport.height + 'px');
  document.body.classList.toggle('keyboard-open', isInputFocused() && window.innerHeight - window.visualViewport.height > 100);
  updateCameraForScreen();
});
updateCameraForScreen();

// 주관식 입력창 엔터키 이벤트 등록
document.getElementById('short-answer-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    window.submitShortAnswer();
  }
});

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    window.sendChatMessage();
  }
});

// ==================== 3. 플레이어 엔티티 & 나만 보이는 금빛 이중 링 ====================
const shadowGeo = new THREE.CircleGeometry(0.75, 24);
const shadowMat = new THREE.MeshBasicMaterial({
  color: 0x2e2540,
  transparent: true,
  opacity: 0.28,
  depthWrite: false
});

const goldRingGeo = new THREE.PlaneGeometry(2.8, 2.8);

function getOrCreatePlayerEntity(p) {
  if (playerEntities.has(p.i)) {
    return playerEntities.get(p.i);
  }

  const isMe = p.i === myClientId;
  if (isMe) myPos = {x:p.x, z:p.z};
  const onStage = Boolean(p.st);
  const floorY = onStage ? STAGE_HEIGHT : 0;

  const group = new THREE.Group();
  group.position.set(p.x, floorY, p.z);

  // 다른 캐릭터 발밑에는 식별 링을 그리지 않고 접지 그림자만 사용한다!
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.04;
  group.add(shadowMesh);

  // 내 캐릭터 한 명만 발밑 금빛 이중 링과 작은 빛 포인트를 가진다!
  let goldRingMesh = null;
  if (isMe) {
    const ringTex = window.PixelSprites.createLocalGoldRingTexture(THREE);
    const ringMat = new THREE.MeshBasicMaterial({
      map: ringTex,
      transparent: true,
      depthWrite: false
    });
    goldRingMesh = new THREE.Mesh(goldRingGeo, ringMat);
    goldRingMesh.rotation.x = -Math.PI / 2;
    goldRingMesh.position.y = 0.06; // 바닥 마크(O/X)에 가려지지 않도록 살짝 위
    goldRingMesh.renderOrder = 5;
    group.add(goldRingMesh);
  }

  // Use the server's validated selection for both local and remote players.
  const avatarId=AvatarCatalog.normalize(p.av);
  const avatarSeed=avatarId==='default'?0:p.s;
  const charSprite = window.ClayAvatars.create(avatarSeed,false,avatarId);
  group.add(charSprite);

  // 머리 위 O/X·번호·관전 말풍선 + 내 캐릭터 전용 '나' 표식 캔버스
  const overheadCanvas = document.createElement('canvas');
  overheadCanvas.width = 256;
  overheadCanvas.height = 128;
  const overheadTex = new THREE.CanvasTexture(overheadCanvas);
  overheadTex.colorSpace = THREE.SRGBColorSpace;

  const overheadMat = new THREE.SpriteMaterial({
    map: overheadTex,
    transparent: true,
    depthTest: false
  });
  const overheadSprite = new THREE.Sprite(overheadMat);
  // Anchor the visible tail, excluding the transparent canvas padding.
  overheadSprite.center.set(.5,1-(isMe?70:96)/128);
  overheadSprite.renderOrder = 12;
  group.add(overheadSprite);

  scene.add(group);
  const nameLabel = document.createElement('div');
  nameLabel.className = `player-name${isMe ? ' is-me' : ''}${p.a ? '' : ' is-ghost'}`;
  nameLabel.textContent = p.n;
  nameLabel.dataset.playerId = p.i;
  nameplates.appendChild(nameLabel);
  const chatBubble = document.createElement('div');
  chatBubble.className = 'player-chat hidden';
  chatBubble.dataset.chatPlayerId = p.i;
  const chatText = document.createElement('div');
  chatText.className = 'player-chat-text';
  chatBubble.appendChild(chatText);
  nameplates.appendChild(chatBubble);

  const entity = {
    id: p.i,
    name: p.n,
    nameLabel,
    chatBubble,
    chatText,
    group,
    charSprite,
    avatarId,
    overheadSprite,
    overheadCanvas,
    overheadTex,
    shadowMesh,
    goldRingMesh,
    x: p.x,
    z: p.z,
    y: floorY,
    targetX: p.x,
    targetZ: p.z,
    targetY: floorY,
    alive: Boolean(p.a),
    onStage,
    seed: avatarSeed,
    zoneId: p.zId || 'O',
    hasSubmitted: Boolean(p.h),
    isEditing: Boolean(p.e),
    submittedText: p.t || '',
    lastResult: p.r || null,
    chatBubbleText: '',
    chatExpireAt: 0,
    lastBadgeKey: '',
    motion: AvatarMotion.create(avatarSeed)
  };

  playerEntities.set(p.i, entity);
  return entity;
}

// 플레이어 머리 위 말풍선 결정 (O/X·보기 번호·제출 여부 배지와 본인 '나' 표시는 별개로 유지!)
function computeOverheadBadge(entity) {
  const q = roomState && roomState.currentQuestion;
  const state = roomState ? roomState.state : 'WAITING';

  if (state === 'JUDGE' && entity.lastResult === 'REVIVED') {
    return { text: '✨ 부활!', theme: 'REVIVED' };
  }

  // 무대 아래 관전 구역에 있는 경우 (일반 라운드의 유령 또는 패자부활전의 생존자)
  if (!entity.onStage) {
    return { text: '관전', theme: 'GHOST' };
  }
  if(state==='BREAK')return {text:'휴식',theme:'MINORITY'};
  if(q?.type==='MINORITY')return {text:entity.zoneId==='LEFT'?'왼쪽':'오른쪽',theme:'MINORITY'};

  // 무대 위 참가자인 경우
  if (q && q.type === 'MULTIPLE') {
    if (q.inputMode !== 'MOVE') return { text: entity.hasSubmitted ? '✓ 선택 완료' : '•••', theme: entity.hasSubmitted ? 'SUBMIT' : 'GHOST' };
    const zId = entity.zoneId || '1';
    return { text: zId, theme: zId };
  }

  if (q && q.type === 'SHORT') {
    return entity.isEditing
      ? { text: '입력 중', theme: 'GHOST' }
      : entity.hasSubmitted ? { text: '✓ 제출 완료', theme: 'SUBMIT' } : { text: '•••', theme: 'GHOST' };
  }

  // 기본 OX 모드
  const ox = entity.zoneId || (entity.x < 0 ? 'O' : 'X');
  return { text: ox, theme: ox };
}

function updatePlayerOverheadIfNeeded(entity) {
  const isMe = entity.id === myClientId;
  const badge = computeOverheadBadge(entity);
  const key = `${badge.text}|${badge.theme}|${isMe}`;

  if (entity.lastBadgeKey !== key) {
    entity.lastBadgeKey = key;
    window.PixelSprites.drawOverheadCanvas(
      entity.overheadCanvas,
      badge.text,
      badge.theme,
      isMe,
      false // The local nameplate now carries the separate 나 marker.
    );
    entity.overheadTex.needsUpdate = true;
  }
}

// ==================== 4. 60 FPS 렌더링 & 보간 루프 ====================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  const joystickEnabled=portraitScreen()&&canMove();
  joystickRoot.classList.toggle('hidden',!joystickEnabled);
  if(!joystickEnabled&&(joystick.pointerId!==null||joystick.x||joystick.z))resetJoystick();

  // 1) 내 캐릭터 이동 처리 (입력창 포커스 중에는 키보드 이동 중지)
  if (canMove()) {
    const myEntity = playerEntities.get(myClientId);
    const minZ = myEntity && !myEntity.onStage ? SPECTATOR_MIN_Z : STAGE_MIN_Z + .8;
    const maxZ = myEntity && !myEntity.onStage ? SPECTATOR_MAX_Z : STAGE_MAX_Z - .8;

    let moveX = 0;
    let moveZ = 0;
    if (!isInputFocused()) {
      if (keysPressed.ArrowLeft || keysPressed.KeyA) moveX -= 1;
      if (keysPressed.ArrowRight || keysPressed.KeyD) moveX += 1;
      if (keysPressed.ArrowUp || keysPressed.KeyW) moveZ -= 1;
      if (keysPressed.ArrowDown || keysPressed.KeyS) moveZ += 1;
      if(!moveX&&!moveZ){moveX=joystick.x;moveZ=joystick.z;}
    }

    const moveSpeed = 7.0;
    if (moveX !== 0 || moveZ !== 0) {
      const len = Math.hypot(moveX, moveZ);
      const strength=Math.min(1,len);
      myPos.x += (moveX / len) * moveSpeed * strength * dt;
      myPos.z += (moveZ / len) * moveSpeed * strength * dt;
      myMoveTarget = null;
    } else if (myMoveTarget) {
      const dx = myMoveTarget.x - myPos.x;
      const dz = myMoveTarget.z - myPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.15) {
        const step = Math.min(dist, moveSpeed * dt);
        myPos.x += (dx / dist) * step;
        myPos.z += (dz / dist) * step;
      } else {
        myMoveTarget = null;
      }
    }

    const movementHalfW = myEntity?.onStage ? ARENA_HALF_W - .8 : SPECTATOR_HALF_W;
    myPos.x = Math.max(-movementHalfW, Math.min(movementHalfW, myPos.x));
    myPos.z = Math.max(minZ, Math.min(maxZ, myPos.z));

    if (ws && ws.readyState === WebSocket.OPEN && now - lastSentPosTime > 55) {
      lastSentPosTime = now;
      ws.send(JSON.stringify({ type: 'MOVE', x: myPos.x, z: myPos.z }));
    }

    if (myEntity) {
      myEntity.targetX = myPos.x;
      myEntity.targetZ = myPos.z;
      const qType = (roomState && roomState.currentQuestion) ? roomState.currentQuestion.type : 'OX';
      if (myEntity.onStage) {
        if(qType==='MINORITY'){
          myEntity.zoneId=myPos.x<0?'LEFT':'RIGHT';
        } else if (qType === 'OX') {
          myEntity.zoneId = myPos.x < 0 ? 'O' : 'X';
        } else if (qType === 'MULTIPLE') {
          myEntity.zoneId = String((myPos.z >= 0 ? 2 : 0) + (myPos.x >= 0 ? 2 : 1));
          highlightSelectedMultiBtn(myEntity.zoneId);
        }
      }
    }
  }

  updateFollowCamera(dt);
  // 2) 모든 캐릭터 위치 보간 및 금빛 링 애니메이션
  const viewWidth = container.clientWidth, viewHeight = container.clientHeight;
  for (const entity of playerEntities.values()) {
    const dx = entity.targetX - entity.x;
    const dz = entity.targetZ - entity.z;
    const dy = entity.targetY - entity.y;
    const dist = Math.hypot(dx, dz);

    const lerp = 1-Math.exp(-(entity.id === myClientId ? 25.85 : 14.91)*dt);
    entity.x += dx * lerp;
    entity.z += dz * lerp;
    entity.y += dy * 0.2;

    // 발 중심을 기준으로 바닥 높이에 정확히 정렬
    const screenPosition = entity.onStage ? stageToScreen(entity.x, entity.z) : {x:entity.x,z:entity.z};
    const viewPosition = entity.onStage ? sceneLayout(screenPosition.x, screenPosition.z) : spectatorToScene(entity.x,entity.z);
    const facingProjection=entity.onStage?stageToScreen(dx,dz):{x:dx,z:dz};
    const facingX=facingProjection.x*layoutScaleX,facingZ=facingProjection.z*(entity.onStage?layoutScaleZ:.7);
    if(dist<.08)entity.motion.teleporting=false;
    AvatarMotion.advance(entity.motion,dt,facingX,facingZ,dist*lerp,entity.motion.teleporting);
    entity.charSprite.rotation.y=entity.motion.heading;
    window.ClayAvatars.update(entity.charSprite,!entity.alive,entity.motion.blend>.02,now,entity.seed,entity.motion);
    entity.group.position.set(viewPosition.x, entity.y, viewPosition.z);
    const displayHeight=entity.charSprite.userData.displayHeight||entity.charSprite.userData.visualHeight||2.95;
    nicknamePosition.set(viewPosition.x,entity.y+displayHeight,viewPosition.z).project(camera);
    const nameVisible = Math.abs(nicknamePosition.x)<1.1 && Math.abs(nicknamePosition.y)<1.1 && Math.abs(nicknamePosition.z)<1;
    const anchorX=(nicknamePosition.x+1)*viewWidth/2,nameY=(1-nicknamePosition.y)*viewHeight/2-5;
    entity.nameLabel.style.visibility = nameVisible ? 'visible' : 'hidden';
    entity.nameLabel.style.transform = `translate3d(${anchorX}px,${nameY}px,0) translate(-50%,-100%)`;
    entity.nameLabel.classList.toggle('find-me-muted',entity.id!==myClientId && performance.now()<findMeUntil);
    const badgeBottom=nameY-entity.nameLabel.offsetHeight-3;
    badgePosition.set(nicknamePosition.x,1-badgeBottom/viewHeight*2,nicknamePosition.z).unproject(camera);
    const depth=-badgePosition.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const badgeWidth=entity.id===myClientId?104:96,badgeHeight=badgeWidth/2;
    const unitsPerPixel=2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/viewHeight;
    entity.overheadSprite.position.copy(badgePosition).sub(entity.group.position);
    entity.overheadSprite.scale.set(badgeWidth*unitsPerPixel,badgeHeight*unitsPerPixel,1);
    const badgeTop=badgeBottom-badgeHeight*62/128;
    const chatting = nameVisible&&Math.abs(nicknamePosition.x)<1&&!!entity.chatBubbleText&&Date.now()<entity.chatExpireAt;
    entity.chatBubble.classList.toggle('hidden',!chatting);
    if(chatting) {
      entity.chatBubble.classList.remove('side-chat','chat-on-right','chat-on-left');
      entity.chatBubble.style.maxWidth='';
      entity.chatText.style.maxHeight = Math.max(20,badgeTop-28)+'px';
      let bubbleWidth=entity.chatBubble.offsetWidth,bubbleHeight=entity.chatBubble.offsetHeight;
      let left=Math.max(8,Math.min(viewWidth-bubbleWidth-8,anchorX-bubbleWidth/2));
      let top=Math.max(8,Math.min(viewHeight-bubbleHeight-10,badgeTop-bubbleHeight-5));
      // On short landscape screens there may be no room above the badges.
      // Put chat beside the head instead of overlapping the name or status.
      if(badgeTop-bubbleHeight-5<8){
        const clearance=Math.max(entity.nameLabel.offsetWidth/2,badgeWidth/2)+12;
        const rightSpace=viewWidth-anchorX-clearance-8,leftSpace=anchorX-clearance-8;
        const onRight=rightSpace>=leftSpace;
        if(Math.max(rightSpace,leftSpace)>=64){
          entity.chatBubble.classList.add('side-chat',onRight?'chat-on-right':'chat-on-left');
          entity.chatBubble.style.maxWidth=Math.max(64,Math.min(250,onRight?rightSpace:leftSpace))+'px';
          entity.chatText.style.maxHeight=Math.max(20,viewHeight-50)+'px';
          bubbleWidth=entity.chatBubble.offsetWidth;bubbleHeight=entity.chatBubble.offsetHeight;
          left=onRight?anchorX+clearance:anchorX-clearance-bubbleWidth;
          top=Math.max(8,Math.min(viewHeight-bubbleHeight-10,nameY+5-bubbleHeight/2));
          entity.chatBubble.style.setProperty('--chat-tail-y',Math.max(12,Math.min(bubbleHeight-12,nameY+5-top))+'px');
        }
      }
      entity.chatBubble.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0)`;
      entity.chatBubble.style.setProperty('--chat-tail-x',Math.max(12,Math.min(bubbleWidth-12,anchorX-left))+'px');
    }

    // 내 캐릭터 전용 금빛 이중 링 회전 연출
    if (entity.goldRingMesh) {
      entity.goldRingMesh.rotation.z = now * .0008;
      const locating = performance.now() < findMeUntil;
      entity.goldRingMesh.scale.setScalar(locating ? 1.45 + Math.sin(now*.012)*.18 : 1);
    }

    entity.overheadSprite.visible = nameVisible&&(entity.id === myClientId || performance.now() >= findMeUntil);
    updatePlayerOverheadIfNeeded(entity);
  }

  // 3) 오답 구역 무대 바닥 하강 연출
  for (const plat of [zoneO, zoneX, lane1, lane2, lane3, lane4]) {
    plat.group.position.y += (plat.targetY - plat.group.position.y) * 0.14;
  }

  podiumGroup.visible=!!currentRoomId;
  hostSpeechBubble.style.visibility=currentRoomId?'visible':'hidden';
  if(currentRoomId){
    hostSprite.userData.body.position.y=Math.sin(now*.002)*.025;
    podiumGroup.updateMatrixWorld(true);
    hostSpeechAnchor.set(0,4.25,-.3).applyMatrix4(podiumGroup.matrixWorld).project(camera);
    hostSpeechBubble.style.visibility=Math.abs(hostSpeechAnchor.x)<.96&&Math.abs(hostSpeechAnchor.y)<1?'visible':'hidden';
    const anchorX=(hostSpeechAnchor.x+1)*viewWidth/2,anchorY=(1-hostSpeechAnchor.y)*viewHeight/2;
    const width=hostSpeechBubble.offsetWidth,height=hostSpeechBubble.offsetHeight;
    const left=Math.max(8,Math.min(viewWidth-width-8,anchorX-width/2));
    const top=Math.max(4,anchorY-height-10);
    hostSpeechBubble.style.transform=`translate3d(${left}px,${top}px,0)`;
    hostSpeechBubble.style.setProperty('--host-tail-x',Math.max(12,Math.min(width-12,anchorX-left))+'px');
  }
  updateTimerDisplay();
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// ==================== 5. 웹소켓 통신 ====================
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      case 'WELCOME': {
        myClientId = msg.clientId;
        serverFeatures=msg.features||{};renderQuizBuilder();
        libraryReady=false;
        ws.send(JSON.stringify({type:'AUTH_LIBRARY',token:libraryToken,legacyRoomTokens}));
        renderRoomList(msg.rooms || []);
        break;
      }

      case 'QUIZ_LIST':renderMyQuizzes(msg.quizzes||[]);break;
      case 'PUBLIC_QUIZ_LIST':renderPublicQuizzes(msg.quizzes||[]);break;
      case 'QUIZ_SAVED':receiveSavedQuiz(msg);break;
      case 'QUIZ_SAVE_CONFIRM':receiveSaveConfirmation(msg);break;
      case 'QUIZ_LOADED':receiveLoadedQuiz(msg);break;
      case 'QUIZ_DELETED':receiveDeletedQuiz(msg.quizId);break;
      case 'ROOM_LIST': {
        renderRoomList(msg.rooms || []);
        break;
      }

      case 'JOINED_ROOM': {
        creatingRoomRequestId=null;updateSaveButtons();
        cameraFollow.initialized=false;cameraFollow.x=0;cameraFollow.targetX=0;
        currentRoomId = msg.roomId;
        document.getElementById('lobby-overlay').classList.add('hidden');
        document.getElementById('game-hud').classList.remove('hidden');
        requestAnimationFrame(updateCameraForScreen);
        break;
      }
      case 'ROOM_STATE': {
        if(msg.roomId!==currentRoomId)break;
        roomState = msg;
        serverTimeOffset = Date.now() - (msg.serverNow || Date.now());
        handleRoomStateUpdate(msg);
        break;
      }

      case 'WORLD_TICK': {
        if(!currentRoomId)break;
        handleWorldTick(msg.p || []);
        break;
      }

      case 'CHAT_MSG': {
        const ent = playerEntities.get(msg.senderId);
        if (ent) {
          ent.chatBubbleText = msg.text;
          ent.chatText.textContent = msg.text;
          ent.chatExpireAt = Date.now() + Math.max(3500,Math.min(8000,Array.from(msg.text).length*140));
          ent.lastBadgeKey = '';
          updatePlayerOverheadIfNeeded(ent);
        }
        break;
      }

      case 'ANSWER_ACK': {
        const mine = playerEntities.get(myClientId);
        if (mine) { mine.hasSubmitted = true; mine.isEditing = false; }
        highlightSelectedMultiBtn(msg.answer);
        break;
      }

      case 'ERROR': {
        if(pendingCodeLoad?.requestId===msg.requestId){resetCodeLoad(msg.message||'코드를 확인해 주세요.');break;}
        pendingQuizSaves.delete(msg.requestId);
        if(creatingRoomRequestId===msg.requestId)creatingRoomRequestId=null;
        if(overwriteRequestId===msg.requestId){overwriteRequestId=null;document.getElementById('save-quiz-dialog').close();}
        updateSaveButtons();
        document.getElementById('confirm-delete-quiz').disabled=false;
        setQuizStatus(msg.message||'처리하지 못했어요.');
        alert(msg.message || '오류가 발생했습니다.');
        break;
      }
    }
  };

  ws.onclose = () => {
    resetCodeLoad('서버 연결이 끊겼어요. 다시 연결된 뒤 불러와 주세요.');
    libraryReady=false;pendingQuizSaves.clear();creatingRoomRequestId=null;overwriteRequestId=null;document.getElementById('save-quiz-dialog').close();updateSaveButtons();returnToLobby();
    setTimeout(connectWebSocket, 2000);
  };
}

initQuizBuilder();
initNickname();
AvatarPicker.init();
connectWebSocket();

function triggerPillBump(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 350);
}

function handleWorldTick(compactList) {
  const hadSpectators = [...playerEntities.values()].some(entity=>!entity.onStage);
  const seenIds = new Set();
  let aliveCount = 0;
  let ghostCount = 0;

  for (const p of compactList) {
    seenIds.add(p.i);
    if (p.a) aliveCount++;
    else ghostCount++;

    const entity = getOrCreatePlayerEntity(p);
    const avatarId=AvatarCatalog.normalize(p.av);
    if(entity.avatarId!==avatarId||(window.AvatarModels?.[avatarId]?.loaded&&!entity.charSprite.userData.importedGLB)){
      entity.group.remove(entity.charSprite);ClayAvatars.dispose(entity.charSprite);
      entity.charSprite=ClayAvatars.create(avatarId==='default'?0:p.s,false,avatarId);entity.group.add(entity.charSprite);entity.avatarId=avatarId;
    }

    if (entity.name !== p.n) { entity.name = p.n; entity.nameLabel.textContent = p.n; }
    entity.nameLabel.classList.toggle('is-ghost',!p.a);
    const roleChanged = entity.onStage !== Boolean(p.st);
    if(roleChanged||Math.hypot(p.x-entity.x,p.z-entity.z)>8)entity.motion.teleporting=true;
    entity.alive = Boolean(p.a);
    entity.onStage = Boolean(p.st);
    entity.targetY = p.st ? STAGE_HEIGHT : 0;
    entity.isEditing = Boolean(p.e);
    if (p.i === myClientId && (roleChanged || ['PREPARING', 'JUDGE'].includes(roomState?.state))) {
      myPos = { x: p.x, z: p.z }; myMoveTarget = null;
      entity.targetX = p.x; entity.targetZ = p.z;
    }
    entity.zoneId = p.zId;
    entity.hasSubmitted = Boolean(p.h);
    if (p.t !== undefined) entity.submittedText = p.t;
    entity.lastResult = p.r || null;
    if (p.i === myClientId) {
      const label = document.getElementById('local-answer-state');
      if (label) label.textContent = p.e ? '수정 중 · 다시 제출해 주세요' : p.h ? '✓ 제출 완료 · 마감 전 변경 가능' : '나만 보이는 비공개 답안';
    }

    if (p.i !== myClientId) {
      entity.targetX = p.x;
      entity.targetZ = p.z;
    }
  }

  for (const [id, ent] of playerEntities.entries()) {
    if (!seenIds.has(id)) {
      scene.remove(ent.group);
      ClayAvatars.dispose(ent.charSprite);
      ent.nameLabel.remove();
      ent.chatBubble.remove();
      playerEntities.delete(id);
    }
  }

  // 상태판 갱신 및 인원 변동 시 강조 애니메이션
  if (aliveCount !== prevAliveCount) {
    document.getElementById('hud-alive-count').textContent = `생존 ${aliveCount}`;
    if (prevAliveCount !== -1) triggerPillBump('pill-alive');
    prevAliveCount = aliveCount;
  }
  if (ghostCount !== prevGhostCount) {
    document.getElementById('hud-ghost-count').textContent = `유령 ${ghostCount}`;
    if (prevGhostCount !== -1) triggerPillBump('pill-ghost');
    prevGhostCount = ghostCount;
  }
  updateMinorityCounts();
  if(hadSpectators !== [...playerEntities.values()].some(entity=>!entity.onStage))requestAnimationFrame(updateCameraForScreen);
}

function updateMinorityCounts(){
  if(roomState?.currentQuestion?.type!=='MINORITY')return;
  const outcome=roomState.minorityOutcome;
  const participants=[...playerEntities.values()].filter(entity=>entity.onStage);
  const left=outcome?outcome.leftCount:participants.filter(entity=>entity.targetX<0).length;
  const right=outcome?outcome.rightCount:participants.length-left;
  document.getElementById('minority-left-count').textContent=left;
  document.getElementById('minority-right-count').textContent=right;
}
function handleRoomStateUpdate(stateMsg) {
  document.getElementById('hud-target-count').textContent = `목표 ${stateMsg.targetWinners}명`;

  const isHost = stateMsg.hostId === myClientId;
  document.getElementById('btn-modal-restart').classList.toggle('hidden',!isHost);
  const startBtn = document.getElementById('btn-start-game');
  const resetBtn = document.getElementById('btn-reset-game');
  const showStart = isHost && stateMsg.state === 'WAITING';
  document.getElementById('btn-show-results').classList.toggle('hidden',stateMsg.state!=='ENDED');
  startBtn.style.display = showStart ? 'inline-flex' : 'none';
  resetBtn.style.display = isHost && stateMsg.state === 'ENDED' ? 'block' : 'none';
  if (currentRoomId && !hasSeenRules) {
    hasSeenRules = true;
    try { sessionStorage.setItem('ox-rules-seen','1'); } catch {}
    document.getElementById('rules-dialog').showModal();
  }

  const board = document.getElementById('question-board');
  const stepInfo = document.getElementById('q-step-info');
  const typeSub = document.getElementById('q-type-sub');
  const mainText = document.getElementById('q-main-text');
  const hostBubble = document.getElementById('host-speech-bubble');
  const revivalRoleBadge = document.getElementById('revival-role-badge');
  const topChoicesBar = document.getElementById('top-choices-bar');
  const shortPanel = document.getElementById('short-answer-panel');
  const multiPanel = document.getElementById('multiple-answer-panel');
  const winnerModal = document.getElementById('winner-modal');

  const q = stateMsg.currentQuestion;
  document.getElementById('minority-status').classList.toggle('hidden',!(q?.type==='MINORITY'&&['PREPARING','QUESTION','JUDGE'].includes(stateMsg.state)));
  updateMinorityCounts();
  // Membership updates repeat ROOM_STATE for the same question. Keep focused
  // inputs mounted and untouched so mobile keyboards and IME composition stay open.
  const phaseKey = JSON.stringify([stateMsg.roomId, stateMsg.gameId, stateMsg.state, q?.index, stateMsg.stateEndTime]);
  const phaseChanged = phaseKey !== renderedPhaseKey;
  renderedPhaseKey = phaseKey;
  if (phaseChanged&&stateMsg.state!=='BREAK') closeChatPopup();

  // 사회자 말풍선 업데이트
  if (hostBubble) {
    const announcements={WAITING:'참가자 여러분, 준비되면 시작해 주세요!',COUNTDOWN:'곧 첫 번째 문제가 시작됩니다!',PREPARING:'자리를 확인해 주세요. 곧 시작해요!',JUDGE:'정답을 공개했어요! 위 퀴즈창을 확인해 주세요.',BREAK:'잠깐 쉬면서 자유롭게 채팅해 주세요!',LOTTERY:'생존자 중 당첨자를 추첨하고 있어요!',ENDED:'당첨자가 결정됐어요. 모두 수고하셨습니다!'};
    hostBubble.textContent=q?.type==='MINORITY'&&stateMsg.state==='JUDGE'?'승리 구역이 정해졌어요! 위 결과를 확인해 주세요.':announcements[stateMsg.state]||stateMsg.hostSpeech||'원하는 쪽으로 이동해 주세요!';
  }

  // 무대 바닥 높이 초기화
  const baseStageY = STAGE_HEIGHT + 0.02;
  for (const plat of [zoneO, zoneX, lane1, lane2, lane3, lane4]) {
    plat.targetY = baseStageY;
  }

  // 무대 바닥 레이아웃 전환 (OX vs 2×2 객관식 vs 단일 주관식)
  oxFloorGroup.visible = false;
  multiFloorGroup.visible = false;
  shortFloorGroup.visible = false;
  for(const [zone,normal,minority] of [[zoneO,'O','왼쪽'],[zoneX,'X','오른쪽']]){
    const symbol=q?.type==='MINORITY'?minority:normal;
    const map=PixelSprites.createFloorSymbolTexture(symbol,'rgba(255,255,255,0.88)',THREE);
    if(zone.symbolMesh.material.map!==map){zone.symbolMesh.material.map=map;zone.symbolMesh.material.needsUpdate=true;}
  }

  if (q && q.type === 'MULTIPLE' && q.inputMode === 'MOVE') {
    multiFloorGroup.visible = true;
  } else if (q && (q.type === 'SHORT' || q.type === 'MULTIPLE')) {
    shortFloorGroup.visible = true;
  } else {
    oxFloorGroup.visible = true;
  }

  // 패자부활전 표시 처리 (명세: '패자부활전 · 유령 참가 / 생존자 관전' 별도 표시)
  if (q && q.isRevival) {
    board.classList.add('revival-mode');
    revivalRoleBadge.classList.remove('hidden');
  } else {
    board.classList.remove('revival-mode');
    revivalRoleBadge.classList.add('hidden');
  }

  const submittedPreview = document.getElementById('my-submitted-preview');
  if (submittedPreview && phaseChanged) submittedPreview.classList.add('hidden');

  if (stateMsg.state === 'WAITING') {
    winnerModal.classList.add('hidden');
    stepInfo.textContent = `ROUND 00 / ${String(stateMsg.totalQuestions).padStart(2, '0')}`;
    typeSub.textContent = '대기실 · 자유 이동';
    mainText.textContent = '오늘의 퀴즈왕은 누구?';
  } else if (stateMsg.state === 'COUNTDOWN') {
    winnerModal.classList.add('hidden');
    stepInfo.textContent = 'READY';
    typeSub.textContent = '잠시 후 시작';
    mainText.textContent = stateMsg.lastNotice;
    if (phaseChanged) playTone(523.25, 0.12);
  } else if(stateMsg.state==='BREAK'){
    stepInfo.textContent='BREAK';typeSub.textContent='쉬는 시간 · 다음 문제 준비';
    mainText.textContent='잠깐 쉬어요! 자유롭게 채팅해 주세요.';
  } else if (stateMsg.state === 'PREPARING' && q) {
    stepInfo.textContent = 'GET READY'; typeSub.textContent = q.isRevival ? '패자부활전 · 역할 교대' : '무대 준비 중';
    mainText.textContent = '모두 제자리로, 곧 시작해요!';
  } else if (stateMsg.state === 'QUESTION' && q) {
    winnerModal.classList.add('hidden');
    const rNum = String(q.index + 1).padStart(2, '0');
    const rTot = String(q.total).padStart(2, '0');
    stepInfo.textContent = `ROUND ${rNum} / ${rTot}`;

    const modeLabel =
      q.type === 'MINORITY' ? '소수결 · 구역 이동' :
      q.type === 'OX' ? 'OX · 구역 이동' :
      q.type === 'MULTIPLE' ? (q.inputMode === 'MOVE' ? '객관식 · 구역 이동' : '객관식 · 버튼 선택') : '주관식 · 답안 입력';
    typeSub.textContent = q.isRevival ? `🌟 패자부활전 · ${modeLabel}` : modeLabel;
    mainText.textContent = q.question;
    if (phaseChanged) playTone(659.25, 0.15);

    if (q.type === 'MULTIPLE') {
      if (phaseChanged) highlightSelectedMultiBtn('');
      for (let i = 0; i < 4; i++) {
        const cText = q.choices[i] || `${i + 1}번`;
        document.getElementById(`top-c-${i + 1}`).textContent = cText;
        document.getElementById(`panel-c-${i + 1}`).textContent = cText;
      }
    } else if (q.type === 'SHORT') {
      const input = document.getElementById('short-answer-input');
      if (phaseChanged) input.value = '';
    }
  } else if (stateMsg.state === 'JUDGE' && q) {
    const rNum = String(q.index + 1).padStart(2, '0');
    const rTot = String(q.total).padStart(2, '0');
    stepInfo.textContent = `ROUND ${rNum} / ${rTot}`;
    typeSub.textContent=q.type==='MINORITY'?'승리 구역 확정!':'정답 확정!';
    if(q.type==='MINORITY'&&stateMsg.minorityOutcome){
      const result=stateMsg.minorityOutcome;
      mainText.textContent=`${result.winningZone==='LEFT'?'왼쪽':'오른쪽'} 승리! · 왼쪽 ${result.leftCount}명 / 오른쪽 ${result.rightCount}명${result.tie?' · 동수 무작위 결정':''}${stateMsg.zeroWipeoutSaved?' · 전원 탈락으로 직전 생존자 기준 추첨':''}`;
    }else mainText.textContent=`정답은 [ ${stateMsg.revealAnswer || q.answer} ] 입니다!`;

    if (phaseChanged && stateMsg.statusHighlight === 'REVIVED') {
      triggerPillBump('pill-alive');
      playTone(783.99, 0.22, 'triangle');
    } else if (phaseChanged && stateMsg.statusHighlight === 'ELIMINATED') {
      triggerPillBump('pill-alive');
      triggerPillBump('pill-ghost');
      playTone(329.63, 0.22, 'sawtooth');
    }

    if (!stateMsg.zeroWipeoutSaved) {
      const ans = String(stateMsg.revealAnswer || q.answer).toUpperCase();
      if (q.type === 'OX') {
        if (ans === 'O') zoneX.targetY = baseStageY;
        else if (ans === 'X') zoneO.targetY = baseStageY;
      } else if (q.type === 'MULTIPLE') {
        if (ans !== '1') lane1.targetY = baseStageY;
        if (ans !== '2') lane2.targetY = baseStageY;
        if (ans !== '3') lane3.targetY = baseStageY;
        if (ans !== '4') lane4.targetY = baseStageY;
      }
    }
  } else if (stateMsg.state === 'LOTTERY') {
    stepInfo.textContent = 'FINAL DRAW';
    typeSub.textContent = '목표 초과 추첨';
    mainText.textContent = stateMsg.lastNotice;
  } else if (stateMsg.state === 'ENDED') {
    stepInfo.textContent = 'FINISHED';
    typeSub.textContent = '최종 결과';
    mainText.textContent = stateMsg.lastNotice;
    if (currentRoomId===stateMsg.roomId && winnerNoticeGate.consume(stateMsg)) {
      showWinnerModal(stateMsg);
      playTone(880, 0.3, 'triangle');
    }
  }

  const answering = stateMsg.state === 'QUESTION';
  document.body.classList.toggle('break-mode',stateMsg.state==='BREAK');
  const mine = playerEntities.get(myClientId);
  const eligible = mine ? (q?.isRevival ? !mine.alive : mine.alive) : false;
  const privateMode = q && (q.type === 'SHORT' || (q.type === 'MULTIPLE' && q.inputMode !== 'MOVE'));
  topChoicesBar.classList.toggle('hidden', !(answering && q?.type === 'MULTIPLE' && q.inputMode === 'MOVE'));
  shortPanel.classList.toggle('hidden', !(answering && eligible && q?.type === 'SHORT'));
  multiPanel.classList.toggle('hidden', !(answering && eligible && q?.type === 'MULTIPLE' && q.inputMode !== 'MOVE'));
  document.body.classList.toggle('answer-mode', !!(answering && privateMode && eligible));
  document.body.classList.toggle('multiple-mode', !!(answering && q?.type === 'MULTIPLE' && q.inputMode !== 'MOVE' && eligible));
  document.body.classList.toggle('move-answer-mode',!!(answering&&q?.type==='MULTIPLE'&&q.inputMode==='MOVE'));
  document.querySelectorAll('#short-answer-panel input, #short-answer-panel button, .multi-pick-btn').forEach(el => el.disabled = !answering || !eligible);
  if (phaseChanged) myMoveTarget = null;
  updateQuestionReadability();
  requestAnimationFrame(updateCameraForScreen);
  for (const ent of playerEntities.values()) {
    ent.lastBadgeKey = '';
    updatePlayerOverheadIfNeeded(ent);
  }
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('q-timer');
  if (!roomState || roomState.state === 'WAITING' || roomState.state === 'ENDED') {
    timerEl.textContent = '⏱ 대기';
    timerEl.classList.remove('urgent');
    return;
  }

  const estimatedServerNow = Date.now() - serverTimeOffset;
  const remainMs = Math.max(0, (roomState.stateEndTime || 0) - estimatedServerNow);
  const sec = Math.ceil(remainMs / 1000);
  timerEl.textContent = `⏱ ${sec}초`;

  if (remainMs <= 4000 && roomState.state === 'QUESTION') {
    timerEl.classList.add('urgent');
  } else {
    timerEl.classList.remove('urgent');
  }
}

function highlightSelectedMultiBtn(zoneId) {
  for (let i = 1; i <= 4; i++) {
    const btn = document.getElementById(`pick-btn-${i}`);
    if (btn) {
      btn.classList.toggle('active-pick', String(i) === String(zoneId));
    }
  }
}

// ==================== 6. 인게임 조작 액션 함수 ====================
window.moveToLane = function (laneNum) {
  if (!canAnswer()) return;
  const q = roomState.currentQuestion;
  if (q.type === 'MULTIPLE' && q.inputMode !== 'MOVE') {
    ws.send(JSON.stringify({type: 'SUBMIT_MULTIPLE', answer: String(laneNum)}));
  } else {
    myMoveTarget = { x: [1, 3].includes(laneNum) ? -5 : 5, z: laneNum <= 2 ? -3 : 3 };
  }
};

function canAnswer() {
  const mine = playerEntities.get(myClientId);
  return !!(currentRoomId && roomState?.state === 'QUESTION' && mine?.onStage && Date.now() - serverTimeOffset < roomState.stateEndTime);
}
function canMove() {
  if (!currentRoomId || isInputFocused()) return false;
  if (['WAITING','BREAK'].includes(roomState?.state)) return true;
  if (roomState?.state !== 'QUESTION' || Date.now() - serverTimeOffset >= roomState.stateEndTime) return false;
  const q = roomState.currentQuestion, mine = playerEntities.get(myClientId);
  return !!mine && (!mine.onStage || q.type === 'OX' || q.type==='MINORITY' || q.type === 'MULTIPLE' && q.inputMode === 'MOVE');
}

window.submitShortAnswer = function () {
  const input = document.getElementById('short-answer-input');
  const val = input.value.trim();
  if (!val || !ws || !canAnswer()) return;
  ws.send(JSON.stringify({ type: 'SUBMIT_SHORT', answer: val }));
  input.blur();

  const preview = document.getElementById('my-submitted-preview');
  if (preview) {
    preview.textContent = `제출한 답안: ${val}`;
    preview.classList.remove('hidden');
  }
  playTone(698.46, 0.1);
};

function isSceneInputFocused(){return ['chat-input','short-answer-input'].includes(document.activeElement?.id);}
function freezeSceneForInput(){
  if(chatSceneLayout)return;
  const view=container.getBoundingClientRect();chatSceneLayout={windowWidth:window.innerWidth};
  Object.assign(container.style,{top:view.top+'px',bottom:'auto',right:'auto',width:view.width+'px',height:view.height+'px'});
}
function releaseChatScene(){
  chatSceneLayout=null;
  for(const property of ['top','bottom','right','width','height'])container.style.removeProperty(property);
}
function closeChatPopup(){
  document.getElementById('chat-popup').classList.add('hidden');
  releaseChatScene();
  requestAnimationFrame(updateCameraForScreen);
}
window.toggleChatPopup = function () {
  const popup = document.getElementById('chat-popup');
  if (!popup) return;
  if(!popup.classList.contains('hidden')){closeChatPopup();return;}
  freezeSceneForInput();
  popup.classList.remove('hidden');
  setTimeout(() => {if(!popup.classList.contains('hidden'))document.getElementById('chat-input').focus();},30);
};

window.sendChatMessage = function () {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !ws) return;
  ws.send(JSON.stringify({ type: 'CHAT', text }));
  input.value = '';
  input.blur();
  closeChatPopup();
};

window.toggleSoundMute = function () {
  isMuted = !isMuted;
  const btn = document.getElementById('btn-sound-toggle');
  if (btn) btn.textContent = isMuted ? '🔇' : '🔊';
};

window.startGame = function () {
  if (ws) ws.send(JSON.stringify({ type: 'START_GAME' }));
};

window.resetGame = function () {
  document.getElementById('winner-modal').classList.add('hidden');
  if (ws) ws.send(JSON.stringify({ type: 'RESET_GAME' }));
};

function returnToLobby(){
 resetJoystick();
 closeChatPopup();
 currentRoomId=null;roomState=null;renderedPhaseKey=null;myMoveTarget=null;
 document.body.classList.remove('answer-mode','multiple-mode','move-answer-mode','break-mode');
 document.getElementById('game-hud').classList.add('hidden');
 document.getElementById('winner-modal').classList.add('hidden');
 document.getElementById('lobby-overlay').classList.remove('hidden');
 document.getElementById('rules-dialog').close();
 handleWorldTick([]);
}
window.leaveRoom=function(){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'LEAVE_ROOM'}));returnToLobby();};

function showWinnerModal(stateMsg) {
  const modal = document.getElementById('winner-modal');
  const desc = document.getElementById('winner-modal-desc');
  const listEl = document.getElementById('winner-list');
  const extraEl = document.getElementById('survivor-extra-info');

  desc.textContent = stateMsg.lastNotice;
  listEl.innerHTML = '';

  const winners = stateMsg.winners || [];
  if (winners.length === 0) {
    listEl.innerHTML = `<div style="color:#64748b; font-weight:800;">이번 게임에는 당첨자가 없습니다.</div>`;
  } else {
    for (const w of winners) {
      const badge = document.createElement('div');
      badge.className = 'winner-badge';
      badge.dataset.winnerId=w.id;
      badge.textContent = `🏆 ${w.name}`;
      listEl.appendChild(badge);
    }
  }

  const allSurvivors = stateMsg.allFinalSurvivors || [];
  if (allSurvivors.length > winners.length) {
    extraEl.textContent = `추첨 대상 ${allSurvivors.length}명 중 당첨 목표 ${stateMsg.targetWinners}명이 추첨되었습니다.`;
  } else if (winners.length > 0) {
    extraEl.textContent = `남은 생존자 ${winners.length}명 전원이 당첨되었습니다!`;
  } else {
    extraEl.textContent = '';
  }

  modal.classList.remove('hidden');
}

window.closeWinnerModal = function () {
  document.getElementById('winner-modal').classList.add('hidden');
};

// ==================== 7. 로비 & 퀴즈 시나리오 빌더 ====================
window.switchLobbyTab = function (tab) {
  const isList = tab === 'list';
  document.getElementById('tab-btn-list').classList.toggle('active', isList);
  document.getElementById('tab-btn-create').classList.toggle('active', !isList);
  document.getElementById('tab-content-list').classList.toggle('hidden', !isList);
  document.getElementById('tab-content-create').classList.toggle('hidden', isList);
};

window.requestRoomList = function () {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'GET_ROOMS' }));
  }
};

function renderRoomList(rooms) {
  const grid = document.getElementById('room-list-grid');
  grid.innerHTML = '';

  if (rooms.length === 0) {
    grid.innerHTML = `<p style="color:#64748b;">현재 생성된 방이 없습니다. 상단 [방 만들기] 탭에서 새 방을 만들어보세요!</p>`;
    return;
  }

  for (const r of rooms) {
    const card = document.createElement('div');
    card.className = 'room-item';

    const stateLabel =
      r.state === 'WAITING' ? '🟢 대기중' :
      r.state === 'ENDED' ? '🏁 종료됨' : '🔥 진행중 (관전 입장)';

    card.innerHTML = `
      <div class="room-item-title">${escapeHtml(r.title)}</div>
      <div class="room-meta">
        <span class="meta-pill">${stateLabel}</span>
        <span class="meta-pill">👥 참가자 ${r.playerCount}명</span>
        <span class="meta-pill">📋 ${r.questionCount}라운드</span>
        <span class="meta-pill">🏆 당첨 목표 ${r.targetWinners}명</span>
      </div>
      <div class="room-card-actions"><button class="btn btn-primary" onclick="joinRoom('${r.id}')">입장하기 →</button></div>
    `;
    grid.appendChild(card);
  }
}

function generateNickname() {
  return `리마인${String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000).padStart(3, '0')}`;
}

function getPlayerNickname() {
  const input = document.getElementById('nickname-input');
  input.value = input.value.trim() || generateNickname();
  try { localStorage.setItem(NICKNAME_STORAGE_KEY, input.value); } catch {}
  return input.value;
}

function initNickname() {
  const input = document.getElementById('nickname-input');
  let saved = '';
  try { saved = localStorage.getItem(NICKNAME_STORAGE_KEY) || ''; } catch {}
  // A nickname from this browser's old draft can migrate; a shared recovery
  // draft must never supply another visitor's nickname.
  input.value = saved.trim() || input.value.trim() || generateNickname();
  getPlayerNickname();
  input.addEventListener('input', () => {
    try { localStorage.setItem(NICKNAME_STORAGE_KEY, input.value.trim()); } catch {}
  });
}

window.joinRoom = function (roomId) {
  const nickname = getPlayerNickname();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomId, nickname,avatarId:AvatarPicker.selected() }));
  }
};

window.submitCreateRoom=function(){
 if(!validateQuizDraft()||!requireLibrary()||pendingQuizSaves.size||creatingRoomRequestId)return;
 saveQuizDraft();
 creatingRoomRequestId='create_'+(++saveSequence);updateSaveButtons();
 ws.send(JSON.stringify({type:'CREATE_ROOM',requestId:creatingRoomRequestId,...currentQuizPayload(),nickname:getPlayerNickname(),avatarId:AvatarPicker.selected()}));
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.getElementById('short-answer-input').addEventListener('input', () => {
  const field=document.getElementById('short-answer-input');field.value=Array.from(field.value).slice(0,QuizLimits.ANSWER).join('');
  if (!canAnswer()) return;
  ws.send(JSON.stringify({type: 'ANSWER_EDITING'}));
  document.getElementById('my-submitted-preview').textContent = '수정 중 · 다시 제출하면 답안이 변경돼요';
});



document.addEventListener('focusin', event => {
  if(['chat-input','short-answer-input'].includes(event.target.id))freezeSceneForInput();
  if (event.target.matches('input,textarea,select')) {
    resetJoystick();
    myMoveTarget = null;
    Object.keys(keysPressed).forEach(key => keysPressed[key] = false);
  }
});
document.addEventListener('focusout',()=>requestAnimationFrame(()=>{
  if(!isSceneInputFocused()&&document.getElementById('chat-popup').classList.contains('hidden')){releaseChatScene();updateCameraForScreen();}
}));
window.addEventListener('blur', () => {resetJoystick();myMoveTarget=null;Object.keys(keysPressed).forEach(key=>keysPressed[key]=false);});

window.focusMyCharacter = function () {
  findMeUntil = performance.now()+3500;
  const mine=playerEntities.get(myClientId);
  if(cameraFollow.enabled&&mine)cameraFollow.targetX=THREE.MathUtils.clamp(mine.x*layoutScaleX,-cameraFollow.maxX,cameraFollow.maxX);
};

let previousQuestionText = '';
function updateQuestionReadability() {
  const text = document.getElementById('q-main-text');
  const board = document.getElementById('question-board');
  const value = text.textContent.trim();
  board.classList.toggle('long-question', value.length > 42 || value.includes('\n'));
  if (value !== previousQuestionText) { text.scrollTop = 0; previousQuestionText = value; }
  requestAnimationFrame(updateQuestionScrollHint);
}
function updateQuestionScrollHint() {
  const text = document.getElementById('q-main-text'), hint = document.getElementById('question-scroll-hint');
  const overflow = text.scrollHeight > text.clientHeight + 2;
  hint.classList.toggle('hidden', !overflow);
  hint.textContent = text.scrollTop + text.clientHeight < text.scrollHeight - 4 ? '↕ 스크롤해서 문제 전체 보기' : '✓ 문제 끝까지 읽었어요';
}
document.getElementById('q-main-text').addEventListener('scroll', updateQuestionScrollHint);
new ResizeObserver(updateQuestionScrollHint).observe(document.getElementById('q-main-text'));
