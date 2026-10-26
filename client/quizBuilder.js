/* Quiz authoring: wide answer fields, one editor, recoverable browser draft. */
let activeQuizIndex = 0;
let quizUndoStack = [];
let draftSaveTimer;
let editingQuizId = null;
let libraryToken,libraryReady=false,savedQuizzes=[];
let draftRevision=0,editorGeneration=0,saveSequence=0;
const pendingQuizSaves=new Map();
let legacyRoomTokens={};
let draftTouched=false;
let deletingQuizId=null;
let overwriteRequestId=null,creatingRoomRequestId=null;
let pendingCodeLoad=null;
const QUIZ_DRAFT_KEY='ox-quiz-draft-v1';
function setQuizStatus(text){document.getElementById('my-quiz-status').textContent=text;}
function requireLibrary(){if(ws?.readyState!==WebSocket.OPEN||!libraryReady){setQuizStatus('서버에 연결 중입니다. 잠시 후 다시 눌러 주세요.');return false;}return true;}
function currentQuizPayload(){return {quizId:editingQuizId,title:document.getElementById('create-room-title').value.trim(),targetWinners:Number(document.getElementById('create-target-winners').value),restSeconds:document.getElementById('create-rest-seconds').valueAsNumber,questions:JSON.parse(JSON.stringify(builderQuestions))};}
function updateSaveButtons(){const busy=pendingQuizSaves.size>0||!!creatingRoomRequestId;document.getElementById('btn-save-quiz').disabled=busy;document.querySelector('.create-room-footer button').disabled=busy;}
function queueQuizSave(){const requestId='save_'+(++saveSequence);pendingQuizSaves.set(requestId,{generation:editorGeneration,revision:draftRevision,payload:currentQuizPayload()});updateSaveButtons();return requestId;}
function saveMyQuiz(){
 if(!requireLibrary()||pendingQuizSaves.size||creatingRoomRequestId)return;
 if(!Number.isInteger(currentQuizPayload().restSeconds)||currentQuizPayload().restSeconds<0||currentQuizPayload().restSeconds>60){setQuizStatus('쉬는 시간은 0~60초 정수로 입력해 주세요.');return;}
 if(builderQuestions.some(q=>q.type==='MINORITY')&&!serverFeatures.minority){setQuizStatus('소수결은 서버 업데이트가 적용되면 저장할 수 있어요. 작성 내용은 브라우저에 유지됩니다.');return;}
 if(builderQuestions.some(q=>q.type==='RACE')&&!serverFeatures.race){setQuizStatus('OX 레이스는 서버 업데이트 후 저장할 수 있어요. 작성 내용은 유지됩니다.');return;}
 for(let i=0;i<builderQuestions.length;i++){const error=QuizLimits.error(builderQuestions[i]);if(error){showBuilderError(error,i);return;}}
 const requestId=queueQuizSave();setQuizStatus('서버에 저장 중…');
 ws.send(JSON.stringify({type:'SAVE_QUIZ',requestId,...pendingQuizSaves.get(requestId).payload}));
}
function receiveSaveConfirmation(msg){
 const pending=pendingQuizSaves.get(msg.requestId);
 if(!pending||pending.generation!==editorGeneration){pendingQuizSaves.delete(msg.requestId);updateSaveButtons();return;}
 pending.expectedVersion=msg.version;overwriteRequestId=msg.requestId;
 document.getElementById('save-quiz-original').textContent=msg.title||'제목 없는 퀴즈';
 document.getElementById('confirm-overwrite-quiz').disabled=false;
 const dialog=document.getElementById('save-quiz-dialog');if(!dialog.open)dialog.showModal();
 setQuizStatus('같은 제목의 퀴즈가 있어 덮어쓰기 확인을 기다립니다.');
}
function confirmQuizOverwrite(){
 const pending=pendingQuizSaves.get(overwriteRequestId);if(!pending||!requireLibrary())return;
 document.getElementById('confirm-overwrite-quiz').disabled=true;
 ws.send(JSON.stringify({type:'SAVE_QUIZ',requestId:overwriteRequestId,...pending.payload,confirmOverwrite:true,expectedVersion:pending.expectedVersion}));
}
function cancelQuizOverwrite(){
 pendingQuizSaves.delete(overwriteRequestId);overwriteRequestId=null;updateSaveButtons();document.getElementById('save-quiz-dialog').close();setQuizStatus('저장을 취소했습니다. 작성 중인 내용은 유지됩니다.');
}
function receiveSavedQuiz(msg){
 const pending=pendingQuizSaves.get(msg.requestId);pendingQuizSaves.delete(msg.requestId);updateSaveButtons();
 if(overwriteRequestId===msg.requestId){overwriteRequestId=null;document.getElementById('save-quiz-dialog').close();}
 if(!pending||pending.generation!==editorGeneration)return;
 editingQuizId=msg.quiz.id;saveQuizDraft();
 renderSavedQuizCode(msg.quiz.code);
 setQuizStatus(pending.revision===draftRevision?(msg.unchanged?'✓ 변경된 내용이 없습니다. 이미 저장된 퀴즈입니다.':msg.shared?'✓ 동일한 퀴즈가 이미 있어 기존 코드로 내 보관함에 연결했습니다.':msg.created?'✓ 새 퀴즈로 저장했습니다.':'✓ 기존 퀴즈에 덮어썼습니다.'):'✓ 저장했습니다. 이후 수정한 내용은 다시 저장해 주세요.');
}
function renderSavedQuizCode(code){document.getElementById('saved-quiz-code').classList.toggle('hidden',!code);document.getElementById('saved-quiz-code-value').textContent=code||'';}
async function copyQuizCode(code,button){
 try{await navigator.clipboard.writeText(code);button.textContent='복사 완료';setTimeout(()=>button.textContent='코드 복사',1600);}
 catch{const selection=window.getSelection(),range=document.createRange();const label=button.closest('.my-quiz-row')?.querySelector('.quiz-code-label')||document.getElementById('saved-quiz-code-value');range.selectNodeContents(label);selection.removeAllRanges();selection.addRange(range);setQuizStatus('불러오기 코드: '+code+' · 선택한 코드를 복사해 주세요.');}
}
function resetCodeLoad(message=''){pendingCodeLoad=null;document.getElementById('btn-load-quiz-code').disabled=false;document.getElementById('quiz-code-message').textContent=message;}
function loadQuizByCode(){
 if(!requireLibrary()||pendingCodeLoad)return;
 const input=document.getElementById('quiz-load-code'),code=input.value.trim().toUpperCase();input.value=code;
 if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){document.getElementById('quiz-code-message').textContent='영문·숫자 6자리 코드를 확인해 주세요.';return;}
 const requestId='load_code_'+(++saveSequence);pendingCodeLoad={requestId,generation:editorGeneration};
 document.getElementById('btn-load-quiz-code').disabled=true;document.getElementById('quiz-code-message').textContent='퀴즈를 불러오는 중…';
 ws.send(JSON.stringify({type:'LOAD_QUIZ_BY_CODE',code,requestId}));
}
function receiveLoadedQuiz(msg){
 if(msg.byCode){
  const pending=pendingCodeLoad;
  if(!pending||pending.requestId!==msg.requestId)return;
  resetCodeLoad();
  if(pending.generation!==editorGeneration)return;
 }
 loadMyQuiz(msg.quiz,!!msg.byCode);
}
function openMyQuizzes(tab = 'public') {
  if(!requireLibrary()) return;
  if(!pendingCodeLoad) resetCodeLoad();
  document.getElementById('my-quizzes-dialog').showModal();
  switchQuizLibraryTab(tab);
  ws.send(JSON.stringify({ type: 'LIST_PUBLIC_QUIZZES' }));
  ws.send(JSON.stringify({ type: 'LIST_QUIZZES' }));
}
function renderMyQuizzes(quizzes){
 libraryReady=true;savedQuizzes=quizzes;
 const list=document.getElementById('my-quizzes-list');list.replaceChildren();
 if(!quizzes.length){const empty=document.createElement('p');empty.textContent='아직 저장한 퀴즈가 없어요. 작성 후 퀴즈 저장을 눌러 주세요.';list.append(empty);}
 for(const quiz of quizzes){
  const row=document.createElement('div');row.className='my-quiz-row';
  const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');
  title.textContent=quiz.title||'제목 없는 퀴즈';meta.textContent=quiz.questionCount+'문제 · 당첨 목표 '+quiz.targetWinners+'명';info.append(title,meta);
  if(quiz.code){const codeRow=document.createElement('div');codeRow.className='quiz-code-row';const code=document.createElement('strong');code.className='quiz-code-label';code.textContent=quiz.code;const copy=document.createElement('button');copy.type='button';copy.className='quiz-code-copy';copy.textContent='코드 복사';copy.onclick=()=>copyQuizCode(quiz.code,copy);codeRow.append(code,copy);info.append(codeRow);}
  const load=document.createElement('button');load.className='btn btn-primary';load.textContent='불러오기';load.onclick=()=>ws.send(JSON.stringify({type:'LOAD_QUIZ',quizId:quiz.id}));
  const remove=document.createElement('button');remove.className='btn delete-quiz-button';remove.textContent='삭제';remove.setAttribute('aria-label',(quiz.title||'제목 없는 퀴즈')+' 삭제');remove.onclick=()=>requestQuizDeletion(quiz);
  const actions=document.createElement('div');actions.className='my-quiz-row-actions';actions.append(load,remove);
  row.append(info,actions);list.append(row);
 }
 renderSavedQuizCode(quizzes.find(quiz=>quiz.id===editingQuizId)?.code);
}
function requestQuizDeletion(quiz){
 deletingQuizId=quiz.id;
 document.getElementById('delete-quiz-name').textContent=quiz.title||'제목 없는 퀴즈';
 document.getElementById('confirm-delete-quiz').disabled=false;
 document.getElementById('delete-quiz-dialog').showModal();
}
function confirmQuizDeletion(){
 if(!requireLibrary()||!deletingQuizId)return;
 document.getElementById('confirm-delete-quiz').disabled=true;
 ws.send(JSON.stringify({type:'DELETE_QUIZ',quizId:deletingQuizId}));
}
function receiveDeletedQuiz(id){
 document.getElementById('delete-quiz-dialog').close();deletingQuizId=null;
 for(const state of quizUndoStack)if(state.editingQuizId===id)state.editingQuizId=null;
 if(editingQuizId===id){editorGeneration++;editingQuizId=null;renderSavedQuizCode(null);saveQuizDraft();}
 setQuizStatus('저장한 퀴즈를 삭제했습니다.');
}
function loadMyQuiz(quiz,byCode=false){
 rememberQuizEdit();editorGeneration++;editingQuizId=quiz.id||null;builderQuestions=quiz.questions;activeQuizIndex=0;
 document.getElementById('create-room-title').value=quiz.title;
 document.getElementById('create-target-winners').value=quiz.targetWinners;
 document.getElementById('create-rest-seconds').value=quiz.restSeconds??5;
 document.getElementById('builder-validation').classList.add('hidden');
 renderSavedQuizCode(quiz.id?quiz.code:null);
 commitQuizStructure();setQuizStatus(byCode&&quiz.imported?'✓ 코드 '+quiz.code+'로 불러왔습니다. 퀴즈 저장을 누르면 내 보관함에 별도로 저장돼요.':'✓ 저장한 퀴즈를 불러왔습니다.');if(document.getElementById('my-quizzes-dialog')?.open)document.getElementById('my-quizzes-dialog').close();
 if(document.getElementById('public-quizzes-dialog')?.open)document.getElementById('public-quizzes-dialog').close();
}
function newLibraryQuiz(){rememberQuizEdit();editorGeneration++;editingQuizId=null;renderSavedQuizCode(null);builderQuestions=[newQuizStep()];activeQuizIndex=0;document.getElementById('create-room-title').value='';document.getElementById('create-target-winners').value='2';document.getElementById('create-rest-seconds').value='5';commitQuizStructure();document.getElementById('my-quizzes-dialog').close();setQuizStatus('새 퀴즈를 작성하고 저장해 주세요.');}
function newQuizStep(isRevival = false) {
  return {type:'OX',isRevival,question:'',answer:'O',choices:['','','',''],inputMode:'BUTTON',timeLimit:12};
}
function initQuizBuilder() {
  try{legacyRoomTokens=JSON.parse(localStorage.getItem('ox-room-owners-v1')||'{}');}catch{}
  try{libraryToken=localStorage.getItem('ox-library-token-v1');}catch{}
  if(!/^[a-f0-9]{64}$/.test(libraryToken||'')){
    libraryToken=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    try{localStorage.setItem('ox-library-token-v1',libraryToken);}catch{setQuizStatus('보관 키를 저장할 수 없어 브라우저를 닫으면 내 퀴즈를 다시 열 수 없어요.');}
  }
  let hadSavedDraft=false;
  try {
    const draft = JSON.parse(localStorage.getItem(QUIZ_DRAFT_KEY) || 'null');
    if (draft && Array.isArray(draft.questions) && draft.questions.length) {
      hadSavedDraft=true;
      editingQuizId=draft.editingQuizId||null;
      builderQuestions = draft.questions;
      activeQuizIndex = Math.min(draft.activeIndex || 0,builderQuestions.length-1);
      for (const [key,id] of Object.entries({title:'create-room-title',targetWinners:'create-target-winners',restSeconds:'create-rest-seconds',nickname:'nickname-input'})) {
        if (draft.settings?.[key] !== undefined) document.getElementById(id).value = draft.settings[key];
      }
    }
  } catch {}
  if (!builderQuestions.length) builderQuestions = [newQuizStep()];
  renderQuizBuilder();
  for (const id of ['create-room-title','create-target-winners','create-rest-seconds','nickname-input']) document.getElementById(id).addEventListener('input',scheduleQuizDraftSave);
  window.addEventListener('pagehide', saveQuizDraft);
  // Recover only the pre-upgrade draft inspected before the old page was refreshed.
  if (!hadSavedDraft) fetch('/api/recovered-draft').then(r=>r.ok?r.json():null).then(draft=>{
    if (draft?.questions?.length && !draftTouched && !builderQuestions.some(q=>q.question.trim())) {
      builderQuestions=draft.questions;
      for (const [key,id] of Object.entries({title:'create-room-title',targetWinners:'create-target-winners',restSeconds:'create-rest-seconds'})) if (draft.settings?.[key]!==undefined) document.getElementById(id).value=draft.settings[key];
      activeQuizIndex=0;renderQuizBuilder();saveQuizDraft();
    }
  }).catch(()=>{});
}
function scheduleQuizDraftSave() {
  draftTouched=true;draftRevision++;setQuizStatus('수정한 내용이 있어요 · 퀴즈 저장을 눌러 서버에 보관하세요.');
  clearTimeout(draftSaveTimer);
  document.getElementById('builder-save-status').textContent='브라우저에 임시 보관 중…';
  draftSaveTimer=setTimeout(saveQuizDraft,200);
}
function saveQuizDraft() {
  clearTimeout(draftSaveTimer);
  const settings={};
  for (const [key,id] of Object.entries({title:'create-room-title',targetWinners:'create-target-winners',restSeconds:'create-rest-seconds',nickname:'nickname-input'})) settings[key]=document.getElementById(id).value;
  try {
    localStorage.setItem(QUIZ_DRAFT_KEY,JSON.stringify({version:1,questions:builderQuestions,activeIndex:activeQuizIndex,editingQuizId,settings}));
    document.getElementById('builder-save-status').textContent='✓ 이 브라우저에 자동 저장됨';
  } catch {document.getElementById('builder-save-status').textContent='브라우저 저장 공간이 부족해요 · 퀴즈 저장을 눌러 서버에 보관해 주세요';}
}
function rememberQuizEdit() {
  const settings={};
  for(const id of ['create-room-title','create-target-winners','create-rest-seconds'])settings[id]=document.getElementById(id).value;
  quizUndoStack.push({questions:JSON.parse(JSON.stringify(builderQuestions)),activeIndex:activeQuizIndex,editingQuizId,settings});
  if(quizUndoStack.length>20)quizUndoStack.shift();
}
function commitQuizStructure() {draftTouched=true;draftRevision++;renderQuizBuilder();saveQuizDraft();setQuizStatus('수정한 내용이 있어요 · 퀴즈 저장을 눌러 서버에 보관하세요.');}
function renderQuizBuilder() {
  document.getElementById('create-rest-seconds').disabled=!serverFeatures.breakTime;
  activeQuizIndex=Math.max(0,Math.min(activeQuizIndex,builderQuestions.length-1));
  const q=builderQuestions[activeQuizIndex];if(!q)return;
  const i=activeQuizIndex;
  document.getElementById('builder-count').textContent=`${builderQuestions.length}문제`;
  const types={OX:'OX',MULTIPLE:'객관식',SHORT:'주관식',MINORITY:'소수결',RACE:'OX 레이스'};
  let answer='';
  if(q.type==='RACE') answer=`<div class="race-builder-help"><p>T자 길에서 왼쪽 O · 오른쪽 X로 이동해요. 정답은 다음 문제, 오답은 같은 문제로 출발점에서 다시 도전해요. 시작 인원의 절반(내림)이 통과해요. 25명 → 12명, 1명 → 1명.</p><label>OX 문제 개수 <input type="number" min="1" max="10" aria-label="레이스 문제 개수" value="${q.raceQuestions?.length||1}" onchange="setRaceQuestionCount(${i},this.valueAsNumber)">개</label><p>기본 시간: ${q.raceQuestions?.length||1}문제 × 15초 = ${(q.raceQuestions?.length||1)*15}초. 정원이 차면 즉시 종료해요. 시간 종료 시 남은 자리는 푼 문제 수 → 마지막 정답 도달 시각 순으로 채워요. 0문제 동률은 무작위 추첨해요.</p><div class="race-question-list">${(q.raceQuestions||[]).map((item,n)=>`<section class="race-question-row"><label>${n+1}번 문제<textarea rows="2" maxlength="200" aria-label="레이스 ${n+1}번 문제" oninput="updateRaceQuestion(${i},${n},this)">${escapeHtml(item.question)}</textarea></label><div class="builder-ox">${['O','X'].map(a=>`<button type="button" aria-label="레이스 ${n+1}번 정답 ${a}" aria-pressed="${item.answer===a}" class="${item.answer===a?'selected':''}" onclick="setRaceAnswer(${i},${n},'${a}')">${a}</button>`).join('')}</div></section>`).join('')}</div><small>각 100자 이내 · 개인별 출제 순서는 무작위 · 문제 개수 변경 시 전체 시간이 자동 계산돼요.</small></div>`;
  else if(q.type==='MINORITY') answer=`<div class="minority-rule-help"><strong>인원이 적은 구역이 승리해요.</strong><p>왼쪽과 오른쪽 중 하나를 선택하세요. 제한시간이 끝났을 때 참가자가 적은 쪽이 살아남고, 인원이 같으면 서버가 승리 구역을 무작위로 결정해요.</p><p>패자부활전에서는 참가한 유령만 집계하며 승리 구역의 유령이 부활해요.</p><small>빈 구역도 0명으로 계산해요. 일반 라운드에서 전원 탈락하면 기존 규칙대로 직전 생존자를 기준으로 종료·추첨해요.</small></div>`;
  else if(q.type==='OX') answer=`<div class="builder-ox">${['O','X'].map(a=>`<button type="button" class="${q.answer===a?'selected':''}" aria-label="${a} 정답" aria-pressed="${q.answer===a}" onclick="chooseBuilderAnswer('${a}')">${a}</button>`).join('')}</div>`;
  else if(q.type==='SHORT') answer=`<textarea id="builder-short-answer" class="wide-answer-input" rows="3" maxlength="1000" aria-label="주관식 정답" placeholder="인정할 정답을 입력하세요. 예: 서울, 서울특별시" oninput="updateBuilderField(${i},'answer',this.value)">${escapeHtml(q.answer)}</textarea><p class="builder-help">정답은 각 30자까지, 여러 정답은 쉼표로 나눠 주세요. <b>서울, 서울특별시</b> 중 하나만 제출해도 정답이에요.</p>`;
  else answer=`<div class="builder-choice-list">${[0,1,2,3].map(c=>`<label class="builder-choice-row"><input type="radio" name="builder-correct-choice" aria-label="${c+1}번을 정답으로" ${q.answer===String(c+1)?'checked':''} onchange="updateBuilderField(${i},'answer','${c+1}')"><span>${c+1}</span><textarea rows="2" maxlength="60" aria-label="${c+1}번 보기" placeholder="${c+1}번 보기 내용" oninput="updateBuilderChoice(${i},${c},this.value)">${escapeHtml(q.choices?.[c]||'')}</textarea></label>`).join('')}</div><p class="builder-help">정답 보기 왼쪽의 동그라미를 선택하세요.</p><label class="builder-label">참가자의 답 선택 방식<select aria-label="객관식 입력 방식" onchange="updateBuilderField(${i},'inputMode',this.value)"><option value="BUTTON" ${q.inputMode!=='MOVE'?'selected':''}>보기 버튼 누르기</option><option value="MOVE" ${q.inputMode==='MOVE'?'selected':''}>1~4번 구역으로 이동</option></select></label>`;
  document.getElementById('quiz-builder-list').innerHTML=`
    <div class="builder-workspace">
      <nav class="quiz-outline" aria-label="문제 목록">${builderQuestions.map((item,n)=>`<button class="quiz-outline-item ${n===i?'active':''}" aria-current="${n===i}" onclick="selectQuizStep(${n})"><span class="outline-number">${String(n+1).padStart(2,'0')}</span><span><small>${types[item.type]}${item.isRevival?' · 부활전':''}</small><span id="quiz-summary-${n}">${escapeHtml(item.question||'새 문제를 작성하세요')}</span></span></button>`).join('')}</nav>
      <section class="quiz-editor">
        <div class="editor-heading"><strong>문제 ${i+1} <span>/ ${builderQuestions.length}</span></strong><div><button id="builder-undo" title="되돌리기" aria-label="되돌리기" ${quizUndoStack.length?'':'disabled'} onclick="undoQuizEdit()">↶</button><button title="위로 이동" aria-label="문제 위로 이동" ${i===0?'disabled':''} onclick="moveQuizStep(-1)">↑</button><button title="아래로 이동" aria-label="문제 아래로 이동" ${i===builderQuestions.length-1?'disabled':''} onclick="moveQuizStep(1)">↓</button><button onclick="duplicateQuizStep()">복제</button><button class="delete-question" onclick="removeQuizStep(${i})">삭제</button></div></div>
        <div class="builder-type-tabs" role="group" aria-label="문제 유형">${Object.entries(types).map(([type,label])=>`<button aria-pressed="${q.type===type}" class="${q.type===type?'active':''}" ${(type==='MINORITY'&&!serverFeatures.minority)||(type==='RACE'&&!serverFeatures.race)?'disabled title="서버 업데이트 적용 후 사용할 수 있어요"':''} onclick="changeBuilderType(${i},'${type}')">${label}</button>`).join('')}</div>
        <label class="builder-label" for="builder-question">${['MINORITY','RACE'].includes(q.type)?'라운드 안내':'문제 내용'} <small id="builder-char-count">${QuizLimits.length(q.question)} / 100</small></label>
        <textarea id="builder-question" rows="4" maxlength="200" placeholder="참가자에게 보여 줄 문제를 입력하세요." oninput="updateBuilderField(${i},'question',this.value)">${escapeHtml(q.question)}</textarea>
        <div class="builder-label">${q.type==='RACE'?'레이스 OX 문제 목록':q.type==='MINORITY'?'자동 판정 규칙':q.type==='MULTIPLE'?'보기와 정답':'정답'}</div>
        <div class="builder-answer-section">${answer}</div>
        <div class="builder-options"><label>${q.type==='RACE'?'레이스 전체 제한시간':'제한시간'} <span><input type="number" min="5" max="${q.type==='RACE'?300:60}" aria-label="제한시간" value="${q.timeLimit}" oninput="updateBuilderField(${i},'timeLimit',Number(this.value))">초</span></label><label class="revival-toggle"><input type="checkbox" ${q.isRevival?'checked':''} onchange="toggleBuilderRevival(${i},this.checked)"><span>패자부활전<small>유령만 참가하는 문제</small></span></label></div>
        <div class="editor-navigation"><button class="btn btn-ghost" ${i===0?'disabled':''} onclick="selectQuizStep(${i-1})">이전 문제</button><button class="btn btn-primary" onclick="${i===builderQuestions.length-1?'addQuizStep(false)':`selectQuizStep(${i+1})`}">${i===builderQuestions.length-1?'+ 다음 문제 추가':'다음 문제 →'}</button></div>
      </section>
    </div>`;
}
function selectQuizStep(index){activeQuizIndex=index;renderQuizBuilder();saveQuizDraft();}
function addQuizStep(isRevival){rememberQuizEdit();builderQuestions.push(newQuizStep(isRevival));activeQuizIndex=builderQuestions.length-1;commitQuizStructure();document.getElementById('builder-question').focus();}
function removeQuizStep(index){rememberQuizEdit();builderQuestions.splice(index,1);if(!builderQuestions.length)builderQuestions=[newQuizStep()];activeQuizIndex=Math.min(index,builderQuestions.length-1);commitQuizStructure();}
function duplicateQuizStep(){rememberQuizEdit();builderQuestions.splice(activeQuizIndex+1,0,JSON.parse(JSON.stringify(builderQuestions[activeQuizIndex])));activeQuizIndex++;commitQuizStructure();}
function moveQuizStep(delta){const next=activeQuizIndex+delta;if(next<0||next>=builderQuestions.length)return;rememberQuizEdit();[builderQuestions[next],builderQuestions[activeQuizIndex]]=[builderQuestions[activeQuizIndex],builderQuestions[next]];activeQuizIndex=next;commitQuizStructure();}
function undoQuizEdit(){const state=quizUndoStack.pop();if(!state)return;builderQuestions=state.questions;activeQuizIndex=state.activeIndex;editorGeneration++;editingQuizId=state.editingQuizId||null;for(const [id,value] of Object.entries(state.settings||{}))document.getElementById(id).value=value;commitQuizStructure();}
function changeBuilderType(index,type){const q=builderQuestions[index];if(q.type===type)return;rememberQuizEdit();q.type=type;q.answer=type==='OX'?'O':type==='MULTIPLE'?'1':'';if(type==='RACE'){q.raceQuestions=q.raceQuestions?.length?q.raceQuestions:Array.from({length:3},()=>({question:'',answer:'O'}));q.timeLimit=q.raceQuestions.length*15;if(!q.question.trim())q.question='OX 문제를 모두 통과하세요!';}else{q.timeLimit=Math.min(60,q.timeLimit);}if(type==='MINORITY'&&!q.question.trim())q.question='사람이 적은 쪽으로 이동하세요!';q.choices=q.choices?.length===4?q.choices:['','','',''];commitQuizStructure();}
function setRaceQuestionCount(i,count){rememberQuizEdit();count=Math.max(1,Math.min(10,Math.floor(count)||1));builderQuestions[i].raceQuestions=Array.from({length:count},(_,n)=>builderQuestions[i].raceQuestions?.[n]||{question:'',answer:'O'});builderQuestions[i].timeLimit=count*15;commitQuizStructure();}
function updateRaceQuestion(i,n,input){input.value=Array.from(input.value).slice(0,100).join('');builderQuestions[i].raceQuestions[n].question=input.value;scheduleQuizDraftSave();}
function setRaceAnswer(i,n,answer){builderQuestions[i].raceQuestions[n].answer=answer;renderQuizBuilder();saveQuizDraft();}
function chooseBuilderAnswer(answer){builderQuestions[activeQuizIndex].answer=answer;renderQuizBuilder();saveQuizDraft();}
function toggleBuilderRevival(index,checked){builderQuestions[index].isRevival=checked;renderQuizBuilder();saveQuizDraft();}
function updateBuilderField(index,field,value){if(field==='question'){value=Array.from(value).slice(0,QuizLimits.QUESTION).join('');document.getElementById('builder-question').value=value;}builderQuestions[index][field]=value;if(field==='question'){document.getElementById(`quiz-summary-${index}`).textContent=value||'새 문제를 작성하세요';document.getElementById('builder-char-count').textContent=`${QuizLimits.length(value)} / 100`;}scheduleQuizDraftSave();}
function updateBuilderChoice(index,choice,value){value=Array.from(value).slice(0,QuizLimits.ANSWER).join('');document.querySelectorAll('.builder-choice-row textarea')[choice].value=value;builderQuestions[index].choices[choice]=value;scheduleQuizDraftSave();}
function showBuilderError(message,index){activeQuizIndex=index;renderQuizBuilder();const box=document.getElementById('builder-validation');box.textContent=`문제 ${index+1}: ${message}`;box.classList.remove('hidden');box.scrollIntoView({block:'nearest'});}
function validateQuizDraft(){
  document.getElementById('builder-validation').classList.add('hidden');
  const rest=currentQuizPayload().restSeconds;
  if(!Number.isInteger(rest)||rest<0||rest>60){setQuizStatus('쉬는 시간은 0~60초 정수로 입력해 주세요.');document.getElementById('create-rest-seconds').focus();return false;}
  for(let i=0;i<builderQuestions.length;i++){
    const q=builderQuestions[i];let error='';
    if(QuizLimits.error(q))error=QuizLimits.error(q);
    else if(q.type==='MINORITY'&&!serverFeatures.minority)error='소수결 서버 업데이트 적용을 기다려 주세요. 작성 내용은 유지됩니다.';
    else if(q.type==='RACE'&&!serverFeatures.race)error='OX 레이스 서버 업데이트 적용을 기다려 주세요.';
    else if(!q.question.trim())error='문제 내용을 입력해 주세요.';
    else if(!['MINORITY','RACE'].includes(q.type)&&!String(q.answer).trim())error='정답을 입력해 주세요.';
    else if(q.type==='RACE'&&q.raceQuestions.some(item=>!item.question.trim()))error='레이스의 OX 문제 내용을 모두 입력해 주세요.';
    else if(q.type==='SHORT'&&!q.answer.split(',').some(a=>a.trim()))error='인정할 정답을 한 개 이상 입력해 주세요.';
    else if(q.type==='MULTIPLE'&&(q.choices?.length!==4||q.choices.some(a=>!a.trim())))error='보기 네 개를 모두 입력해 주세요.';
    else if(!Number.isFinite(q.timeLimit)||q.timeLimit<5||q.timeLimit>(q.type==='RACE'?300:60))error=q.type==='RACE'?'레이스 제한시간은 5~300초로 입력해 주세요.':'제한시간은 5~60초로 입력해 주세요.';
    if(error){showBuilderError(error,i);return false;}
  }
  return true;
}

function switchQuizLibraryTab(tab) {
  const isPublic = tab === 'public';
  document.getElementById('tab-btn-quiz-public')?.classList.toggle('active', isPublic);
  document.getElementById('tab-btn-quiz-mine')?.classList.toggle('active', !isPublic);
  document.getElementById('tab-quiz-content-public')?.classList.toggle('hidden', !isPublic);
  document.getElementById('tab-quiz-content-mine')?.classList.toggle('hidden', isPublic);
  if (isPublic) {
    const search = document.getElementById('public-quiz-search');
    filterPublicQuizzes(search?.value || '');
  }
}

let allPublicQuizzes = [];
function renderPublicQuizzes(quizzes){
 allPublicQuizzes = quizzes || [];
 filterPublicQuizzes(document.getElementById('public-quiz-search')?.value || '');
}
function filterPublicQuizzes(query){
 const list = document.getElementById('public-quizzes-list');
 if(!list) return;
 list.replaceChildren();
 const q = (query || '').trim().toLowerCase();
 const filtered = q ? allPublicQuizzes.filter(quiz => (quiz.title || '').toLowerCase().includes(q)) : allPublicQuizzes;
 if(!filtered.length){
  const empty = document.createElement('p');
  empty.style.cssText = 'color:#8c7e8d; text-align:center; padding:20px 0; font-size:13px;';
  empty.textContent = q ? '검색 결과와 일치하는 퀴즈가 없어요.' : '등록된 공개 퀴즈가 아직 없습니다.';
  list.append(empty);
  return;
 }
 for(const quiz of filtered){
  const row = document.createElement('div');
  row.className = 'my-quiz-row';
  const info = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = quiz.title || '제목 없는 퀴즈';
  const meta = document.createElement('small');
  meta.textContent = quiz.questionCount + '문제 · 당첨 목표 ' + quiz.targetWinners + '명 · 쉬는시간 ' + (quiz.restSeconds ?? 5) + '초';
  info.append(title, meta);
  if(quiz.code){
   const codeRow = document.createElement('div');
   codeRow.className = 'quiz-code-row';
   const code = document.createElement('strong');
   code.className = 'quiz-code-label';
   code.textContent = quiz.code;
   const copy = document.createElement('button');
   copy.type = 'button';
   copy.className = 'quiz-code-copy';
   copy.textContent = '코드 복사';
   copy.onclick = () => copyQuizCode(quiz.code, copy);
   codeRow.append(code, copy);
   info.append(codeRow);
  }
  const actions = document.createElement('div');
  actions.className = 'my-quiz-row-actions';
  const load = document.createElement('button');
  load.className = 'btn btn-primary';
  load.textContent = '불러오기';
  load.onclick = () => {
   if(!requireLibrary()||pendingCodeLoad)return;
   const requestId='load_code_'+(++saveSequence);
   pendingCodeLoad={requestId,generation:editorGeneration};
   ws.send(JSON.stringify({type:'LOAD_QUIZ_BY_CODE',code:quiz.code,requestId}));
  };
  actions.append(load);
  row.append(info, actions);
  list.append(row);
 }
}
