const COLORS=['crimson','azure','jade','amber','violet'];
const COLOR_NAMES={crimson:'绯晶',azure:'潮蓝',jade:'藤玉',amber:'日珀',violet:'夜紫'};
const ICONS={crimson:'◆',azure:'◆',jade:'◆',amber:'◆',violet:'◆',prism:'✦'};
const PREFIXES=['远星','潮汐','雾林','长昼','深海','月陨','苍穹','赤砂','风暴','晨雾','夜航','古脉'];
const NOUNS=['工坊','切割所','商路','观测台','灯室','矿署','晶库','航会','熔炉','织坊','远站','珍藏馆'];
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function makeDeck(){const catalog={};const decks={1:[],2:[],3:[]};let id=0;
  for(let tier=1;tier<=3;tier++)for(let i=0;i<20;i++){
    const bonus=COLORS[(i+tier-1)%COLORS.length];
    const cost=Object.fromEntries(COLORS.map((c,j)=>[c,0]));
    const total=tier===1?3+(i%2):tier===2?5+(i%2):7+(i%2);
    for(let n=0;n<total;n++){const c=COLORS[(i*2+n+tier)%COLORS.length];cost[c]++;}
    cost[bonus]=Math.max(0,cost[bonus]-1);
    for(let n=0;n<tier;n++)cost[COLORS[(i+n+2)%5]]++;
    const points=tier===1?(i%7===0?1:0):tier===2?1+(i%3===0?1:0):3+(i%2);
    const card={id:`d${++id}`,tier,name:`${PREFIXES[(i+tier*2)%PREFIXES.length]}${NOUNS[(i*3+tier)%NOUNS.length]}`,bonus,points,cost};
    catalog[card.id]=card;decks[tier].push(card.id);
  }
  Object.values(decks).forEach(shuffle);return {catalog,decks};
}
const PATRONS=[
  {id:'patron-tide',name:'潮汐领航人',requires:{crimson:3,azure:3},points:3},
  {id:'patron-grove',name:'青枝学者',requires:{jade:3,amber:3},points:3},
  {id:'patron-dawn',name:'晨光藏家',requires:{violet:3,crimson:3},points:3},
  {id:'patron-orbit',name:'星轨测绘师',requires:{azure:3,jade:3},points:3},
  {id:'patron-ember',name:'余烬赞助人',requires:{amber:3,violet:3},points:3},
  {id:'patron-weaver',name:'光谱织造者',requires:{crimson:4,jade:3},points:3}
];
function freshRoom(code){const {catalog,decks}=makeDeck();return {code,game:'gem',players:[],catalog,decks,state:{status:'waiting',turn:0,active:0,players:[],bank:Object.fromEntries([...COLORS.map(c=>[c,5]),['prism',5]]),market:{1:[],2:[],3:[]},patrons:[],log:['星桥贸易季即将开启，等待另一位晶石商人入席。'],winner:null,finalPlayer:null}};}
function start(room,names){const s=room.state;s.status='playing';s.players=names.map((name,index)=>({name,color:index===0?'teal':'coral',gems:Object.fromEntries(COLORS.map(c=>[c,0])),prism:0,bonuses:Object.fromEntries(COLORS.map(c=>[c,0])),cards:[],reserved:[],points:0,nobles:[]}));
  for(const tier of [1,2,3])for(let i=0;i<4;i++){const id=room.decks[tier].pop();if(id)s.market[tier].push(id);}
  s.patrons=shuffle([...PATRONS]).slice(0,3).map(p=>({...p}));s.active=0;s.turn=0;s.log=[`星桥贸易季开幕：${names[0]}与${names[1]}开始争夺稀有晶脉与赞助人的青睐。`];
}
function fail(message){return message;}
function totalTokens(p){return Object.values(p.gems).reduce((a,b)=>a+b,0)+p.prism;}
function refill(room,tier){const id=room.decks[tier].pop();if(id)room.state.market[tier].push(id);}
function cardInRoom(room,id){return room.catalog[id];}
function canPay(p,card){let needPrism=0;for(const c of COLORS)needPrism+=Math.max(0,card.cost[c]-p.bonuses[c]-p.gems[c]);return needPrism<=p.prism;}
function pay(p,card){let used=0;for(const c of COLORS){const due=Math.max(0,card.cost[c]-p.bonuses[c]);const regular=Math.min(due,p.gems[c]);p.gems[c]-=regular;used+=due-regular;}p.prism-=used;}
function patronEligible(p,patron){return COLORS.every(c=>p.bonuses[c]>=(patron.requires[c]||0));}
function visitPatron(s,p){const patron=s.patrons.find(n=>patronEligible(p,n));if(!patron)return; s.patrons=s.patrons.filter(n=>n.id!==patron.id);p.nobles.push(patron.id);p.points+=patron.points;s.log.unshift(`${p.name}获得「${patron.name}」的支持，声望 +${patron.points}。`);}
function endMatch(s){s.status='finished';const order=s.players.map((p,i)=>({i,p})).sort((a,b)=>b.p.points-a.p.points||b.p.cards.length-a.p.cards.length);s.winner=order[0].i;s.log.unshift(`${s.players[s.winner].name}以${s.players[s.winner].points}点声望赢得星桥贸易季！`);}
function advance(room,idx){const s=room.state,p=s.players[idx];visitPatron(s,p);s.turn++;
  if(s.finalPlayer!==null&&idx!==s.finalPlayer){endMatch(s);return;}
  if(s.finalPlayer===null&&p.points>=15){s.finalPlayer=idx;s.log.unshift(`${p.name}声望达到15，贸易季进入最后一轮；对手还可行动一次。`);}
  s.active=1-idx;
}
function act(room,idx,msg){const s=room.state;if(s.status!=='playing'||idx!==s.active)return fail('现在不是你的行动回合。');const p=s.players[idx],action=msg.action;
  if(action==='take'){
    const picks=Array.isArray(msg.tokens)?msg.tokens:[];if(!picks.length||picks.length>3)return fail('请选择1到3枚晶石。');if(picks.some(c=>!COLORS.includes(c)))return fail('晶石类别无效。');
    const unique=[...new Set(picks)];if(unique.length===1&&picks.length===2){if(s.bank[unique[0]]<4)return fail('拿取两枚同色晶石时，公用储备至少要有4枚。');}
    else if(unique.length!==picks.length||picks.length!==3)return fail('请选择三种不同颜色，或在储备充足时拿两枚同色。');
    if(picks.some(c=>s.bank[c]<(picks.filter(x=>x===c).length)))return fail('公用储备中的该色晶石不足。');
    if(totalTokens(p)+picks.length>10)return fail('晶石上限为10枚；先用掉或预留空间再拿取。');
    for(const c of picks){s.bank[c]--;p.gems[c]++;}s.log.unshift(`${p.name}拿取了${picks.map(c=>COLOR_NAMES[c]).join('、')}。`);
  } else if(action==='buy'){
    const card=cardInRoom(room,msg.cardId);if(!card)return fail('找不到这张发展卡。');const reserved=msg.reserved===true;
    if(reserved){if(!p.reserved.includes(card.id))return fail('这不是你预留的卡。');}
    else if(!s.market[card.tier].includes(card.id))return fail('这张卡刚被对手购买，请重新选择。');
    if(!canPay(p,card))return fail('晶石不足。开发卡片提供的永久折扣后，仍不够支付这张卡。');
    pay(p,card);p.bonuses[card.bonus]++;p.points+=card.points;p.cards.push(card.id);
    if(reserved)p.reserved=p.reserved.filter(id=>id!==card.id);else{s.market[card.tier].splice(s.market[card.tier].indexOf(card.id),1);refill(room,card.tier);}
    s.log.unshift(`${p.name}购入「${card.name}」，获得${COLOR_NAMES[card.bonus]}折扣${card.points?`与${card.points}点声望`:''}。`);
  } else if(action==='reserve'){
    if(p.reserved.length>=3)return fail('最多预留3张发展卡。');let cardId=msg.cardId;
    if(cardId){const card=cardInRoom(room,cardId);if(!card||!s.market[card.tier].includes(cardId))return fail('这张卡已不在市场。');s.market[card.tier].splice(s.market[card.tier].indexOf(cardId),1);refill(room,card.tier);}
    else {const tier=Number(msg.tier);if(![1,2,3].includes(tier)||!room.decks[tier].length)return fail('该牌堆已经抽完。');cardId=room.decks[tier].pop();}
    p.reserved.push(cardId);const gotPrism=s.bank.prism>0;if(gotPrism){s.bank.prism--;p.prism++;}
    s.log.unshift(`${p.name}预留了一张发展卡${gotPrism?'，并取得一枚星砂':''}。`);
  } else return fail('未知行动。');
  advance(room,idx);return null;
}
function publicState(room,playerIndex){const source=room.state.players.length?room.state.players:room.players.map((p,i)=>({name:p.name,color:i?'coral':'teal',gems:Object.fromEntries(COLORS.map(c=>[c,0])),prism:0,bonuses:Object.fromEntries(COLORS.map(c=>[c,0])),cards:[],reserved:[],reservedCount:0,points:0,nobles:[]}));const players=source.map((p,i)=>({...p,reserved:playerIndex===i?[...p.reserved]:[],reservedCount:p.reserved.length}));const visibleIds=new Set([...Object.values(room.state.market).flat(),...source.flatMap(p=>p.cards),...(source[playerIndex]?.reserved||[])]);const catalog=Object.fromEntries([...visibleIds].map(id=>[id,room.catalog[id]]));return {code:room.code,game:'gem',players:room.players.map(p=>({name:p.name})),playerIndex,state:{...room.state,players,catalog,decksLeft:Object.fromEntries([1,2,3].map(t=>[t,room.decks[t].length]))}};}
module.exports={freshRoom,start,act,publicState};
