// Winner records for prize hand-out. Admin only: the same password as quiz loading.
let resultsRequestId=null,resultsSequence=0;
const RESULT_PLACEMENTS={WINNER:'🏆 우승',RUNNER_UP:'🥈 준우승'};
function openGameResults(){withQuizLoadAccess(showGameResults,true);}
function showGameResults(){
 const dialog=document.getElementById('results-dialog');if(!dialog.open)dialog.showModal();
 requestGameResults();
}
function requestGameResults(){
 if(!requireLibrary())return;
 resultsRequestId='results_'+(++resultsSequence);setResultsMessage('우승 기록을 불러오는 중…');
 ws.send(JSON.stringify({type:'LIST_RESULTS',requestId:resultsRequestId}));
}
function setResultsMessage(text){
 const message=document.createElement('p');message.className='result-empty';message.textContent=text;
 document.getElementById('results-list').replaceChildren(message);
}
function receiveGameResults(msg){
 if(msg.requestId!==resultsRequestId)return;resultsRequestId=null;
 if(!msg.results?.length){setResultsMessage('아직 끝난 게임이 없어요. 게임이 끝나면 우승자가 여기에 기록돼요.');return;}
 document.getElementById('results-list').replaceChildren(...msg.results.map(resultCard));
}
function failGameResults(msg){
 if(!resultsRequestId||msg.requestId!==resultsRequestId)return false;resultsRequestId=null;
 if(msg.code==='QUIZ_LOAD_LOCKED'){quizAccessUntil=0;setResultsMessage('관리자 인증 시간이 지났어요. 창을 닫고 다시 열어 주세요.');}
 else setResultsMessage(msg.message||'우승 기록을 불러오지 못했어요.');
 return true;
}
// Nicknames are player input: every field goes through textContent.
function resultWinnerLabel(winner){return `${RESULT_PLACEMENTS[winner.placement]||RESULT_PLACEMENTS.WINNER} ${winner.name} (#${String(winner.id).slice(-6)})`;}
function resultText(result){
 const lines=[`[${result.title||'모두의 퀴즈'}] ${new Date(result.at).toLocaleString('ko-KR')}`,`참가 ${result.participants}명 · 목표 ${result.targetWinners}명`];
 if(result.winners?.length)for(const winner of result.winners)lines.push(resultWinnerLabel(winner));else lines.push('당첨자 없음');
 return lines.join('\n');
}
function resultCard(result){
 const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
 const card=element('article','result-card'),head=element('div','result-head'),time=element('time','',new Date(result.at).toLocaleString('ko-KR'));
 time.dateTime=result.at;head.append(element('strong','',result.title||'모두의 퀴즈'),time);
 const winners=element('ul','result-winners');
 if(!result.winners?.length)winners.append(element('li','result-none','당첨자 없음'));
 for(const winner of result.winners||[]){
  const avatar=AvatarCatalog.profiles.find(p=>p.id===winner.avatarId)?.name,item=element('li');
  item.append(element('span','result-place'+(winner.placement==='RUNNER_UP'?' runner-up':''),RESULT_PLACEMENTS[winner.placement]||RESULT_PLACEMENTS.WINNER),element('b','',winner.name),element('small','',`${avatar?avatar+' · ':''}#${String(winner.id).slice(-6)}`));
  winners.append(item);
 }
 const copy=element('button','btn btn-ghost result-copy','복사');copy.type='button';
 copy.onclick=()=>navigator.clipboard.writeText(resultText(result)).then(()=>{copy.textContent='복사됨';setTimeout(()=>{copy.textContent='복사';},1500);},()=>{copy.textContent='복사 실패';});
 card.append(head,element('p','result-meta',`참가 ${result.participants}명 · 목표 ${result.targetWinners}명 · ${result.questionCount}문제`),winners,element('p','result-reason',result.reason||''),copy);
 return card;
}
