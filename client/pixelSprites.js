// 시안(ox-quiz-mobile-hud.png) 스타일의 귀여운 2.5D 캐릭터, 연보라 유령, 사회자 NPC,
// 머리 위 말풍선 + '나' 표식, 내 발밑 금빛 이중 링 텍스처 생성기

(function () {
  const AVATAR_STYLES = [
    { hoodie: '#f6c344', hair: '#5c3a21', hat: null, glasses: false, bun: true },     // 노란 후드 (시안 주인공 스타일)
    { hoodie: '#22c55e', hair: '#3b2314', hat: '#16a34a', glasses: false, bun: false }, // 초록 캡모자
    { hoodie: '#60a5fa', hair: '#1e293b', hat: '#f1f5f9', glasses: false, bun: false }, // 파란 후드 + 흰 모자
    { hoodie: '#f48fb1', hair: '#3e2723', hat: null, glasses: false, pigtails: true },  // 분홍 양갈래
    { hoodie: '#ef4444', hair: '#d97706', hat: null, glasses: false, bun: false },      // 빨간 후드
    { hoodie: '#8b5cf6', hair: '#1e1b4b', hat: null, glasses: true, bun: false },       // 보라 후드 + 안경
    { hoodie: '#14b8a6', hair: '#451a03', hat: '#0d9488', glasses: false, bun: false }, // 민트 후드
    { hoodie: '#fb923c', hair: '#27272a', hat: null, glasses: true, bun: false },       // 오렌지 후드
    { hoodie: '#ec4899', hair: '#581c87', hat: null, glasses: false, bun: true },       // 핑크 후드
    { hoodie: '#38bdf8', hair: '#312e81', hat: '#e0f2fe', glasses: false, bun: false }, // 하늘 후드
    { hoodie: '#a3e635', hair: '#365314', hat: null, glasses: false, pigtails: true },  // 라임 후드
    { hoodie: '#f43f5e', hair: '#1f2937', hat: null, glasses: true, bun: false }        // 로즈 후드
  ];

  const charTextureCache = new Map();
  const floorLabelCache = new Map();
  let goldRingTexture = null;
  let hostNpcTexture = null;

  // 귀여운 2.5D 캐릭터 & 연보라 유령 텍스처 생성
  function createPixelCharTexture(seed, frameIndex, isGhost, THREE) {
    const key = `${seed}_${frameIndex}_${isGhost ? 'G' : 'A'}`;
    if (charTextureCache.has(key)) return charTextureCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    const bounceY = frameIndex === 1 ? -4 : 0;

    if (isGhost) {
      // 시안 하단과 똑같은 귀여운 연보라색 반투명 유령 (모자/리본/안경 악세서리 포함)
      ctx.save();
      ctx.translate(0, bounceY);

      const grad = ctx.createLinearGradient(64, 20, 64, 112);
      grad.addColorStop(0, 'rgba(221, 214, 254, 0.94)');
      grad.addColorStop(0.7, 'rgba(196, 181, 253, 0.88)');
      grad.addColorStop(1, 'rgba(167, 139, 250, 0.65)');

      ctx.fillStyle = grad;
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.55)';
      ctx.lineWidth = 3;

      // 유령 몸통 + 둥근 꼬리 물결
      ctx.beginPath();
      ctx.arc(64, 56, 32, Math.PI, 0, false);
      ctx.lineTo(96, 96);
      ctx.quadraticCurveTo(86, 108, 76, 96);
      ctx.quadraticCurveTo(64, 110, 52, 96);
      ctx.quadraticCurveTo(42, 108, 32, 96);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 귀여운 양팔
      ctx.beginPath();
      ctx.ellipse(30, 68, 8, 5, -0.4, 0, Math.PI * 2);
      ctx.ellipse(98, 68, 8, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // 눈 & 볼터치
      ctx.fillStyle = '#4c1d95';
      ctx.beginPath();
      ctx.arc(53, 56, 4.2, 0, Math.PI * 2);
      ctx.arc(75, 56, 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
      ctx.beginPath();
      ctx.ellipse(45, 63, 5, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(83, 63, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // 유령별 귀여운 모자/리본 포인트
      if (seed % 3 === 0) {
        ctx.fillStyle = 'rgba(167, 139, 250, 0.9)';
        ctx.beginPath();
        ctx.arc(64, 32, 22, Math.PI, 0);
        ctx.fill();
      } else if (seed % 3 === 1) {
        ctx.fillStyle = '#f472b6';
        ctx.beginPath();
        ctx.arc(78, 32, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // 귀여운 2.5D 캐주얼 아바타 렌더링
      const st = AVATAR_STYLES[seed % AVATAR_STYLES.length];
      ctx.save();
      ctx.translate(0, bounceY);

      // 1) 신발 (걷기 애니메이션 시 발 교차)
      const leftFootY = frameIndex === 1 ? 109 : 112;
      const rightFootY = frameIndex === 1 ? 112 : 109;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      roundRect(ctx, 44, leftFootY, 16, 10, 5);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, 68, rightFootY, 16, 10, 5);
      ctx.fill();
      ctx.stroke();

      // 2) 바지
      ctx.fillStyle = '#334155';
      roundRect(ctx, 47, 94, 13, 18, 4);
      ctx.fill();
      roundRect(ctx, 68, 94, 13, 18, 4);
      ctx.fill();

      // 3) 후드티 상의
      ctx.fillStyle = st.hoodie;
      ctx.strokeStyle = '#27272a';
      ctx.lineWidth = 3;
      roundRect(ctx, 40, 66, 48, 32, 14);
      ctx.fill();
      ctx.stroke();

      // 소매 & 손
      ctx.fillStyle = st.hoodie;
      roundRect(ctx, 32, 70, 12, 22, 6);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, 84, 70, 12, 22, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(38, 92, 5, 0, Math.PI * 2);
      ctx.arc(90, 92, 5, 0, Math.PI * 2);
      ctx.fill();

      // 4) 뒷머리 / 당고머리 / 양갈래
      ctx.fillStyle = st.hair;
      if (st.bun) {
        ctx.beginPath();
        ctx.arc(44, 22, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (st.pigtails) {
        ctx.beginPath();
        ctx.arc(32, 42, 10, 0, Math.PI * 2);
        ctx.arc(96, 42, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 5) 얼굴 (둥글고 따뜻한 피부톤)
      ctx.fillStyle = '#ffedd5';
      ctx.beginPath();
      ctx.arc(64, 44, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 6) 앞머리
      ctx.fillStyle = st.hair;
      ctx.beginPath();
      ctx.arc(64, 38, 26, Math.PI * 0.92, Math.PI * 2.08);
      ctx.fill();

      // 7) 캡모자 (있는 경우)
      if (st.hat) {
        ctx.fillStyle = st.hat;
        ctx.beginPath();
        ctx.arc(64, 34, 26, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        roundRect(ctx, 34, 30, 60, 7, 3.5);
        ctx.fill();
        ctx.stroke();
      }

      // 8) 눈 & 홍조 & 미소
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(54, 47, 3.8, 0, Math.PI * 2);
      ctx.arc(74, 47, 3.8, 0, Math.PI * 2);
      ctx.fill();

      // 눈 하이라이트
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(52.5, 45.5, 1.4, 0, Math.PI * 2);
      ctx.arc(72.5, 45.5, 1.4, 0, Math.PI * 2);
      ctx.fill();

      // 볼 홍조
      ctx.fillStyle = 'rgba(251, 113, 133, 0.45)';
      ctx.beginPath();
      ctx.ellipse(46, 52, 4.5, 2.5, 0, 0, Math.PI * 2);
      ctx.ellipse(82, 52, 4.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // 귀여운 입
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(64, 52, 4, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      // 안경 (있는 경우)
      if (st.glasses) {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(54, 47, 7, 0, Math.PI * 2);
        ctx.arc(74, 47, 7, 0, Math.PI * 2);
        ctx.moveTo(61, 47);
        ctx.lineTo(67, 47);
        ctx.stroke();
      }

      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    charTextureCache.set(key, tex);
    return tex;
  }

  // 무대 뒤쪽 중앙 단상에 서 있는 사회자(MC) 캐릭터 텍스처
  function createHostNpcTexture(THREE) {
    if (hostNpcTexture) return hostNpcTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // 정장 상의
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    roundRect(ctx, 38, 66, 52, 44, 12);
    ctx.fill();
    ctx.stroke();

    // 셔츠 & 넥타이
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(56, 66);
    ctx.lineTo(72, 66);
    ctx.lineTo(64, 84);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(62, 72);
    ctx.lineTo(66, 72);
    ctx.lineTo(64, 88);
    ctx.closePath();
    ctx.fill();

    // 얼굴
    ctx.fillStyle = '#ffedd5';
    ctx.beginPath();
    ctx.arc(64, 44, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 단정한 갈색 헤어
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.arc(64, 36, 25, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();

    // 눈 & 미소
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(55, 46, 3.5, 0, Math.PI * 2);
    ctx.arc(73, 46, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(64, 51, 5, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // 오른손 마이크
    ctx.fillStyle = '#334155';
    roundRect(ctx, 26, 62, 6, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(29, 59, 5, 0, Math.PI * 2);
    ctx.fill();

    hostNpcTexture = new THREE.CanvasTexture(canvas);
    hostNpcTexture.colorSpace = THREE.SRGBColorSpace;
    return hostNpcTexture;
  }

  // 내 캐릭터 발밑 전용 금빛 이중 링 + 4개 빛 포인트 텍스처
  function createLocalGoldRingTexture(THREE) {
    if (goldRingTexture) return goldRingTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const cx = 128;
    const cy = 128;

    // 은은한 황금빛 후광
    const glow = ctx.createRadialGradient(cx, cy, 55, cx, cy, 122);
    glow.addColorStop(0, 'rgba(253, 224, 71, 0.15)');
    glow.addColorStop(0.65, 'rgba(250, 204, 21, 0.45)');
    glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 122, 0, Math.PI * 2);
    ctx.fill();

    // 바깥 금빛 링
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx, cy, 92, 0, Math.PI * 2);
    ctx.stroke();

    // 안쪽 부드러운 화이트/골드 이중 링
    ctx.strokeStyle = '#fef9c3';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 76, 0, Math.PI * 2);
    ctx.stroke();

    // 동서남북 + 대각선 작은 빛 포인트 (시안의 반짝이는 포인트 재현)
    const angles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2, Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4];
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      const r = i < 4 ? 92 : 84;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, i < 4 ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    goldRingTexture = new THREE.CanvasTexture(canvas);
    goldRingTexture.colorSpace = THREE.SRGBColorSpace;
    return goldRingTexture;
  }

  // 캐릭터 머리 위 말풍선(O / X / 1~4 / 제출완료 / 관전) + 본인 전용 황금 '나' 배지 그리기
  function drawOverheadCanvas(canvas, badgeText, badgeTheme, isMe, showLocalTag = true) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1) 상단 구역/상태 말풍선 (모든 캐릭터 공통)
    if (badgeText) {
      const bubbleY = isMe ? 8 : 34;
      const bubbleH = 54;

      if (badgeTheme === 'O' || badgeTheme === 'X') {
        // 시안과 똑같은 흰색 둥근 말풍선 안에 민트색 O / 코랄색 X 아이콘
        const bubbleW = 68;
        const bubbleX = (w - bubbleW) / 2;

        drawSpeechBubble(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 16, '#ffffff', 'rgba(203,213,225,0.85)');

        if (badgeTheme === 'O') {
          ctx.strokeStyle = '#14b8a6';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(w / 2, bubbleY + bubbleH / 2, 13, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#f43f5e';
          ctx.lineWidth = 7;
          ctx.lineCap = 'round';
          const cx = w / 2;
          const cy = bubbleY + bubbleH / 2;
          ctx.beginPath();
          ctx.moveTo(cx - 11, cy - 11);
          ctx.lineTo(cx + 11, cy + 11);
          ctx.moveTo(cx + 11, cy - 11);
          ctx.lineTo(cx - 11, cy + 11);
          ctx.stroke();
        }
      } else {
        // 번호(1~4), 제출완료, 관전 등 텍스트 말풍선
        ctx.font = '900 26px Pretendard, sans-serif';
        const tw = ctx.measureText(badgeText).width;
        const bubbleW = Math.max(68, Math.min(230, tw + 34));
        const bubbleX = (w - bubbleW) / 2;

        let bg = '#ffffff';
        let border = '#cbd5e1';
        let fg = '#1e293b';

        if (badgeTheme === '1') { bg = '#3b82f6'; border = '#ffffff'; fg = '#ffffff'; }
        else if (badgeTheme === '2') { bg = '#10b981'; border = '#ffffff'; fg = '#ffffff'; }
        else if (badgeTheme === '3') { bg = '#f59e0b'; border = '#ffffff'; fg = '#ffffff'; }
        else if (badgeTheme === '4') { bg = '#ef4444'; border = '#ffffff'; fg = '#ffffff'; }
        else if (badgeTheme === 'SUBMIT') { bg = '#ffffff'; border = '#10b981'; fg = '#0f766e'; }
        else if (badgeTheme === 'GHOST') { bg = 'rgba(237, 233, 254, 0.95)'; border = '#c4b5fd'; fg = '#5b21b6'; }
        else if (badgeTheme === 'REVIVED') { bg = '#fef08a'; border = '#f59e0b'; fg = '#78350f'; }

        drawSpeechBubble(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 16, bg, border);

        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, w / 2, bubbleY + bubbleH / 2 + 1);
      }
    }

    // 2) 내 캐릭터 한 명에게만 말풍선 아래에 황금빛 '나' 캡슐 표식 추가! (시안 완벽 재현)
    if (isMe && showLocalTag) {
      const naW = 64;
      const naH = 34;
      const naX = (w - naW) / 2;
      const naY = 74;

      drawSpeechBubble(ctx, naX, naY, naW, naH, 12, '#facc15', '#eab308');
      ctx.fillStyle = '#422006';
      ctx.font = '900 22px Pretendard, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('나', w / 2, naY + naH / 2 + 1);
    }
  }

  function drawSpeechBubble(ctx, x, y, w, h, r, fillStyle, strokeStyle) {
    ctx.save();
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 3;

    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.stroke();

    // 말풍선 아래쪽 작은 꼬리 삼각형
    const cx = x + w / 2;
    const by = y + h;
    ctx.beginPath();
    ctx.moveTo(cx - 7, by - 1);
    ctx.lineTo(cx + 7, by - 1);
    ctx.lineTo(cx, by + 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 바닥 구역 대형 텍스트 텍스처 (O, X, 1, 2, 3, 4)
  function createFloorSymbolTexture(symbol, color, THREE) {
    const key = `${symbol}_${color}`;
    if (floorLabelCache.has(key)) return floorLabelCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 256, 256);
    if (symbol === 'O') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 28;
      ctx.beginPath();
      ctx.arc(128, 128, 78, 0, Math.PI * 2);
      ctx.stroke();
    } else if (symbol === 'X') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 28;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(62, 62);
      ctx.lineTo(194, 194);
      ctx.moveTo(194, 62);
      ctx.lineTo(62, 194);
      ctx.stroke();
    } else {
      ctx.font = `900 ${Math.min(150,Math.floor(210/Array.from(symbol).length))}px Pretendard, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(symbol, 128, 136);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    floorLabelCache.set(key, tex);
    return tex;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  window.PixelSprites = {
    createPixelCharTexture,
    createHostNpcTexture,
    createLocalGoldRingTexture,
    drawOverheadCanvas,
    createFloorSymbolTexture
  };
})();
