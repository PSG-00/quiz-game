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
let raceOwn=null,raceActive=false,raceScene=null;
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
let spectatorTargetId=null,spectatorOptionsKey='',wasSpectator=false;

// 방 만들기 퀴즈 빌더 목록
let builderQuestions = [];

// 플레이어 렌더링 엔티티 맵
const playerEntities = new Map();
const worldUpdates = WorldUpdates.create();
const roomStateSync=RoomStateSync.create();

// 내 캐릭터 로컬 위치
let myPos = { x: -6, z: 0 };
let myMoveTarget = null;
let lastSentPosTime = 0;
let lastSentPosKey = '';

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
let lowSpecMode=false;
try{lowSpecMode=localStorage.getItem('ox-low-spec-v1')==='1';}catch{}
if(new URLSearchParams(location.search).get('test')==='plana')lowSpecMode=false;
// Shared batches are allocated once on PC and mobile. Detail restoration is
// spread across frames, keeping the local player's model independent.
MobileCrowd.attach(scene);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
InstancedAvatars.attach(scene,renderer);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(RenderBudget.pixelRatio(innerWidth,innerHeight,devicePixelRatio));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false;
container.appendChild(renderer.domElement);
const clarityQuery=new URLSearchParams(location.search).get('clarity');
const fxaaRequested=new URLSearchParams(location.search).get('aa')==='fxaa';
const fxaaAllowed=fxaaRequested&&!(matchMedia('(pointer:coarse)').matches||(navigator.maxTouchPoints>0&&Math.min(innerWidth,innerHeight)<850));
const clarityExperiment=['compare','off','sharpen','upscale'].includes(clarityQuery)||fxaaAllowed;
const sceneClarity=SceneClarity.create(renderer,fxaaAllowed?'fxaa':clarityQuery==='compare'?'sharpen':clarityQuery);
function updateClarityButton(){
  const state=sceneClarity.stats(),button=document.getElementById('clarity-toggle');
  button.hidden=!clarityExperiment;
  button.textContent=state.failed?'화질: 기본 (자동복귀)':state.supported?`화질: ${{off:'기본',sharpen:'선명',upscale:'균형',fxaa:'FXAA'}[state.mode]}`:'화질: 기본 (미지원)';
  button.title=state.mode==='fxaa'?'외곽 계단 현상 보정 (PC)':state.mode==='upscale'?'내부 해상도 85% + 확대·선명화':state.mode==='sharpen'?'기존 해상도 + 대비 적응 선명화':'기존 직접 렌더링';
  button.disabled=!state.supported||state.failed;
}
sceneClarity.onFallback=updateClarityButton;
window.cycleClarity=function(){
  const modes=fxaaAllowed?['off','fxaa']:['off','sharpen','upscale'],next=modes[(modes.indexOf(sceneClarity.stats().mode)+1)%modes.length];
  sceneClarity.setMode(next);updateClarityButton();document.getElementById('clarity-toggle').blur();
};
updateClarityButton();
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
dirLight.castShadow = false;
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
const hostBackdrop=ShowHost.createBackdrop();
podiumGroup.add(hostBackdrop);

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

const hostSprite = ShowHost.create();
hostSprite.position.set(0,.6,-.3);
hostSprite.scale.setScalar(1.25);
podiumGroup.add(hostSprite);
const crownTex = window.PixelSprites.createFloorSymbolTexture('♛', '#c9984c', THREE);
const crown = new THREE.Sprite(new THREE.SpriteMaterial({map: crownTex, transparent: true}));
crown.position.set(0,1.3,1.18);crown.scale.set(.9,.9,1);podiumGroup.add(crown);
const hostSpeechBubble=document.getElementById('host-speech-bubble');
const hostSpeechAnchor=new THREE.Vector3();
const hostSpeechSize={width:0,height:0};
new ResizeObserver(()=>{
  hostSpeechSize.width=hostSpeechBubble.offsetWidth;
  hostSpeechSize.height=hostSpeechBubble.offsetHeight;
}).observe(hostSpeechBubble);

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
    if(raceActive&&onStage){
      const dest=pt.z<=RaceRules.FRONT_Z?{x:Math.max(-8.8,Math.min(8.8,pt.x)),z:Math.max(RaceRules.MIN_Z+.2,Math.min(RaceRules.FRONT_Z-.2,pt.z))}:{x:Math.max(-1.4,Math.min(1.4,pt.x)),z:Math.max(RaceRules.FRONT_Z-.2,Math.min(6,pt.z))};
      myMoveTarget=(myPos.z>RaceRules.FRONT_Z&&Math.abs(dest.x)>1.65||Math.abs(myPos.x)>1.65&&dest.z>RaceRules.FRONT_Z)?{x:0,z:RaceRules.JUNCTION_Z,after:dest}:dest;return;
    }
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
function syncRaceScene(){
 const enabled=roomState?.currentQuestion?.type==='RACE'&&['PREPARING','QUESTION','JUDGE'].includes(roomState.state);
 if(enabled&&!raceScene)raceScene=RaceScene.create(scene,STAGE_HEIGHT);
 if(enabled!==raceActive){raceActive=enabled;cameraFrame=null;cameraFollow.initialized=false;raceScene?.reset();if(!enabled)raceOwn=null;}
 if(raceScene)raceScene.root.visible=enabled;
 worldGroup.visible=!enabled;spectatorStrip.visible=!enabled;
 for(const zone of [zoneO,zoneX,lane1,lane2,lane3,lane4])zone.symbolMesh.visible=!enabled&&zone.group.parent.visible;
 document.body.classList.toggle('race-mode',enabled);
 document.getElementById('race-feedback').hidden=!enabled;
}
function renderRaceInfo(){
 if(!raceActive)return;const q=roomState.currentQuestion,own=raceOwn?.roundId===roomState.roundId?raceOwn:null;
 document.getElementById('q-type-sub').textContent=`OX 레이스 · ${own?.progress||0}/${q.raceTotal}`;
 document.getElementById('q-main-text').textContent=roomState.state==='JUDGE'?`레이스 종료! ${own?.qualifiedCount??own?.finishedCount??0}명 통과 · 완주 ${own?.finishedCount||0}명`:roomState.state==='PREPARING'?'왼쪽 O · 오른쪽 X — 곧 출발해요!':own?.rank?`${own.rank}등 완주!`:(own?.participant?own.question:'레이스 참가자를 기다리는 중…');
 document.getElementById('race-feedback').textContent=`선착순 ${own?.finishedCount||0}/${q.raceQuota}명 · ${own?.notice||'T자 길을 따라가세요 · 오답은 재도전'}`;
}
function receiveRaceState(msg){
 if(msg.roomId!==currentRoomId||msg.gameId!==roomState?.gameId||msg.roundId!==roomState?.roundId||roomState?.currentQuestion?.type!=='RACE')return;
 if(raceOwn?.roundId===msg.roundId&&msg.seq<raceOwn.seq)return;
 const reset=!raceOwn||raceOwn.roundId!==msg.roundId||msg.seq>raceOwn.seq;raceOwn=msg;
 if(reset&&msg.participant){myPos={x:msg.x,z:msg.z};myMoveTarget=null;lastSentPosKey='';const entity=playerEntities.get(myClientId);if(entity){entity.x=entity.targetX=msg.x;entity.z=entity.targetZ=msg.z;entity.motion.teleporting=true;}raceScene?.reset();}
 renderRaceInfo();updateQuestionReadability();
}
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
  if(raceActive){const self=playerEntities.get(myClientId),target=self?.eligible===false?playerEntities.get(spectatorTargetId):self;raceScene.camera(camera,target,dt);return;}
  if(!cameraFollow.enabled){cameraFollow.x=0;cameraFollow.targetX=0;camera.position.x=0;camera.updateMatrixWorld(true);return;}
  const self=currentRoomId?playerEntities.get(myClientId):null;
  const mine=self?.eligible===false?playerEntities.get(spectatorTargetId):self;
  if(mine&&currentRoomId){
    const worldX=mine.x*layoutScaleX;
    if(!cameraFollow.initialized){cameraFollow.x=cameraFollow.targetX=worldX;cameraFollow.initialized=true;}
    const z=mine.onStage?mine.z*layoutScaleZ:spectatorToScene(mine.x,mine.z).z;
    const depth=-new THREE.Vector3(worldX,mine.y+1.5,z).applyMatrix4(camera.matrixWorldInverse).z;
    const deadZone=Math.max(.3,depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*.16);
    if(worldX>cameraFollow.targetX+deadZone)cameraFollow.targetX=worldX-deadZone;
    else if(worldX<cameraFollow.targetX-deadZone)cameraFollow.targetX=worldX+deadZone;
  }else cameraFollow.targetX=0;
  cameraFollow.targetX=THREE.MathUtils.clamp(cameraFollow.targetX,-cameraFollow.maxX,cameraFollow.maxX);
  cameraFollow.x=THREE.MathUtils.clamp(cameraFollow.x,-cameraFollow.maxX,cameraFollow.maxX);
  if(!restore)cameraFollow.x+=(cameraFollow.targetX-cameraFollow.x)*(1-Math.exp(-7*dt));
  camera.position.x=cameraFollow.x;camera.updateMatrixWorld(true);
}
let cameraFrame=null;
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
  if(raceActive){layoutScaleX=layoutScaleZ=1;camera.aspect=w/h;camera.updateProjectionMatrix();}
  const frameKey=`${innerWidth}:${innerHeight}:${currentRoomId||'lobby'}`;
  if(raceActive){cameraFrame=null;updateFollowCamera(0);}else if(!cameraFrame||cameraFrame.key!==frameKey){
    fitStageCamera(w,h);cameraFrame={key:frameKey,width:w,height:h,offsetY:camera.view?.offsetY||0};
  }else{
    // Crop the header from the same camera field; changing question height must
    // not zoom/pan the entire board or make everyone appear to respawn.
    camera.setViewOffset(cameraFrame.width,cameraFrame.height,0,cameraFrame.offsetY+cameraFrame.height-h,w,h);
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  }
  worldGroup.scale.set(layoutScaleX,1,layoutScaleZ);
  podiumGroup.position.set(0,STAGE_HEIGHT,STAGE_MIN_Z*layoutScaleZ-1.9);
  ShowHost.layoutBackdrop(hostBackdrop,window.matchMedia('(pointer:coarse)').matches||innerWidth<=680);
  // Always frame the outside spectator walkway, even before anyone is eliminated.
  spectatorStrip.scale.x=layoutScaleX;
  spectatorStrip.visible=!raceActive;
  spectatorStrip.position.set(0,.02,spectatorSceneStart()+.42);
  worldGroup.updateMatrixWorld(true);
  const focal=h/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)));
  for(const zone of [zoneO,zoneX,lane1,lane2,lane3,lane4]){
    const mark=zone.symbolMesh;if(!mark)continue;
    const position=zone.group.getWorldPosition(new THREE.Vector3());
    mark.position.set(position.x,STAGE_HEIGHT+.09,position.z);mark.visible=!raceActive&&zone.group.parent.visible;
    const distance=-mark.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
    const isOX=zone===zoneO||zone===zoneX;
    const desiredPixels=Math.min(isOX?(portrait?85:120):(portrait?64:90),w*.24,h*.24);
    const fit=Math.min(.9,desiredPixels/(mark.geometry.parameters.width*focal/distance));
    mark.scale.set(fit,fit/Math.sin(CAMERA_ELEVATION),1);
  }
  // setSize clears the drawing buffer even when its dimensions did not change.
  const renderSize=renderer.getSize(new THREE.Vector2());
  const ratio=RenderBudget.pixelRatio(w,h,devicePixelRatio);
  if(renderSize.x!==w||renderSize.y!==h||Math.abs(renderer.getPixelRatio()-ratio)>.001){renderer.setPixelRatio(ratio);renderer.setSize(w,h);sceneClarity.render(scene,camera);}
  if(isSceneInputFocused()&&!chatSceneLayout)freezeSceneForInput();
}
window.addEventListener('resize', updateCameraForScreen);
const layoutObserver = new ResizeObserver(updateCameraForScreen);
[container, document.querySelector('.top-hud-stack'), document.querySelector('.bottom-controls-row')].forEach(el => layoutObserver.observe(el));
// Fixed controls must track the visible viewport, not the covered layout viewport.
let inputViewportFrame=null,inputViewportUntil=0,inputViewportKey='';
function scheduleInputViewport(trackKeyboard=false){
  if(trackKeyboard)inputViewportUntil=performance.now()+900;
  if(inputViewportFrame===null)inputViewportFrame=requestAnimationFrame(syncInputViewport);
}
function syncInputViewport(now){
  inputViewportFrame=null;
  const viewport=window.visualViewport;
  const height=viewport?.height||window.innerHeight;
  const focused=isSceneInputFocused();
  const inset=focused&&(!viewport||Math.abs(viewport.scale-1)<.05)?Math.max(0,window.innerHeight-height-(viewport?.offsetTop||0)):0;
  const keyboardOpen=focused&&inset>100;
  const key=`${height}:${inset}:${keyboardOpen}`;
  if(key!==inputViewportKey){
    inputViewportKey=key;
    document.documentElement.style.setProperty('--app-height',height+'px');
    document.documentElement.style.setProperty('--keyboard-inset',inset+'px');
    document.body.classList.toggle('keyboard-open',keyboardOpen);
    updateCameraForScreen();
  }
  if(focused&&now<inputViewportUntil)inputViewportFrame=requestAnimationFrame(syncInputViewport);
}
if(window.visualViewport)for(const type of ['resize','scroll'])window.visualViewport.addEventListener(type,()=>scheduleInputViewport());
window.addEventListener('resize',()=>scheduleInputViewport());
scheduleInputViewport();
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
CrowdDecorations.attach(scene);

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
  const shadowMesh = new THREE.Group();
  shadowMesh.visible=false;
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
  const avatarSeed=p.s;
  const lowDetail=!isMe&&lowSpecMode;
  const charSprite = p.el===0?AvatarActors.pending(avatarId):lowDetail?MobileCrowd.create(avatarId,avatarSeed):isMe?AvatarActors.create(avatarSeed,avatarId):AvatarActors.pending(avatarId);
  group.add(charSprite);
  const avatarScale = onStage ? 1 : .75;
  charSprite.scale.setScalar(avatarScale);
  shadowMesh.scale.setScalar(avatarScale);

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
  if(!isMe)overheadMat.visible=false;
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
    avatarScale,
    detailedAvatar:lowDetail?null:charSprite,
    simpleAvatar:lowDetail?charSprite:null,
    avatarId,
    lowDetail,
    lastPose:0,
    labelHeight:0,
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
    eligible:p.el!==0,
    connected:p.c!==0,
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
  if(entity.connected===false)return {text:'재접속 대기',theme:'GHOST'};
  if(entity.eligible===false)return {text:'관전',theme:'GHOST'};

  if (state === 'JUDGE' && entity.lastResult === 'REVIVED') {
    return { text: '✨ 부활!', theme: 'REVIVED' };
  }

  // 무대 아래 관전 구역에 있는 경우 (일반 라운드의 유령 또는 패자부활전의 생존자)
  if (!entity.onStage) {
    return { text: entity.alive?'생존 · 대기':'유령', theme: 'GHOST' };
  }
  if(state==='BREAK')return {text:'휴식',theme:'MINORITY'};
 if(q?.type==='RACE')return {text:state==='JUDGE'?(entity.lastResult==='PASS'?'통과':entity.lastResult==='REVIVED'?'부활':'탈락'):entity.raceRank?`${entity.raceRank}등 완주`:`${entity.raceProgress||0}/${q.raceTotal} 완료`,theme:'MINORITY'};
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

const overheadBadgeCache=new Map();
function updatePlayerOverheadIfNeeded(entity) {
  const isMe = entity.id === myClientId;
  const badge = computeOverheadBadge(entity);
  const key = `${badge.text}|${badge.theme}|${isMe}`;

  if (entity.lastBadgeKey !== key) {
    entity.lastBadgeKey = key;
    let texture=overheadBadgeCache.get(key);
    if(!texture){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;PixelSprites.drawOverheadCanvas(canvas,badge.text,badge.theme,isMe,false);texture=new THREE.CanvasTexture(canvas);texture.userData={sharedBadge:true};overheadBadgeCache.set(key,texture);}
    if(!entity.overheadTex.userData?.sharedBadge)entity.overheadTex.dispose();
    entity.overheadTex=texture;entity.overheadSprite.material.map=texture;
  }
}

// Cache DOM measurements independently of the per-frame screen position.
function measurePlayerChat(entity,width,height,badgeWidth,anchorX,badgeTop){
  const key=JSON.stringify([entity.chatBubbleText,entity.name,width,height]);
  const bubble=entity.chatBubble;
  if(entity.chatLayoutKey!==key){
    bubble.classList.remove('side-chat','chat-on-right','chat-on-left');
    bubble.style.maxWidth='';entity.chatText.style.maxHeight=Math.max(20,height-50)+'px';
    entity.chatNaturalSize={width:bubble.offsetWidth,height:bubble.offsetHeight};
    entity.chatLayoutKey=key;entity.chatPlacementKey='top';entity.chatSize=entity.chatNaturalSize;
  }
  const clearance=Math.max(entity.labelWidth/2,badgeWidth/2)+12;
  const rightSpace=width-anchorX-clearance-8,leftSpace=anchorX-clearance-8;
  const onRight=rightSpace>=leftSpace;
  const side=badgeTop-entity.chatNaturalSize.height-5<8&&Math.max(rightSpace,leftSpace)>=64;
  // Bucket the available width so movement does not trigger layout every frame.
  const maxWidth=Math.max(64,Math.floor(Math.min(250,onRight?rightSpace:leftSpace)/16)*16);
  const placementKey=side?`${onRight}:${maxWidth}`:'top';
  if(entity.chatPlacementKey!==placementKey){
    bubble.classList.toggle('side-chat',side);
    bubble.classList.toggle('chat-on-right',side&&onRight);
    bubble.classList.toggle('chat-on-left',side&&!onRight);
    bubble.style.maxWidth=side?maxWidth+'px':'';
    entity.chatSize=side?{width:bubble.offsetWidth,height:bubble.offsetHeight}:entity.chatNaturalSize;
    entity.chatPlacementKey=placementKey;
  }
  return {...entity.chatSize,side,onRight,clearance};
}

// ==================== 4. 디스플레이 주사율에 맞춘 최대 144 FPS 루프 ====================
const clock = new THREE.Clock();
const framePacing=FramePacing.create(144);
const fpsMeter=document.getElementById('fps-meter');
let fpsWindowStart=null,fpsFrames=0,fpsRoomId=null;
function recordRenderedFrame(now){
  if(fpsRoomId!==currentRoomId){fpsRoomId=currentRoomId;fpsWindowStart=null;fpsFrames=0;fpsMeter.textContent='FPS --';}
  if(!currentRoomId)return;
  if(fpsWindowStart===null){fpsWindowStart=now;return;}
  fpsFrames++;
  const elapsed=now-fpsWindowStart;
  if(elapsed>=1000){fpsMeter.textContent=`FPS ${Math.round(fpsFrames*1000/elapsed)}`;fpsFrames=0;fpsWindowStart=now;}
}
document.addEventListener('visibilitychange',()=>{fpsWindowStart=null;fpsFrames=0;fpsMeter.textContent='FPS --';});
const avatarFrustum=new THREE.Frustum(),avatarViewProjection=new THREE.Matrix4(),avatarSphere=new THREE.Sphere(new THREE.Vector3(),3);
function disposeEntityAvatar(entity){
  if(entity.detailedAvatar){entity.group.remove(entity.detailedAvatar);AvatarActors.dispose(entity.detailedAvatar);}
  if(entity.simpleAvatar){entity.group.remove(entity.simpleAvatar);MobileCrowd.dispose(entity.simpleAvatar);}
  entity.detailedAvatar=null;entity.simpleAvatar=null;
}
function setEntityDetail(entity,simple){
  if(entity.eligible===false)return;
  if(entity.id===myClientId)simple=false;
  if(simple){
    if(!entity.simpleAvatar){entity.simpleAvatar=MobileCrowd.create(entity.avatarId,entity.seed);entity.group.add(entity.simpleAvatar);}
    if(entity.detailedAvatar){if(entity.detailedAvatar.userData.instancedAvatar)InstancedAvatars.hide(entity.detailedAvatar);entity.detailedAvatar.visible=false;entity.group.remove(entity.detailedAvatar);}
    entity.group.add(entity.simpleAvatar);entity.simpleAvatar.visible=true;entity.charSprite=entity.simpleAvatar;
  }else{
    const model=AvatarActors.model(entity.avatarId);
    // Keep the existing loading/SD state until the requested GLB is ready.
    if(model&&!model.loaded){model.load();if(entity.simpleAvatar)return;}
    const cached=entity.detailedAvatar;
    if(cached&&!cached.userData.importedGLB&&(!model||model.loaded)){entity.group.remove(cached);AvatarActors.dispose(cached);entity.detailedAvatar=null;}
    if(!entity.detailedAvatar){entity.detailedAvatar=(entity.id!==myClientId?InstancedAvatars.create(entity.avatarId,entity.seed):null)||AvatarActors.create(entity.seed,entity.avatarId);entity.group.add(entity.detailedAvatar);}
    if(entity.simpleAvatar){MobileCrowd.hide(entity.simpleAvatar);entity.simpleAvatar.visible=false;entity.group.remove(entity.simpleAvatar);}
    entity.group.add(entity.detailedAvatar);entity.detailedAvatar.visible=true;entity.charSprite=entity.detailedAvatar;
  }
  entity.lowDetail=simple;entity.lastPose=0;entity.labelHeight=0;
}
function restoreAvatarDetails(){
  if(lowSpecMode)return;
  const deadline=performance.now()+3;let restored=0;
  for(const entity of playerEntities.values()){
    if(entity.id===myClientId||entity.eligible===false)continue;
    const model=AvatarActors.model(entity.avatarId);
    if(model&&!model.loaded)continue;
    const upgrade=!entity.lowDetail&&(entity.charSprite.userData.pendingModel||!entity.charSprite.userData.importedGLB&&model?.loaded);
    if(!entity.lowDetail&&!upgrade)continue;
    setEntityDetail(entity,false);
    if(++restored>=2||performance.now()>=deadline)break;
  }
}
function updateLowSpecButton(){
  const button=document.getElementById('btn-low-spec');
  button.textContent=lowSpecMode?'저사양 모드 ON':'저사양 모드';
  button.setAttribute('aria-pressed',String(lowSpecMode));
  button.title=lowSpecMode?'다른 참가자를 원래 아바타로 표시':'내 캐릭터를 제외한 참가자를 간단한 SD로 표시';
}
window.toggleLowSpecMode=function(){
  lowSpecMode=!lowSpecMode;
  try{localStorage.setItem('ox-low-spec-v1',lowSpecMode?'1':'0');}catch{}
  if(lowSpecMode)for(const entity of playerEntities.values())if(entity.id!==myClientId)setEntityDetail(entity,true);
  updateLowSpecButton();
};
updateLowSpecButton();

function animate(frameTime) {
  requestAnimationFrame(animate);
  const now = performance.now();
  if(document.hidden){framePacing.accept(frameTime,true);return;}
  // rAF follows the browser/display refresh rate; never force a 60 Hz mobile cap.
  if(!framePacing.accept(frameTime))return;
  const dt = Math.min(clock.getDelta(), 0.1);
  restoreAvatarDetails();
  const joystickEnabled=portraitScreen()&&canMove();
  joystickRoot.classList.toggle('hidden',!joystickEnabled);
  if(!joystickEnabled&&(joystick.pointerId!==null||joystick.x||joystick.z))resetJoystick();

  // 1) 내 캐릭터 이동 처리 (입력창 포커스 중에는 키보드 이동 중지)
  if (canMove()) {
    const myEntity = playerEntities.get(myClientId);
    const beforeMove={...myPos};
    const minZ = myEntity && !myEntity.onStage ? SPECTATOR_MIN_Z : raceActive?RaceRules.MIN_Z:STAGE_MIN_Z + .8;
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
        myMoveTarget = myMoveTarget.after||null;
      }
    }

    const movementHalfW = myEntity?.onStage ? ARENA_HALF_W - .8 : SPECTATOR_HALF_W;
    myPos.x = Math.max(-movementHalfW, Math.min(movementHalfW, myPos.x));
    myPos.z = Math.max(minZ, Math.min(maxZ, myPos.z));
    if(raceActive&&myEntity?.onStage)myPos=RaceRules.move(beforeMove,myPos);

    if (ws && ws.readyState === WebSocket.OPEN && now - lastSentPosTime > 55) {
      lastSentPosTime = now;
      // Match the server's coordinate precision; standing still needs no MOVE.
      const positionKey = `${myEntity?.onStage}:${myPos.x.toFixed(2)}:${myPos.z.toFixed(2)}`;
      if(positionKey !== lastSentPosKey){
        lastSentPosKey = positionKey;
        ws.send(JSON.stringify({ type: 'MOVE', x: myPos.x, z: myPos.z,...(raceActive?answerContext():{}) }));
      }
    }

    if (myEntity) {
      myEntity.targetX = myPos.x;
      myEntity.targetZ = myPos.z;
      const qType = (roomState && roomState.currentQuestion) ? roomState.currentQuestion.type : 'OX';
      if (myEntity.onStage) {
        if(qType==='MINORITY'){
          myEntity.zoneId=ArenaRules.zone('MINORITY',myPos.x,myPos.z);
        } else if (qType === 'OX') {
          myEntity.zoneId = ArenaRules.zone('OX',myPos.x,myPos.z);
        } else if (qType === 'MULTIPLE') {
          myEntity.zoneId = ArenaRules.zone('MULTIPLE',myPos.x,myPos.z);
          highlightSelectedMultiBtn(myEntity.zoneId);
        }
      }
    }
  }

  updateFollowCamera(dt);
  avatarViewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);avatarFrustum.setFromProjectionMatrix(avatarViewProjection);
  // 2) 모든 캐릭터 위치 보간 및 금빛 링 애니메이션
  const viewWidth = container.clientWidth, viewHeight = container.clientHeight;
  for (const entity of playerEntities.values()) {
    if(entity.eligible===false){
      entity.group.visible=false;entity.nameLabel.style.visibility='hidden';entity.chatBubble.classList.add('hidden');
      if(entity.lowDetail)MobileCrowd.hide(entity.charSprite);else if(entity.charSprite.userData.instancedAvatar)InstancedAvatars.hide(entity.charSprite);
      continue;
    }
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
    const targetScale = entity.onStage ? 1 : .75;
    entity.avatarScale += (targetScale-entity.avatarScale)*(1-Math.exp(-10*dt));
    if(Math.abs(targetScale-entity.avatarScale)<.001)entity.avatarScale=targetScale;
    entity.charSprite.scale.setScalar(entity.avatarScale);
    entity.shadowMesh.scale.setScalar(entity.avatarScale);
    entity.charSprite.rotation.y=entity.motion.heading;
    entity.group.position.set(viewPosition.x, entity.y, viewPosition.z);
    avatarSphere.center.copy(entity.group.position);avatarSphere.center.y+=1.5;
    // Conceal runners before the fork so their O/X choice cannot be followed.
    // Keep the local avatar (or the spectator's followed runner) visible.
    const raceViewId=playerEntities.get(myClientId)?.eligible===false?spectatorTargetId:myClientId;
    const raceConcealed=raceActive&&entity.onStage&&entity.id!==raceViewId&&Math.min(entity.z,entity.targetZ)<=RaceRules.FRONT_Z+.4;
    const inView=!raceConcealed&&(entity.id===myClientId||avatarFrustum.intersectsSphere(avatarSphere));entity.group.visible=inView;
    if(!inView){if(entity.lowDetail)MobileCrowd.hide(entity.charSprite);else if(entity.charSprite.userData.instancedAvatar)InstancedAvatars.hide(entity.charSprite);entity.nameLabel.style.visibility='hidden';entity.chatBubble.classList.add('hidden');continue;}
    if(entity.lowDetail){entity.charSprite.rotation.y=0;MobileCrowd.update(entity.charSprite,!entity.alive,entity.motion.heading,now,entity.motion);}
    else if(entity.charSprite.userData.instancedAvatar||entity.id===myClientId||now-entity.lastPose>33){window.AvatarActors.update(entity.charSprite,!entity.alive,entity.motion.blend>.02,now,entity.seed,entity.motion);entity.lastPose=now;}
    // Position overlays at display rate; measure text only when its layout changes.
    const displayHeight=(entity.charSprite.userData.displayHeight||entity.charSprite.userData.visualHeight||2.95)*entity.avatarScale;
    nicknamePosition.set(viewPosition.x,entity.y+displayHeight,viewPosition.z).project(camera);
    const nameVisible = Math.abs(nicknamePosition.x)<1.1 && Math.abs(nicknamePosition.y)<1.1 && Math.abs(nicknamePosition.z)<1;
    const anchorX=(nicknamePosition.x+1)*viewWidth/2,nameY=(1-nicknamePosition.y)*viewHeight/2-5;
    entity.nameLabel.style.visibility = nameVisible ? 'visible' : 'hidden';
    entity.nameLabel.style.transform = `translate3d(${anchorX}px,${nameY}px,0) translate(-50%,-100%)`;
    entity.nameLabel.classList.toggle('find-me-muted',entity.id!==myClientId && performance.now()<findMeUntil);
    const labelKey=`${entity.name}|${viewWidth}|${viewHeight}|${entity.id===myClientId}`;
    if(entity.labelKey!==labelKey||!entity.labelHeight){
      entity.labelHeight=entity.nameLabel.offsetHeight;entity.labelWidth=entity.nameLabel.offsetWidth;entity.labelKey=labelKey;
    }
    const badgeBottom=nameY-entity.labelHeight-3;
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
      const layout=measurePlayerChat(entity,viewWidth,viewHeight,badgeWidth,anchorX,badgeTop);
      const {width:bubbleWidth,height:bubbleHeight,side,onRight,clearance}=layout;
      let left=Math.max(8,Math.min(viewWidth-bubbleWidth-8,anchorX-bubbleWidth/2));
      let top=Math.max(8,Math.min(viewHeight-bubbleHeight-10,badgeTop-bubbleHeight-5));
      if(side){
        left=onRight?anchorX+clearance:anchorX-clearance-bubbleWidth;
        top=Math.max(8,Math.min(viewHeight-bubbleHeight-10,nameY+5-bubbleHeight/2));
        entity.chatBubble.style.setProperty('--chat-tail-y',Math.max(12,Math.min(bubbleHeight-12,nameY+5-top))+'px');
      }
      entity.chatBubble.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0)`;
      entity.chatBubble.style.setProperty('--chat-tail-x',Math.max(12,Math.min(bubbleWidth-12,anchorX-left))+'px');
    }

    // 내 캐릭터 전용 금빛 이중 링 회전 연출
    if (entity.goldRingMesh) {
      entity.goldRingMesh.rotation.z = now * .0008;
      const locating = performance.now() < findMeUntil;
      entity.goldRingMesh.scale.setScalar(entity.avatarScale*(locating ? 1.45 + Math.sin(now*.012)*.18 : 1));
    }

    entity.overheadSprite.visible = nameVisible&&(entity.id === myClientId || performance.now() >= findMeUntil);
    updatePlayerOverheadIfNeeded(entity);
  }

  // 3) 오답 구역 무대 바닥 하강 연출
  for (const plat of [zoneO, zoneX, lane1, lane2, lane3, lane4]) {
    plat.group.position.y += (plat.targetY - plat.group.position.y) * 0.14;
  }

  podiumGroup.visible=!!currentRoomId&&!raceActive;
  hostSpeechBubble.style.visibility=currentRoomId&&!raceActive?'visible':'hidden';
  if(currentRoomId&&!raceActive){
    ShowHost.update(hostSprite,now,roomState?.state);
    podiumGroup.updateMatrixWorld(true);
    hostSpeechAnchor.set(0,4.25,-.3).applyMatrix4(podiumGroup.matrixWorld).project(camera);
    hostSpeechBubble.style.visibility=Math.abs(hostSpeechAnchor.x)<.96&&Math.abs(hostSpeechAnchor.y)<1?'visible':'hidden';
    const anchorX=(hostSpeechAnchor.x+1)*viewWidth/2,anchorY=(1-hostSpeechAnchor.y)*viewHeight/2;
    const width=hostSpeechSize.width||hostSpeechBubble.offsetWidth,height=hostSpeechSize.height||hostSpeechBubble.offsetHeight;
    const left=Math.max(8,Math.min(viewWidth-width-8,anchorX-width/2));
    const top=Math.max(4,anchorY-height-10);
    hostSpeechBubble.style.transform=`translate3d(${left}px,${top}px,0)`;
    hostSpeechBubble.style.setProperty('--host-tail-x',Math.max(12,Math.min(width-12,anchorX-left))+'px');
  }
  updateTimerDisplay();
  MobileCrowd.flush();
  InstancedAvatars.flush(camera,viewHeight);
  CrowdDecorations.flush(playerEntities.values(),myClientId,camera);
  sceneClarity.render(scene, camera);
  recordRenderedFrame(frameTime);
}

requestAnimationFrame(animate);

// ==================== 5. 웹소켓 통신 ====================
let resumeSession=null;
let restoredSubmission=null;
try{resumeSession=JSON.parse(sessionStorage.getItem('ox-room-session')||'null');}catch{}
function saveResumeSession(value){resumeSession=value;try{if(value)sessionStorage.setItem('ox-room-session',JSON.stringify(value));else sessionStorage.removeItem('ox-room-session');}catch{}}
function answerContext(){return {gameId:roomState?.gameId,roundId:roomState?.roundId};}
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
        if(resumeSession?.roomId&&resumeSession?.resumeToken)ws.send(JSON.stringify({type:'RESUME_ROOM',...resumeSession,worldDelta:true}));
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
        myClientId=msg.clientId;
        restoredSubmission=msg.resumed&&msg.hasSubmitted?msg:null;
        if(msg.resumeToken)saveResumeSession({roomId:msg.roomId,resumeToken:msg.resumeToken});
        worldUpdates.reset();roomStateSync.reset();
        lastSentPosKey='';lastSentPosTime=0;
        creatingRoomRequestId=null;updateSaveButtons();
        cameraFollow.initialized=false;cameraFollow.x=0;cameraFollow.targetX=0;
        currentRoomId = msg.roomId;
        document.getElementById('lobby-overlay').classList.add('hidden');
        document.getElementById('game-hud').classList.remove('hidden');
        requestAnimationFrame(updateCameraForScreen);
        break;
      }
      case 'RESUME_REJECTED':
        saveResumeSession(null);returnToLobby();setQuizStatus('복귀할 수 없어요. 진행 중인 방에는 관전으로 입장할 수 있어요.');break;
      case 'NOTICE':setQuizStatus(msg.message);break;
      case 'MOVE_CORRECTION':{
        if(msg.roomId!==currentRoomId)break;
        if(msg.roundId&&msg.roundId!==roomState?.roundId)break;
        myPos={x:msg.x,z:msg.z};myMoveTarget=null;
        lastSentPosKey='';
        break;
      }
      case 'RACE_STATE':receiveRaceState(msg);break;
      case 'ROOM_STATE': {
        if(msg.roomId!==currentRoomId)break;
        roomState = msg;
        serverTimeOffset = Date.now() - (msg.serverNow || Date.now());
        try{
          handleRoomStateUpdate(msg);
          roomStateSync.accept(msg.stateVersion);
        }catch(error){
          renderedPhaseKey=null;roomStateSync.invalidate();
          console.warn('게임 화면 갱신 실패, 서버 상태 재확인:',error);
        }
        if(restoredSubmission){
          if(msg.gameId===restoredSubmission.gameId&&msg.roundId===restoredSubmission.roundId&&msg.state==='QUESTION'){
            document.getElementById('short-answer-input').value=restoredSubmission.ownAnswer||'';
            highlightSelectedMultiBtn(restoredSubmission.ownAnswer);
            const preview=document.getElementById('my-submitted-preview');preview.textContent=`제출한 답안: ${restoredSubmission.ownAnswer}`;preview.classList.remove('hidden');
          }
          restoredSubmission=null;
        }
        break;
      }

      case 'WORLD_TICK':
      case 'WORLD_DELTA': {
        if(!currentRoomId)break;
        if(msg.roomId&&msg.roomId!==currentRoomId)break;
        roomStateSync.observe(msg.stateVersion);
        const players=worldUpdates.apply(msg);
        if(players)handleWorldTick(players);
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
        if(msg.roomId!==currentRoomId||msg.gameId!==roomState?.gameId||msg.roundId!==roomState?.roundId)break;
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

  ws.onclose = (event) => {
    resetCodeLoad('서버 연결이 끊겼어요. 다시 연결된 뒤 불러와 주세요.');
    if(event.code===4001)saveResumeSession(null);
    libraryReady=false;pendingQuizSaves.clear();creatingRoomRequestId=null;overwriteRequestId=null;document.getElementById('save-quiz-dialog').close();updateSaveButtons();returnToLobby({preserveResume:true});
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
    if(p.el!==0){if (p.a) aliveCount++;else ghostCount++;}

    const entity = getOrCreatePlayerEntity(p);
    const wasEligible=entity.eligible;
    entity.eligible=p.el!==0;
    const avatarId=AvatarCatalog.normalize(p.av);
    if(entity.avatarId!==avatarId){
      disposeEntityAvatar(entity);entity.avatarId=avatarId;entity.seed=p.s;
      setEntityDetail(entity,entity.id!==myClientId&&lowSpecMode);
    }else if(wasEligible===false&&entity.eligible){
      setEntityDetail(entity,entity.id!==myClientId&&lowSpecMode);
    }else if(entity.id===myClientId&&AvatarActors.model(avatarId)?.loaded&&!entity.charSprite.userData.importedGLB){
      setEntityDetail(entity,false);
    }

    if (entity.name !== p.n) { entity.name = p.n; entity.nameLabel.textContent = p.n;entity.labelHeight=0; }
    entity.nameLabel.classList.toggle('is-ghost',!p.a);
    const roleChanged = entity.onStage !== Boolean(p.st);
    if(roleChanged||Math.hypot(p.x-entity.x,p.z-entity.z)>8)entity.motion.teleporting=true;
    entity.alive = Boolean(p.a);
    entity.raceProgress=p.rp||0;entity.raceRank=p.rk||0;
    if(raceActive&&p.i!==myClientId&&Math.hypot(p.x-entity.x,p.z-entity.z)>6){entity.x=p.x;entity.z=p.z;}
    entity.eligible=p.el!==0;entity.connected=p.c!==0;
    entity.onStage = Boolean(p.st);
    entity.targetY = p.st ? STAGE_HEIGHT : 0;
    entity.isEditing = Boolean(p.e);
    if (p.i === myClientId && roleChanged) {
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
      disposeEntityAvatar(ent);
      ent.nameLabel.remove();
      ent.chatBubble.remove();
      playerEntities.delete(id);
    }
  }

  // 상태판 갱신 및 인원 변동 시 강조 애니메이션
  if (aliveCount !== prevAliveCount) {
    document.getElementById('hud-alive-count').textContent=`생존 ${aliveCount}`;
    if (prevAliveCount !== -1) triggerPillBump('pill-alive');
    prevAliveCount = aliveCount;
  }
  if (ghostCount !== prevGhostCount) {
    document.getElementById('hud-ghost-count').textContent=`유령 ${ghostCount}`;
    if (prevGhostCount !== -1) triggerPillBump('pill-ghost');
    prevGhostCount = ghostCount;
  }
  syncSpectatorView();
  if(hadSpectators !== [...playerEntities.values()].some(entity=>!entity.onStage))requestAnimationFrame(updateCameraForScreen);
}

function handleRoomStateUpdate(stateMsg) {
  document.getElementById('hud-target-count').textContent=`목표 ${stateMsg.targetWinners}명`;

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
  // Membership updates repeat ROOM_STATE for the same question. Keep focused
  // inputs mounted and untouched so mobile keyboards and IME composition stay open.
  const phaseKey = JSON.stringify([stateMsg.roomId, stateMsg.gameId, stateMsg.roundId, stateMsg.state, q?.index, stateMsg.stateEndTime]);
  const phaseChanged = phaseKey !== renderedPhaseKey;
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
    mainText.textContent = q.isRevival?'참가 구역을 바꾸고 있어요. 곧 시작해요!':'현재 위치에서 곧 시작해요!';
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
  const eligible = mine&&mine.eligible!==false ? (q?.isRevival ? !mine.alive : mine.alive) : false;
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
  syncRaceScene();renderRaceInfo();
  requestAnimationFrame(updateCameraForScreen);
  renderedPhaseKey=phaseKey;
  for (const ent of playerEntities.values()) {
    ent.lastBadgeKey = '';
    updatePlayerOverheadIfNeeded(ent);
  }
}

function syncSpectatorView(){
  const observing=playerEntities.get(myClientId)?.eligible===false;
  document.body.classList.toggle('spectator-mode',observing);
  document.getElementById('spectator-status').hidden=!observing;
  if(observing!==wasSpectator){cameraFrame=null;cameraFollow.initialized=false;wasSpectator=observing;requestAnimationFrame(updateCameraForScreen);}
  if(!observing){if(spectatorTargetId)for(const p of playerEntities.values())p.nameLabel.classList.remove('is-spectated');spectatorTargetId=null;spectatorOptionsKey='';return;}
  if(!document.getElementById('chat-popup').classList.contains('hidden'))closeChatPopup();
  const players=[...playerEntities.values()],list=SpectatorView.candidates(players),target=SpectatorView.pick(players,spectatorTargetId);
  if(target!==spectatorTargetId){spectatorTargetId=target;cameraFollow.initialized=false;}
  const select=document.getElementById('spectate-target'),key=JSON.stringify(list.map(p=>[p.id,p.name]));
  if(key!==spectatorOptionsKey){
    select.replaceChildren();
    if(!list.length)select.add(new Option('생존자 없음 · 전체 무대',''));
    else for(const p of list)select.add(new Option(p.name,p.id));
    spectatorOptionsKey=key;
  }
  select.value=spectatorTargetId||'';select.disabled=!list.length;
  document.getElementById('spectate-prev').disabled=list.length<2;document.getElementById('spectate-next').disabled=list.length<2;
  for(const p of players)p.nameLabel.classList.toggle('is-spectated',p.id===spectatorTargetId);
}
window.selectSpectator=function(id){
  if(playerEntities.get(myClientId)?.eligible!==false)return;
  spectatorTargetId=SpectatorView.pick(playerEntities.values(),id);cameraFollow.initialized=false;syncSpectatorView();
  document.getElementById('spectate-target').blur();
};
window.cycleSpectator=function(direction){
  if(playerEntities.get(myClientId)?.eligible!==false)return;
  selectSpectator(SpectatorView.cycle(playerEntities.values(),spectatorTargetId,direction));
};

function updateTimerDisplay() {
  const timerEl = document.getElementById('q-timer');
  const estimatedServerNow = Date.now() - serverTimeOffset;
  if(currentRoomId&&serverFeatures.stateSync&&ws?.readyState===WebSocket.OPEN&&roomStateSync.due(roomState,estimatedServerNow,performance.now())){
    ws.send(JSON.stringify({type:'GET_ROOM_STATE',roomId:currentRoomId}));
  }
  if (!roomState || roomState.state === 'WAITING' || roomState.state === 'ENDED') {
    timerEl.textContent = '⏱ 대기';
    timerEl.classList.remove('urgent');
    return;
  }


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
    ws.send(JSON.stringify({type: 'SUBMIT_MULTIPLE', answer: String(laneNum),...answerContext()}));
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
  if(playerEntities.get(myClientId)?.eligible===false)return false;
  if (['WAITING','BREAK'].includes(roomState?.state)) return true;
  if (roomState?.state !== 'QUESTION' || Date.now() - serverTimeOffset >= roomState.stateEndTime) return false;
  const q = roomState.currentQuestion, mine = playerEntities.get(myClientId);
  return !!mine && (!mine.onStage || q.type==='RACE'&&!raceOwn?.rank&&raceOwn?.participant || q.type === 'OX' || q.type==='MINORITY' || q.type === 'MULTIPLE' && q.inputMode === 'MOVE');
}

window.submitShortAnswer = function () {
  const input = document.getElementById('short-answer-input');
  const val = input.value.trim();
  if (!val || !ws || !canAnswer()) return;
  ws.send(JSON.stringify({ type: 'SUBMIT_SHORT', answer: val,...answerContext() }));
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
  if(playerEntities.get(myClientId)?.eligible===false)return;
  const popup = document.getElementById('chat-popup');
  if (!popup) return;
  if(!popup.classList.contains('hidden')){closeChatPopup();return;}
  freezeSceneForInput();
  popup.classList.remove('hidden');
  setTimeout(() => {if(!popup.classList.contains('hidden'))document.getElementById('chat-input').focus();},30);
};

window.sendChatMessage = function () {
  if(playerEntities.get(myClientId)?.eligible===false)return;
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

function returnToLobby({preserveResume=false}={}){
 if(!preserveResume)saveResumeSession(null);
 resetJoystick();
 closeChatPopup();
 currentRoomId=null;roomState=null;renderedPhaseKey=null;myMoveTarget=null;
 raceOwn=null;syncRaceScene();
 worldUpdates.reset();roomStateSync.reset();
 lastSentPosKey='';lastSentPosTime=0;
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
  if (isList) requestRoomList();
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
    grid.className = 'room-grid empty-grid';
    grid.innerHTML = `
      <div class="empty-room-state">
        <div class="empty-room-icon">📭</div>
        <h3>현재 열려있는 공개 방이 없습니다</h3>
        <p>상단 <b>[방 만들기]</b> 탭에서 첫 번째 방을 만들어 보세요!</p>
        <button class="btn btn-primary btn-sm" type="button" onclick="switchLobbyTab('create')">＋ 방 만들기</button>
      </div>`;
    return;
  }
  grid.className = 'room-grid';

  for (const r of rooms) {
    const capacity = r.maxPlayers || 50;
    const isFull = r.playerCount >= capacity;
    const card = document.createElement('div');
    card.className = 'room-item';

    const stateLabel =
      r.state === 'WAITING' ? '🟢 대기중' :
      r.state === 'ENDED' ? '🏁 종료됨' : '🔥 진행중 (관전 입장)';

    card.innerHTML = `
      <div class="room-item-title">${escapeHtml(r.title)}</div>
      <div class="room-meta">
        <span class="meta-pill">${stateLabel}</span>
        <span class="meta-pill">👥 ${r.playerCount}/${capacity}${r.reservedCount?` · 복귀 예약 ${r.reservedCount}`:''}</span>
        <span class="meta-pill">📋 ${r.questionCount}라운드</span>
        <span class="meta-pill">🏆 당첨 목표 ${r.targetWinners}명</span>
      </div>
      <div class="room-card-actions"><button class="btn btn-primary" ${isFull?'disabled':''} onclick="joinRoom('${r.id}')">${isFull?'정원 마감':'입장하기 →'}</button></div>
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
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomId, nickname,avatarId:AvatarPicker.selected(),worldDelta:true }));
  }
};

window.submitCreateRoom=function(){
 if(!validateQuizDraft()||!requireLibrary()||pendingQuizSaves.size||creatingRoomRequestId)return;
 saveQuizDraft();
 creatingRoomRequestId='create_'+(++saveSequence);updateSaveButtons();
 ws.send(JSON.stringify({type:'CREATE_ROOM',requestId:creatingRoomRequestId,...currentQuizPayload(),nickname:getPlayerNickname(),avatarId:AvatarPicker.selected(),worldDelta:true}));
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
  ws.send(JSON.stringify({type: 'ANSWER_EDITING',...answerContext()}));
  document.getElementById('my-submitted-preview').textContent = '수정 중 · 다시 제출하면 답안이 변경돼요';
});



document.addEventListener('focusin', event => {
  if(['chat-input','short-answer-input'].includes(event.target.id)){freezeSceneForInput();scheduleInputViewport(true);}
  if (event.target.matches('input,textarea,select')) {
    resetJoystick();
    myMoveTarget = null;
    Object.keys(keysPressed).forEach(key => keysPressed[key] = false);
  }
});
document.addEventListener('focusout',()=>requestAnimationFrame(()=>{
  scheduleInputViewport();
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

// Mobile browsers may suspend a tab without closing its socket.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)roomStateSync.invalidate();});
window.addEventListener('pageshow',()=>roomStateSync.invalidate());
window.addEventListener('online',()=>roomStateSync.invalidate());
