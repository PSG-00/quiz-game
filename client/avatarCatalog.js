(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AvatarCatalog=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 const profiles=[
  {id:'default',hidden:true,name:'기본',description:'노란 후드',hairStyle:'default',hair:0x694b3d,clothes:0xf5c85e},
  {id:'woni',name:'원이',description:'검정 생머리 · 흰 줄무늬 트레이닝복 · 클로그',preview:'./assets/models/woni-sd-v3-preview.png',hairStyle:'long',hair:0x1d2430,clothes:0x20232c},
  {id:'liv',name:'리브',description:'리본 포니테일 · 차콜 카디건 · 티어드 스커트',preview:'./assets/models/liv-sd-v7-preview.png',hairStyle:'long',hair:0x27252e,clothes:0x505a65},
  {id:'minami',name:'미나미',description:'고양이 귀 핑크캡 · 긴 웨이브 · 민트 티셔츠 · 분홍 프릴치마',preview:'./assets/models/minami-pink-sd-v2-preview.png',hairStyle:'long',hair:0x9c733e,clothes:0x21c7b4},
  {id:'may',name:'메이 핫걸단',description:'갈색 단발 · 줄무늬 끈 상의 · 베이지 와이드 팬츠',preview:'./assets/models/may-sd-v2-preview.png',hairStyle:'bob',hair:0x68432f,clothes:0x25366e,tie:0x455d87},
  {id:'may-school',name:'메이 큣걸단',description:'밝은 갈색 단발 · 브이넥 니트 · 주름치마 · 레그워머',preview:'./assets/models/may-school-sd-v2-preview.png',hairStyle:'bob',hair:0x987560,clothes:0x9b91a7,tie:0x77748f},
  {id:'zena',name:'제나',description:'빨간 베레모 · 긴 갈색 생머리 · 흰 티셔츠 · 붉은 체크치마',preview:'./assets/models/zena-sd-v2-preview.png',hairStyle:'long',hair:0x8a4f31,clothes:0xefeeea}
 ];
 const normalize=id=>{if(id==='minami-pink')id='minami';return profiles.some(p=>p.id===id)?id:'default';};
 return {profiles,normalize,get:id=>profiles.find(p=>p.id===normalize(id))||profiles[0]};
});
