const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require('ws');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const terrain = [
  ['wood','stone','food','wood'], ['food','knowledge','wood','stone'],
  ['stone','food','knowledge','food'], ['wood','stone','food','knowledge']
];
const tileNames = { wood:'杉木林', stone:'玄武岩台地', food:'潮汐滩涂', knowledge:'古代遗址' };
const terrainIcons = { wood:'♧', stone:'⬟', food:'≈', knowledge:'⌘' };
const projectCatalog = [
  {id:'survey-office',name:'联合测绘所',icon:'⌖',cost:{wood:1,knowledge:1,coins:2},description:'立即获得2影响力；每轮产出1知识。',prestige:2,production:'knowledge'},
  {id:'tide-gardens',name:'潮汐共生园',icon:'❋',cost:{wood:1,food:2},description:'生态 +2；每轮再修复1生态。',ecology:2,production:'ecology'},
  {id:'stone-guild',name:'石匠联合会',icon:'⬟',cost:{wood:1,stone:1,coins:1},description:'立即获得1影响力；每轮产出1石料。',prestige:1,production:'stone'},
  {id:'free-port',name:'自由港协定',icon:'⚓',cost:{wood:1,stone:1,coins:2},description:'立即获得1影响力；每轮增加2金币。',prestige:1,production:'coins'},
  {id:'seed-bank',name:'群岛种子库',icon:'❀',cost:{food:1,knowledge:2,coins:1},description:'生态 +1；每轮产出1食物并修复1生态。',ecology:1,production:'food-ecology'},
  {id:'star-atlas',name:'星潮天文台',icon:'✧',cost:{stone:2,knowledge:1,coins:2},description:'立即获得2影响力；每轮产出1知识与1金币。',prestige:2,production:'knowledge-coins'},
  {id:'watch-network',name:'海防灯标网',icon:'⚑',cost:{wood:2,stone:1,coins:2},description:'立即获得1影响力；防御设施须面对强度4的进攻。',prestige:1,production:'fort'}
];
const MAX_ROUNDS=16;
const charterCatalog = [
  {id:'first-survey',name:'先行测绘',description:'率先控制5块领土',type:'territory',target:5,reward:'影响力 +3'},
  {id:'living-shore',name:'生生海岸',description:'率先修复4点生态',type:'ecology',target:4,reward:'生态 +2'},
  {id:'guild-network',name:'工匠网络',description:'率先建成3座设施',type:'buildings',target:3,reward:'金币 +4'},
  {id:'archive-charter',name:'知识公约',description:'率先积累5份知识',type:'knowledge',target:5,reward:'影响力 +2、生态 +1'}
];
const byId = id => projectCatalog.find(c=>c.id===id);
function makeTiles() {
  const tiles=[];
  for(let r=-2;r<=2;r++)for(let q=-2;q<=2;q++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=2){
    const resource=q===-2?'wood':q===-1?'food':q===2?'knowledge':q===1?'food':['wood','stone','food','knowledge'][((q*11+r*7+31)%4+4)%4];
    tiles.push({id:`${q},${r}`,q,r,resource,name:tileNames[resource],owner:null,building:null,stored:0});
  }
  return tiles;
}
function freshRoom(code) {
  const deck=projectCatalog.map(c=>c.id).sort(()=>Math.random()-.5);
  return { code, projectDeck:deck.slice(3), players:[], state:{status:'waiting',round:1,active:0,turnCount:0,players:[],tiles:makeTiles(),projects:deck.slice(0,3),charters:charterCatalog.map(c=>({...c,claimedBy:null})),log:['北方风暴退去，群岛议会签署了《新岸宪章》。等待第二位拓荒者加入。'],winner:null,winReason:''} };
}
function publicState(room) { return {code:room.code,players:room.players.map(p=>({name:p.name})),state:{...room.state,projects:room.state.projects.map(byId)}}; }
function send(ws,payload) { if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(payload)); }
function broadcast(room) { room.players.forEach((p,playerIndex)=>send(p.ws,{type:'state',...publicState(room),playerIndex})); }
function log(s,text) { s.log.unshift(text); s.log=s.log.slice(0,24); }
function start(room) {
  const starts=[[{q:-2,r:0},{q:-1,r:0}],[{q:2,r:0},{q:1,r:0}]];
  room.state.status='playing';
  room.state.players=room.players.map((p,i)=>({name:p.name,color:i===0?'teal':'coral',coins:5,wood:2,stone:1,food:2,knowledge:1,prestige:0,ecology:0,score:0,actionRow:['gather','build','expand','project','council'],territory:2}));
  starts.forEach((tiles,i)=>tiles.forEach(pos=>{const t=room.state.tiles.find(a=>a.q===pos.q&&a.r===pos.r);t.owner=i;}));
  room.state.log=[`《新岸宪章》生效：${room.players[0].name}与${room.players[1].name}各自建立两处前哨。扩张、发展，决定群岛的未来。`];
}
function owned(s,idx) { return s.tiles.filter(t=>t.owner===idx); }
function adjacent(s,t,idx) { return s.tiles.some(n=>n.owner===idx&&[[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]].some(([dq,dr])=>n.q+dq===t.q&&n.r+dr===t.r)); }
function checkWinner(s,idx,reason) {
  s.status='finished'; s.winner=idx; s.winReason=reason;
  log(s,`${s.players[idx].name}以「${reason}」路线赢得群岛议会！`);
}
function testVictory(s,idx) {
  const p=s.players[idx];
  if(owned(s,idx).length>=9) checkWinner(s,idx,'领土霸权');
  else if(p.prestige>=12) checkWinner(s,idx,'群岛繁荣');
  else if(p.ecology>=10) checkWinner(s,idx,'生态复兴');
}
function claimCharters(s,idx) {
  const p=s.players[idx];
  for(const c of s.charters)if(c.claimedBy===null){
    const count=c.type==='territory'?owned(s,idx).length:c.type==='ecology'?p.ecology:c.type==='knowledge'?p.knowledge:owned(s,idx).filter(t=>t.building).length;
    if(count>=c.target){c.claimedBy=idx;if(c.type==='territory')p.prestige+=3;if(c.type==='ecology')p.ecology+=2;if(c.type==='buildings')p.coins+=4;if(c.type==='knowledge'){p.prestige+=2;p.ecology++;}log(s,`${p.name}率先完成公开契约「${c.name}」，奖励：${c.reward}。`);}
  }
}
function actionStrength(p,action) { const i=p.actionRow.indexOf(action); return i<0?1:i+1; }
function rotate(p,action) { const i=p.actionRow.indexOf(action); if(i>=0)p.actionRow.push(p.actionRow.splice(i,1)[0]); }
function pay(p,cost) { for(const [k,v] of Object.entries(cost)) if((p[k]||0)<v)return false; for(const [k,v] of Object.entries(cost))p[k]-=v; return true; }
function playProject(room,p,idx,data,strength,tile) {
  const s=room.state,card=byId(data.projectId);
  if(!card||!s.projects.includes(card.id))return '这张项目卡已被拿走，请刷新市场选择。';
  if(!tile||tile.owner!==idx)return '选择一块自己的空地安置项目。';
  if(tile.building)return '这块土地已有设施，项目需要一块空地。';
  const cost={...card.cost};cost.coins=Math.max(0,(cost.coins||0)-Math.floor((strength-1)/2));
  if(!pay(p,cost))return '材料不足，项目所需资源列在卡片上。';
  tile.building=`project:${card.id}`;p.prestige+=card.prestige||0;p.ecology+=card.ecology||0;
  s.projects.splice(s.projects.indexOf(card.id),1);if(room.projectDeck.length)s.projects.push(room.projectDeck.shift());
  log(s,`${p.name}在${tile.name}落成「${card.name}」：${card.description}`);
}
function act(room,idx,data) {
  const s=room.state;
  if(s.status!=='playing'||idx!==s.active)return '现在还不能行动。';
  const p=s.players[idx], action=data.action, tile=s.tiles.find(t=>t.id===data.tileId);
  if(!['gather','build','expand','project','council'].includes(action))return '这个行动不存在。';
  const strength=actionStrength(p,action);
  if(action==='gather') {
    if(!tile||tile.owner!==idx)return '采集资源需要选择自己的领地。';
    const amount=Math.min(strength,4); p[tile.resource]+=amount;
    if(tile.resource==='food')p.coins+=Math.max(1,Math.floor(strength/2));
    log(s,`${p.name}在${tile.name}采集${tileNames[tile.resource]} ×${amount}${tile.resource==='food'?'，并获得金币':''}。`);
  } else if(action==='build') {
    if(!tile||tile.owner!==idx)return '只能在自己的领地建造。';
    if(tile.building)return '这块领地已经有建筑。';
    const kind=data.building;
    const costs={lumber:{wood:2,coins:1},quarry:{wood:1,stone:2},farm:{wood:1,food:1},archive:{stone:1,knowledge:1,coins:1},fort:{wood:1,stone:1,coins:2},monument:{wood:2,stone:2,coins:2}};
    if(!costs[kind])return '请选择建筑类型。';
    if(!pay(p,costs[kind]))return '资源不足，看看建筑所需材料后先去采集。';
    tile.building=kind;
    const benefits={lumber:'wood',quarry:'stone',farm:'food',archive:'knowledge'};
    if(benefits[kind])p[benefits[kind]]+=strength;
    if(kind==='monument'){p.prestige+=3;p.score+=3;}
    if(kind==='fort'){p.prestige+=1;p.score+=1;}
    if(kind==='farm')p.ecology+=1;
    log(s,`${p.name}在${tile.name}建成${{lumber:'林场',quarry:'采石场',farm:'共生农庄',archive:'潮汐档案馆',fort:'守望堡',monument:'群岛纪念碑'}[kind]}${benefits[kind]?`，立即产出${benefits[kind]} ×${strength}`:''}。`);
  } else if(action==='expand') {
    if(!tile||tile.owner===idx)return '选择一块相邻的中立或敌方领地。';
    if(!adjacent(s,tile,idx))return '只能从自己的领地向相邻地块扩张。';
    const cost={coins:2+Math.floor((strength-1)/2),food:1};
    if(tile.owner!==null) {
      const defender=s.players[tile.owner];
      if((tile.building==='fort'||tile.building==='project:watch-network')&&strength<4)return '敌方的防御设施坚固；扩张行动强度需要达到4。';
      if(defender.prestige>p.prestige+strength)return '对方影响力太强，先发展自己的声望再来争夺。';
    }
    if(!pay(p,cost))return `扩张需要${cost.coins}金币与1份食物。`;
    if(tile.owner!==null) {
      if(tile.building==='fort'||tile.building==='project:watch-network')tile.building=null;
      log(s,`${p.name}夺取了${s.players[tile.owner].name}的${tile.name}！`);
    } else log(s,`${p.name}向${tile.name}建立了新前哨。`);
    tile.owner=idx;p.territory=owned(s,idx).length;
    if(tile.resource==='knowledge')p.knowledge++;
    if(tile.resource==='food')p.food++;
    log(s,`${p.name}扩张至${tile.name}（领土 ${p.territory} 处）。`);
  } else if(action==='project') {
    const error=playProject(room,p,idx,data,strength,tile);if(error)return error;
  } else {
    if(!pay(p,{coins:2,knowledge:1}))return '议会行动需要2金币和1份知识。';
    p.prestige+=strength;p.score+=strength;
    log(s,`${p.name}在议会发表提案，获得影响力 ${strength}。`);
  }
  p.territory=owned(s,idx).length;
  rotate(p,action);
  claimCharters(s,idx);
  testVictory(s,idx);
  if(s.status==='playing'){
    s.active=1-s.active;s.turnCount++;
    if(s.turnCount%2===0) {
      s.round++;
      if(s.round>MAX_ROUNDS) {
        const a=s.players[0],b=s.players[1];
        const score=q=>q.prestige+q.ecology*2+owned(s,s.players.indexOf(q)).length*2+owned(s,s.players.indexOf(q)).filter(t=>t.building).length;
        s.players.forEach(q=>q.score=score(q));
        s.status='finished';s.winner=s.players[0].score===s.players[1].score?null:(s.players[0].score>s.players[1].score?0:1);s.winReason=`${MAX_ROUNDS}轮终局计分`;
        log(s,s.winner===null?`${MAX_ROUNDS}轮结束，群岛议会以平局收场。`:`${s.players[s.winner].name}以${s.players[s.winner].score}分赢得${MAX_ROUNDS}轮终局。`);
      } else {
        s.players.forEach((q,i)=>{
          for(const t of owned(s,i)) {
            if(t.building==='lumber')q.wood++;
            if(t.building==='quarry')q.stone++;
            if(t.building==='farm'){q.food++;q.ecology++;}
            if(t.building==='archive')q.knowledge++;
            if(t.building==='fort')q.coins++;
            if(t.building?.startsWith('project:')){
              const c=byId(t.building.slice(8));
              if(c?.production==='knowledge'||c?.production==='knowledge-coins')q.knowledge++;
              if(c?.production==='stone')q.stone++;
              if(c?.production==='coins')q.coins+=2;
              if(c?.production==='knowledge-coins')q.coins++;
              if(c?.production==='food-ecology'){q.food++;q.ecology++;}
              if(c?.production==='ecology')q.ecology++;
            }
          }
          q.coins+=1;
          testVictory(s,i);
        });
        s.active=1-s.active;
        s.players.forEach((_,i)=>{claimCharters(s,i);if(s.status==='playing')testVictory(s,i);});
        if(s.status==='playing')log(s,`第${s.round}轮开始：领地设施与群岛项目生产资源，每位玩家获得1金币。`);
      }
    }
  }
  return null;
}
const gameServer=new WebSocket.Server({noServer:true});
gameServer.on('connection',ws=>{
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw);}catch{send(ws,{type:'error',message:'请求格式无效。'});return;}
    if(msg.type==='create'||msg.type==='join'){
      let room;
      if(msg.type==='create'){let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));room=freshRoom(code);rooms.set(code,room);}
      else room=rooms.get(String(msg.code||'').trim().toUpperCase());
      if(!room){send(ws,{type:'error',message:'没有找到这个房间号。'});return;}
      if(room.players.length>=2){send(ws,{type:'error',message:'这个房间已经坐满了。'});return;}
      room.players.push({ws,name:String(msg.name||'').trim().slice(0,14)||`拓荒者 ${room.players.length+1}`});
      if(room.players.length===2)start(room);ws.room=room;broadcast(room);return;
    }
    const room=ws.room;if(!room){send(ws,{type:'error',message:'请先创建或加入房间。'});return;}
    if(msg.type==='act'){const error=act(room,currentPlayer(room,ws),msg);if(error)send(ws,{type:'error',message:error});else broadcast(room);}
    if(msg.type==='rematch'&&room.state.status==='finished'&&room.players.length===2){const fresh=freshRoom(room.code);room.state=fresh.state;room.projectDeck=fresh.projectDeck;start(room);broadcast(room);}
  });
  ws.on('close',()=>{const room=ws.room;if(!room)return;room.players=room.players.filter(p=>p.ws!==ws);if(!room.players.length)rooms.delete(room.code);else{room.state.status='waiting';room.state.log=[`${room.players[0].name}留在房间中，等待对手重新加入。`];broadcast(room);}});
});
function currentPlayer(room,ws){return room.players.findIndex(p=>p.ws===ws);}
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname),requested=pathname==='/'?'/index.html':pathname,file=path.resolve(ROOT,`.${requested}`);
  if(!file.startsWith(ROOT+path.sep)&&file!==path.join(ROOT,'index.html')){res.writeHead(403).end('Forbidden');return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
});
server.on('upgrade',(req,socket,head)=>gameServer.handleUpgrade(req,socket,head,ws=>gameServer.emit('connection',ws,req)));
server.listen(PORT,'0.0.0.0',()=>console.log(`群岛议会运行中：http://localhost:${PORT}`));
