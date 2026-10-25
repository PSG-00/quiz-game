const crypto = require('crypto');
const AvatarCatalog=require('../client/avatarCatalog');
const QuizLimits=require('../client/quizLimits');
const {WorldStream}=require('./WorldStream');
const ArenaRules=require('../client/arenaRules');

// Answer stage and lower spectator floor use separate bounds.
const ARENA_HALF_W = 10; // X: -10 ~ +10
const STAGE_MIN_Z = -7;
const STAGE_MAX_Z = 7;
const SPECTATOR_MIN_Z = 8.6;
const SPECTATOR_MAX_Z = 9.8;
const SPECTATOR_HALF_W = 7.5;
const JUDGE_DURATION_MS=3000;
const MAX_ROOM_PLAYERS=50;

// 기본 제공 퀴즈 프리셋 (방 생성 시 바로 쓰거나 수정 가능)
const DEFAULT_QUIZ_LIST = [
  {
    type: 'OX',
    isRevival: false,
    question: '문어의 심장은 3개다.',
    answer: 'O',
    choices: [],
    timeLimit: 12
  },
  {
    type: 'MULTIPLE',
    inputMode: 'BUTTON',
    isRevival: false,
    question: '다음 중 포유류는?',
    answer: '1',
    choices: ['고래', '상어', '문어', '참치'],
    timeLimit: 12
  },
  {
    type: 'OX',
    isRevival: true, // 패자부활전!
    question: '바나나는 나무가 아니라 거대한 여러해살이 풀이다.',
    answer: 'O',
    choices: [],
    timeLimit: 12
  },
  {
    type: 'SHORT',
    isRevival: false,
    question: '대한민국의 수도는?',
    answer: '서울,서울특별시',
    choices: [],
    timeLimit: 15
  },
  {
    type: 'OX',
    isRevival: false,
    question: '북극곰의 피부색은 흰색이다.',
    answer: 'X',
    choices: [],
    timeLimit: 12
  }
];

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// 플레이어의 x 좌표와 현재 문제 타입에 따라 무대 구역(Zone) 계산
const computeZone=ArenaRules.zone;

class Room {
  constructor(options, hostId) {
    this.id = 'room_' + crypto.randomBytes(3).toString('hex');
    this.title = (options.title || '모두의 퀴즈').slice(0, 40);
    this.hostId = hostId;
    this.ownerTokenHash = options.ownerTokenHash || null;
    this.createdAt = options.createdAt || new Date().toISOString();
    this.isDemo = false;
    this.maxPlayers = MAX_ROOM_PLAYERS;
    this.targetWinners = clamp(parseInt(options.targetWinners, 10) || 2, 1, 100);
    this.restSeconds=Number.isInteger(options.restSeconds)?clamp(options.restSeconds,0,60):5;
    this.zeroSurvivorPolicy = 'PREVIOUS_SURVIVORS'; // 전원 오답이면 직전 생존자를 기준으로 종료·추첨

    this.questions = Array.isArray(options.questions) && options.questions.length > 0
      ? options.questions.map((q, idx) => ({
          index: idx,
          type: ['OX', 'MULTIPLE', 'SHORT', 'MINORITY'].includes(q.type) ? q.type : 'OX',
          isRevival: Boolean(q.isRevival),
          inputMode: q.inputMode === 'MOVE' ? 'MOVE' : 'BUTTON',
          ignoreSpaces: q.ignoreSpaces !== false,
          caseSensitive: q.caseSensitive === true,
          question: String(q.question || `${idx + 1}번 문제`),
          answer: q.type==='MINORITY'?'':String(q.answer || 'O').trim(),
          choices: Array.isArray(q.choices) ? q.choices.slice(0, 4).map(c => String(c)) : ['1번', '2번', '3번', '4번'],
          timeLimit: clamp(parseInt(q.timeLimit, 10) || 12, 5, 60)
        }))
      : JSON.parse(JSON.stringify(DEFAULT_QUIZ_LIST));

    for(const q of this.questions){const error=QuizLimits.error(q);if(error)throw new Error(error);}
    // 플레이어 맵: id -> player 객체
    this.players = new Map();
    this.worldStream = new WorldStream();
    this.nextSpawnSlot = 0;
    this.roundParticipants = new Set();
    this.minorityOutcome=null;

    // WAITING | COUNTDOWN | PREPARING | QUESTION | JUDGE | BREAK | LOTTERY | ENDED
    this.state = 'WAITING';
    this.gameId = null;
    this.roundId = null;
    this.roundParticipants.clear();
    this.currentQuestionIndex = -1;
    this.stateEndTime = 0;
    this.timerHandle = null;
    this.lastNotice = '원하는 쪽으로 이동해 주세요!';
    this.hostSpeech = '참가자 여러분 환영합니다! 잠시 후 퀴즈가 시작됩니다!';
    this.winners = [];
    this.allFinalSurvivors = [];
  }

  // 현재 라운드에서 해당 플레이어가 무대 위(OnStage) 참가자인지, 아래층 관전석(Spectator)인지 반환
  isPlayerOnStage(player) {
    if(player.eligible===false)return false;
    if (['PREPARING', 'QUESTION'].includes(this.state)) return this.roundParticipants.has(player.id);
    return player.alive;
  }

  placePlayerInRoleZone(player) {
    const onStage = this.isPlayerOnStage(player);
    // Preserve positions for everyone who stays in the same role.
    if (player.placedOnStage === onStage) return;
    if (player.placedOnStage !== undefined) {
      player[player.placedOnStage ? 'lastStagePosition' : 'lastSpectatorPosition'] = {x:player.x,z:player.z};
    }
    const saved = player[onStage ? 'lastStagePosition' : 'lastSpectatorPosition'];
    player.placedOnStage = onStage;
    player.moveCredit=1.5;player.lastMoveAt=Date.now();
    const slot = player.spawnSlot;
    const fraction = value => value-Math.floor(value);
    // New arrivals use stable, distinct slots without moving earlier arrivals.
    player.x = Number(((fraction(slot*.61803398875+.22)-.5)*(onStage ? 17 : 14)).toFixed(3));
    player.z = Number((onStage ? (fraction(slot*.41421356237+.5)-.5)*11 : 8.75+fraction(slot*.41421356237+.5)*.9).toFixed(3));
    if (saved) {
      const halfW = onStage ? ARENA_HALF_W-.8 : SPECTATOR_HALF_W;
      player.x = clamp(saved.x,-halfW,halfW);
      player.z = clamp(saved.z,onStage ? STAGE_MIN_Z+.8 : SPECTATOR_MIN_Z,onStage ? STAGE_MAX_Z-.8 : SPECTATOR_MAX_Z);
    }
  }

  addPlayer(id, name, ws = null, avatarId = 'default') {
    if (!this.players.has(id) && this.players.size >= this.maxPlayers) {
      throw new Error(`이 방은 최대 ${this.maxPlayers}명까지 입장할 수 있어요.`);
    }
    const spriteSeed = Math.floor(Math.random() * 12);
    const alive = this.state === 'WAITING';

    const player = {
      id,
      spawnSlot: this.nextSpawnSlot++,
      name: String(name || '플레이어').slice(0, 14),
      ws,
      x: 0,
      z: 0,
      alive,
      eligible:alive,
      connected:true,
      spriteSeed,
      avatarId:AvatarCatalog.normalize(avatarId),
      submittedText: '',
      hasSubmitted: false,
      lastResult: null
    };

    this.placePlayerInRoleZone(player);
    this.players.set(id, player);
    if(this.testBotIds&&!this.testBotIds.has(id)&&(!this.hostId||this.testBotIds.has(this.hostId)||!this.players.has(this.hostId)))this.hostId=id;
    return player;
  }

  removePlayer(id) {
    const p=this.players.get(id);if(p?.disconnectTimer)clearTimeout(p.disconnectTimer);
    this.players.delete(id);
    this.roundParticipants.delete(id);
    if (this.hostId === id) this.assignHost();
  }

  assignHost(){
    const active=[...this.players.values()].filter(p=>p.connected!==false);
    this.hostId=(active.find(p=>!this.testBotIds?.has(p.id))||active[0])?.id||null;
  }

  disconnectPlayer(id,onExpire,now=Date.now()){
    const p=this.players.get(id);if(!p||p.connected===false)return;
    // Before the host starts a game there is no participation to reserve.
    if(this.state==='WAITING'){this.removePlayer(id);onExpire?.();return;}
    p.connected=false;p.ws=null;p.disconnectedUntil=now+30000;
    if(this.hostId===id)this.assignHost();
    p.onDisconnectExpire=onExpire;
    p.disconnectTimer=setTimeout(()=>this.expirePlayer(id),30000);
    p.disconnectTimer.unref?.();
  }

  expirePlayer(id,now=Date.now()){
    const p=this.players.get(id);
    if(!p||p.connected!==false||now<p.disconnectedUntil)return false;
    const callback=p.onDisconnectExpire;this.removePlayer(id);callback?.();return true;
  }

  resumePlayer(p,ws,now=Date.now()){
    if(this.players.get(p.id)!==p||p.connected===false&&now>=p.disconnectedUntil)return false;
    if(p.disconnectTimer)clearTimeout(p.disconnectTimer);
    p.disconnectTimer=null;p.onDisconnectExpire=null;p.disconnectedUntil=null;p.connected=true;p.ws=ws;
    if(this.state==='WAITING'){p.eligible=true;p.alive=true;this.placePlayerInRoleZone(p);}
    p.moveCredit=Math.min(1.5,p.moveCredit??1.5);p.lastMoveAt=now;
    if(!this.hostId||this.testBotIds?.has(this.hostId))this.assignHost();
    return true;
  }

  getCurrentQuestion() {
    if (this.currentQuestionIndex < 0 || this.currentQuestionIndex >= this.questions.length) {
      return null;
    }
    return this.questions[this.currentQuestionIndex];
  }

  getAlivePlayers() {
    const list = [];
    for (const p of this.players.values()) {
      if (p.alive&&p.eligible!==false) list.push(p);
    }
    return list;
  }

  getGhostPlayers() {
    const list = [];
    for (const p of this.players.values()) {
      if (!p.alive&&p.eligible!==false) list.push(p);
    }
    return list;
  }

  startGame() {
    if (this.timerHandle) clearTimeout(this.timerHandle);
    this.minorityOutcome=null;
    this.gameId = crypto.randomUUID();
    this.roundId=null;
    this.state = 'COUNTDOWN';

    for (const p of this.players.values()) {
      p.eligible=p.connected!==false;
      p.alive = p.eligible;
      p.submittedText = '';
      p.hasSubmitted = false;
      p.lastResult = null;
      this.placePlayerInRoleZone(p);
    }

    this.winners = [];
    this.allFinalSurvivors = [];
    this.currentQuestionIndex = -1;
    this.state = 'COUNTDOWN';
    this.hostSpeech = '자, 첫 번째 문제 나갑니다! 준비하세요!';
    this.lastNotice = '잠시 후 퀴즈 서바이벌이 시작됩니다!';
    this.stateEndTime = Date.now() + 3500;

    this.broadcastRoomEvent();
    this.timerHandle = setTimeout(() => this.nextQuestion({skipPreparation:true}), 3500);
  }

  breakBeforeNextQuestion(){
    if(this.timerHandle)clearTimeout(this.timerHandle);
    let next=this.currentQuestionIndex+1;
    while(next<this.questions.length&&this.questions[next].isRevival&&this.getGhostPlayers().length===0)next++;
    if(next>=this.questions.length){this.finishOrLottery('최종 라운드 종료!');return;}
    if(this.restSeconds===0){this.nextQuestion({skipPreparation:true});return;}
    this.state='BREAK';
    this.stateEndTime=Date.now()+this.restSeconds*1000;
    this.hostSpeech='잠깐 쉬면서 자유롭게 채팅해 주세요!';
    this.lastNotice='쉬는 시간이 끝나면 다음 문제가 시작됩니다.';
    this.broadcastRoomEvent();
    this.timerHandle=setTimeout(()=>this.nextQuestion({skipPreparation:true}),this.restSeconds*1000);
  }

  nextQuestion({skipPreparation=false}={}) {
    if (this.timerHandle) clearTimeout(this.timerHandle);
    this.minorityOutcome=null;
    this.currentQuestionIndex++;
    this.roundId=crypto.randomUUID();

    if (this.currentQuestionIndex >= this.questions.length) {
      this.finishOrLottery('최종 라운드 종료!');
      return;
    }

    const q = this.getCurrentQuestion();
    const ghosts = this.getGhostPlayers();

    // 만약 패자부활전인데 유령이 0명이면 스킵
    if (q.isRevival && ghosts.length === 0) {
      if(skipPreparation){this.nextQuestion({skipPreparation:true});return;}
      this.state = 'COUNTDOWN';
      this.hostSpeech = '탈락한 유령이 없어서 패자부활전은 통과합니다!';
      this.lastNotice = '현재 탈락자가 없어 다음 라운드로 넘어갑니다.';
      this.stateEndTime = Date.now() + 2800;
      this.broadcastRoomEvent();
      this.timerHandle = setTimeout(() => this.nextQuestion(), 2800);
      return;
    }

    this.roundParticipants = new Set([...this.players.values()].filter(p => p.eligible!==false&&(q.isRevival ? !p.alive : p.alive)).map(p => p.id));
    this.state = 'PREPARING';
    // Place round participants before the answer timer begins.
    for (const p of this.players.values()) {
      this.placePlayerInRoleZone(p);
      p.submittedText = '';
      p.hasSubmitted = false;
      p.isEditing = false;
      p.lastResult = null;
    }

    const durationMs = q.timeLimit * 1000;
    this.stateEndTime = Date.now() + 1400;

    if(q.type==='MINORITY'){
      this.hostSpeech=q.isRevival?'유령끼리 인원이 적은 구역을 고르세요! 동수면 무작위로 결정해요.':'인원이 적은 구역으로 이동하세요! 동수면 무작위로 결정해요.';
      this.lastNotice=q.isRevival?'소수결 부활전 · 유령만 집계 / 생존자 관전':'소수결 · 적은 쪽 승리 / 동수면 무작위';
    } else if (q.isRevival) {
      this.hostSpeech = '마지막 기회! 유령 여러분 정답을 선택해 주세요!';
      this.lastNotice = '패자부활전 · 유령 참가 / 생존자 관전';
    } else if (q.type === 'OX') {
      this.hostSpeech = '원하는 쪽으로 이동해 주세요!';
      this.lastNotice = '목표 이하면 즉시 종료 · 남은 생존자 전원 당첨';
    } else if (q.type === 'MULTIPLE') {
      this.hostSpeech = q.inputMode === 'MOVE' ? '정답 구역으로 이동해 주세요!' : '아래에서 보기를 선택해 주세요!';
      this.lastNotice = '목표 이하면 즉시 종료 · 남은 생존자 전원 당첨';
    } else {
      this.hostSpeech = '정답을 입력해 제출해 주세요!';
      this.lastNotice = '목표 이하면 즉시 종료 · 남은 생존자 전원 당첨';
    }

    const openQuestion=()=>{
      this.state = 'QUESTION';
      this.stateEndTime = Date.now() + durationMs;
      this.broadcastRoomEvent();
      this.timerHandle = setTimeout(() => this.judgeQuestion(), durationMs);
    };
    if(skipPreparation)openQuestion();
    else{this.broadcastRoomEvent();this.timerHandle=setTimeout(openQuestion,1400);}
  }

  // 정답 판정 및 인원 확정 (답안 평가와 인원 갱신을 한 번에 확정!)
  judgeQuestion() {
    if (this.timerHandle) clearTimeout(this.timerHandle);
    const q = this.getCurrentQuestion();
    if (!q) return;

    if (this.state !== 'QUESTION') return;
    this.state = 'JUDGE';
    this.stateEndTime = Date.now() + JUDGE_DURATION_MS;

    // Take one authoritative snapshot at the deadline. Spectators and players
    // who joined after this round started never affect either side's count.
    let correctAnswer=q.answer;
    if(q.type==='MINORITY'){
      const participants=[...this.players.values()].filter(p=>p.eligible!==false&&this.roundParticipants.has(p.id));
      const leftCount=participants.filter(p=>computeZone('MINORITY',p.x)==='LEFT').length;
      const rightCount=participants.length-leftCount,tie=leftCount===rightCount;
      const winningZone=tie?(crypto.randomInt(2)===0?'LEFT':'RIGHT'):(leftCount<rightCount?'LEFT':'RIGHT');
      this.minorityOutcome={leftCount,rightCount,tie,winningZone};
      correctAnswer=winningZone;
    }
    const answerIntro=q.type==='MINORITY'
      ? `${correctAnswer==='LEFT'?'왼쪽':'오른쪽'} 승리! 왼쪽 ${this.minorityOutcome.leftCount}명 · 오른쪽 ${this.minorityOutcome.rightCount}명${this.minorityOutcome.tie?' · 동수 무작위 결정':''}.`
      : `정답은 [${correctAnswer}]!`;

    const isPlayerCorrect = (p) => {
      if(q.type==='MINORITY')return computeZone('MINORITY',p.x)===correctAnswer;
      if (q.type === 'MULTIPLE' && q.inputMode !== 'MOVE') return p.hasSubmitted && p.submittedText === q.answer;
      if (q.type === 'OX' || q.type === 'MULTIPLE') {
        const zone = computeZone(q.type, p.x, p.z);
        return zone === q.answer.toUpperCase();
      } else if (q.type === 'SHORT') {
        const normalize = value => {
          let text = String(value).trim();
          if (q.ignoreSpaces !== false) text = text.replace(/\s/g, '');
          return q.caseSensitive ? text : text.toLowerCase();
        };
        return p.hasSubmitted && q.answer.split(',').map(normalize).includes(normalize(p.submittedText));
      }
      return false;
    };

    if (q.isRevival) {
      // 패자부활전: 유령 참가자의 인원으로 조기 종료를 판정하지 않고, 부활 결과를 반영한 실제 생존 인원 기준으로 판단
      let revivedCount = 0;
      for (const p of this.players.values()) {
        if (p.eligible===false||!this.roundParticipants.has(p.id)) {
          p.lastResult = 'SAFE';
        } else {
          if (isPlayerCorrect(p)) {
            p.alive = true;
            p.lastResult = 'REVIVED';
            revivedCount++;
          } else {
            p.lastResult = 'FAIL';
          }
        }
      }
      this.hostSpeech = `${answerIntro} ${revivedCount}명이 부활했습니다!`;
      this.lastNotice = `패자부활전 종료 · ${revivedCount}명 부활 성공!`;

      for (const p of this.players.values()) this.placePlayerInRoleZone(p);
      this.broadcastRoomEvent({
        revealAnswer: correctAnswer,
        questionType: q.type,
        isRevival: true,
        statusHighlight: revivedCount > 0 ? 'REVIVED' : 'NONE'
      });

      // 부활전 이후 다음 라운드로 이동 (만약 부활전에서도 생존자가 여전히 0명이면 마지막 문제 재도전 또는 종료)
      const aliveAfterRevival = this.getAlivePlayers().length;
      if (aliveAfterRevival === 0) {
        this.timerHandle = setTimeout(() => {
          this.currentQuestionIndex--;
          this.breakBeforeNextQuestion();
        }, JUDGE_DURATION_MS);
      } else if (aliveAfterRevival <= this.targetWinners) {
        this.timerHandle = setTimeout(() => this.finishOrLottery('부활 결과 생존자가 목표 이하이므로 전원 당첨!'), JUDGE_DURATION_MS);
      } else {
        this.timerHandle = setTimeout(() => this.breakBeforeNextQuestion(), JUDGE_DURATION_MS);
      }
      return;
    }

    // ==================== 일반 라운드 결과 확정 ====================
    const aliveBefore = this.getAlivePlayers().filter(p => this.roundParticipants.has(p.id));
    const passedPlayers = [];

    for (const p of aliveBefore) {
      if (isPlayerCorrect(p)) {
        passedPlayers.push(p);
      }
    }

    // A complete wipeout voids this elimination: the pre-round survivors form
    // the final pool. Existing ghosts and later arrivals remain ineligible.
    if (passedPlayers.length === 0 && aliveBefore.length > 0) {
      for (const p of aliveBefore) p.lastResult = 'SAFE';
      this.hostSpeech = `${answerIntro} 전원 오답으로 직전 생존자 ${aliveBefore.length}명 기준으로 당첨을 결정합니다!`;
      this.lastNotice = `전원 탈락 예외 · 직전 생존자 ${aliveBefore.length}명 기준으로 종료·추첨합니다.`;
      this.broadcastRoomEvent({
        revealAnswer: correctAnswer,
        questionType: q.type,
        isRevival: false,
        zeroWipeoutSaved: true
      });
      this.timerHandle = setTimeout(() => this.finishOrLottery('전원 오답으로 직전 생존자 기준으로 종료합니다!'), JUDGE_DURATION_MS);
      return;
    }

    // 정상 탈락 확정 (답안 평가와 인원 갱신을 한 번에 확정)
    let eliminatedCount = 0;
    for (const p of aliveBefore) {
      if (isPlayerCorrect(p)) {
        p.alive = true;
        p.lastResult = 'PASS';
      } else {
        p.alive = false;
        p.lastResult = 'FAIL';
        eliminatedCount++;
        this.placePlayerInRoleZone(p);
      }
    }

    const aliveNowCount = this.getAlivePlayers().length;
    this.hostSpeech = `${answerIntro} 현재 생존자 ${aliveNowCount}명입니다!`;
    this.lastNotice = `${q.type==='MINORITY'?answerIntro:`정답 [${q.answer}]`} · 생존 ${aliveNowCount}명 / 탈락 ${eliminatedCount}명`;

    this.broadcastRoomEvent({
      revealAnswer: correctAnswer,
      questionType: q.type,
      isRevival: false,
      statusHighlight: eliminatedCount > 0 ? 'ELIMINATED' : 'NONE'
    });

    // 문제 결과 생존자가 1명 이상이고 목표 이하면 전원 당첨 후 종료합니다.
    // 다음 문제나 예약 부활전은 진행하지 않습니다.
    if (aliveNowCount >= 1 && aliveNowCount <= this.targetWinners) {
      this.timerHandle = setTimeout(() => {
        this.finishOrLottery(
          `생존 인원(${aliveNowCount}명)이 당첨 목표(${this.targetWinners}명) 이하가 되어 즉시 종료합니다! 남은 생존자 전원 당첨!`
        );
      }, JUDGE_DURATION_MS);
    } else {
      this.timerHandle = setTimeout(() => this.breakBeforeNextQuestion(), JUDGE_DURATION_MS);
    }
  }

  // 최종 종료 및 당첨/추첨 처리
  finishOrLottery(reasonText) {
    if (this.timerHandle) clearTimeout(this.timerHandle);

    const survivors = this.getAlivePlayers();
    this.allFinalSurvivors = survivors.map(p => ({
      id: p.id,
      name: p.name,
      spriteSeed: p.spriteSeed
    }));

    // 최종 라운드 종료 후 생존 인원이 목표보다 많으면(survivors.length > targetWinners) 목표 인원만큼 추첨!
    if (survivors.length > this.targetWinners) {
      this.state = 'LOTTERY';
      this.stateEndTime = Date.now() + 4200;

      const pool = [...survivors];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      this.winners = pool.slice(0, this.targetWinners).map(p => ({
        id: p.id,
        name: p.name,
        spriteSeed: p.spriteSeed
      }));

      this.hostSpeech = `생존자 ${survivors.length}명 중 당첨 목표 ${this.targetWinners}명을 추첨합니다!`;
      this.lastNotice = `${reasonText} 목표 초과(${survivors.length}명)로 ${this.targetWinners}명을 추첨합니다!`;
      this.broadcastRoomEvent();

      this.timerHandle = setTimeout(() => {
        this.state = 'ENDED';
        this.hostSpeech = `축하합니다! 최종 당첨자 ${this.winners.length}명이 확정되었습니다!`;
        this.lastNotice = `🎉 추첨 완료! 최종 당첨자 ${this.winners.length}명 확정!`;
        this.broadcastRoomEvent();
      }, 4200);
    } else {
      // 최종 종료 시 생존 인원이 목표 이하(1 <= survivors <= targetWinners)이면 전원 당첨!
      this.winners = [...this.allFinalSurvivors];
      this.state = 'ENDED';
      this.hostSpeech = `축하합니다! 남은 생존자 ${this.winners.length}명 전원 당첨입니다!`;
      this.lastNotice = `${reasonText} 🏆`;
      this.broadcastRoomEvent();
    }
  }

  resetToWaiting() {
    if (this.timerHandle) clearTimeout(this.timerHandle);
    this.minorityOutcome=null;
    this.state = 'WAITING';
    this.gameId = null;
    this.roundId=null;
    this.roundParticipants.clear();
    this.currentQuestionIndex = -1;
    this.winners = [];
    this.allFinalSurvivors = [];
    this.hostSpeech = '원하는 쪽으로 이동해 주세요! 곧 새 게임이 시작됩니다!';
    this.lastNotice = '목표 이하면 즉시 종료 · 남은 생존자 전원 당첨';

    for (const p of this.players.values()) {
      p.eligible=p.connected!==false;
      p.alive = p.eligible;
      p.submittedText = '';
      p.hasSubmitted = false;
      p.lastResult = null;
      this.placePlayerInRoleZone(p);
    }
    this.broadcastRoomEvent();
  }

  // Server owns role bounds and answer deadlines.
  movePlayer(clientId, nx, nz, {enforceSpeed=false,now=Date.now()}={}) {
    const p = this.players.get(clientId);
    if (!p||p.eligible===false) return;
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;

    if (['PREPARING', 'JUDGE', 'LOTTERY', 'ENDED'].includes(this.state)) return;
    if (this.state === 'QUESTION' && Date.now() >= this.stateEndTime) return;
    const onStage = this.isPlayerOnStage(p);
    const q = this.getCurrentQuestion();
    if (onStage && this.state === 'QUESTION' && (q.type === 'SHORT' || (q.type === 'MULTIPLE' && q.inputMode !== 'MOVE'))) return;
    const halfW = onStage ? ARENA_HALF_W - .8 : SPECTATOR_HALF_W;
    nx=ArenaRules.coordinate(clamp(nx,-halfW,halfW));
    nz=ArenaRules.coordinate(clamp(nz,onStage?STAGE_MIN_Z+.8:SPECTATOR_MIN_Z,onStage?STAGE_MAX_Z-.8:SPECTATOR_MAX_Z));
    if(enforceSpeed){
      p.moveCredit=Math.min(2,(p.moveCredit??1.5)+Math.max(0,now-(p.lastMoveAt??now))*.0085);p.lastMoveAt=now;
      const distance=Math.hypot(nx-p.x,nz-p.z);
      if(distance>p.moveCredit+.03)return false;
      p.moveCredit=Math.max(0,p.moveCredit-distance);
    }
    p.x=nx;p.z=nz;return true;
  }

  chat(clientId,text){
    const p=this.players.get(clientId);
    if(!p||p.eligible===false||p.connected===false||typeof text!=='string')return false;
    text=Array.from(text.trim()).slice(0,40).join('');if(!text)return false;
    this.sendToAll(JSON.stringify({type:'CHAT_MSG',senderId:p.id,senderName:p.name,text}));return true;
  }

  submitAnswer(id, answer, editing = false) {
    const p = this.players.get(id), q = this.getCurrentQuestion();
    if (!p || p.eligible===false || !q || this.state !== 'QUESTION' || Date.now() >= this.stateEndTime || !this.roundParticipants.has(id)) return;
    if (editing) { p.isEditing = true; return; }
    if (q.type !== 'SHORT' && !(q.type === 'MULTIPLE' && q.inputMode !== 'MOVE')) return;
    const text = String(answer || '').trim();
    if(q.type==='SHORT'&&QuizLimits.length(text)>QuizLimits.ANSWER)throw new Error('답안은 30자까지 입력할 수 있어요.');
    if (q.type === 'MULTIPLE' && !['1', '2', '3', '4'].includes(text)) return;
    p.submittedText = text;
    p.hasSubmitted = !!text;
    p.isEditing = false;
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify({type: 'ANSWER_ACK', answer: text,roomId:this.id,gameId:this.gameId,roundId:this.roundId}));
  }

  broadcastRoomEvent(extra = {}) {
    const q = this.getCurrentQuestion();
    const publicQuestion = q
      ? {
          index: this.currentQuestionIndex,
          total: this.questions.length,
          type: q.type,
          inputMode: q.inputMode,
          isRevival: q.isRevival,
          question: q.question,
          choices: q.choices,
          timeLimit: q.timeLimit,
          answer: (this.state === 'JUDGE' || this.state === 'ENDED') ? (q.type==='MINORITY'?this.minorityOutcome?.winningZone:q.answer) : undefined
        }
      : null;

    const payload = JSON.stringify({
      type: 'ROOM_STATE',
      roomId: this.id,
      gameId: this.gameId,
      roundId:this.roundId,
      title: this.title,
      playerCount: this.players.size,
      connectedCount:[...this.players.values()].filter(p=>p.connected!==false).length,
      reservedCount:[...this.players.values()].filter(p=>p.connected===false).length,
      spectatorCount:[...this.players.values()].filter(p=>p.eligible===false).length,
      maxPlayers: this.maxPlayers,
      hostId: this.hostId,
      state: this.state,
      targetWinners: this.targetWinners,
      restSeconds:this.restSeconds,
      stateEndTime: this.stateEndTime,
      serverNow: Date.now(),
      lastNotice: this.lastNotice,
      hostSpeech: this.hostSpeech,
      currentQuestion: publicQuestion,
      totalQuestions: this.questions.length,
      winners: this.winners,
      allFinalSurvivors: this.allFinalSurvivors,
      minorityOutcome:q?.type==='MINORITY'&&['JUDGE','LOTTERY','ENDED'].includes(this.state)?this.minorityOutcome:undefined,
      ...extra
    });

    this.sendToAll(payload);
  }

  broadcastWorldTick() {
    const q = this.getCurrentQuestion();
    const revealText = this.state === 'JUDGE' || this.state === 'ENDED';
    const qType = q ? q.type : 'OX';

    const playersCompact = [];
    for (const p of this.players.values()) {
      const onStage = this.isPlayerOnStage(p);
      const zone = onStage ? computeZone(qType, p.x, p.z) : '';
      playersCompact.push({
        i: p.id,
        n: p.name,
        x: p.x,
        z: p.z,
        a: p.alive ? 1 : 0,
        el:p.eligible===false?0:1,
        c:p.connected===false?0:1,
        st: onStage ? 1 : 0, // 1 = 무대 위, 0 = 아래층 관전석
        s: p.spriteSeed,
        av: p.avatarId,
        zId: zone,
        h: p.hasSubmitted ? 1 : 0,
        e: p.isEditing ? 1 : 0,
        r: p.lastResult
      });
    }

    this.worldStream.publish(this.id,playersCompact,[...this.players.values()].map(p=>p.ws));
  }

  sendToAll(jsonStr) {
    for (const p of this.players.values()) {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(jsonStr);
      }
    }
  }
}

class RoomManager {
  constructor({startLoop=true}={}) {
    this.rooms=new Map();
    this.worldInterval=startLoop?setInterval(()=>{for(const room of this.rooms.values())if(room.players.size)room.broadcastWorldTick();},66):null;
  }
  createRoom(options,hostId){const room=new Room(options,hostId);this.rooms.set(room.id,room);return room;}
  getRoom(id){return this.rooms.get(id);}
  getRoomListSummary(){return [...this.rooms.values()].map(room=>({id:room.id,title:room.title,state:room.state,playerCount:room.players.size,reservedCount:[...room.players.values()].filter(p=>p.connected===false).length,maxPlayers:room.maxPlayers,targetWinners:room.targetWinners,questionCount:room.questions.length}));}
  closeRoom(room){
    if(!room||this.rooms.get(room.id)!==room)return;
    if(room.timerHandle)clearTimeout(room.timerHandle);
    for(const p of room.players.values())if(p.disconnectTimer)clearTimeout(p.disconnectTimer);
    room.players.clear();this.rooms.delete(room.id);
  }
  cleanupEmptyRooms(){for(const room of this.rooms.values())if(!room.players.size)this.closeRoom(room);}
  close(){this.publicTestRoom?.close();if(this.worldInterval)clearInterval(this.worldInterval);for(const room of this.rooms.values()){if(room.timerHandle)clearTimeout(room.timerHandle);for(const p of room.players.values())if(p.disconnectTimer)clearTimeout(p.disconnectTimer);}}
}
module.exports={Room,computeZone,RoomManager,DEFAULT_QUIZ_LIST,ARENA_HALF_W,MAX_ROOM_PLAYERS};
