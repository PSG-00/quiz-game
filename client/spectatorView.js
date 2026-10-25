(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SpectatorView=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 function candidates(players){return [...players].filter(p=>p.eligible!==false&&p.alive&&p.connected!==false);}
 function pick(players,currentId){const list=candidates(players);return list.some(p=>p.id===currentId)?currentId:list[0]?.id||null;}
 function cycle(players,currentId,direction=1){const list=candidates(players);if(!list.length)return null;const index=list.findIndex(p=>p.id===currentId);return list[(Math.max(0,index)+direction+list.length)%list.length].id;}
 function counts(players){const result={alive:0,ghost:0,spectator:0};for(const p of players){if(p.eligible===false)result.spectator++;else if(p.alive)result.alive++;else result.ghost++;}return result;}
 return {candidates,pick,cycle,counts};
});
