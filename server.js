const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require('ws');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(ROOT, `.${requested}`);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const islands = [
  { id: 'pearl', name: '珍珠港', points: 3, x: 50, y: 16, icon: '✦' },
  { id: 'mango', name: '芒果岛', points: 2, x: 21, y: 39, icon: '◈' },
  { id: 'coral', name: '珊瑚礁', points: 2, x: 78, y: 39, icon: '❋' },
  { id: 'turtle', name: '龟背岛', points: 3, x: 33, y: 70, icon: '⬟' },
  { id: 'lighthouse', name: '灯塔岛', points: 3, x: 68, y: 70, icon: '⌂' },
];

function freshRoom(code) {
  return { code, players: [], state: { status: 'waiting', round: 1, active: 0, actionsLeft: 3, selectedIsland: null, players: [], islands: islands.map(i => ({ ...i, fleets: [0, 0], forts: [0, 0], owner: null })), log: ['欢迎来到群岛议会。等待第二位航海家加入。'] } };
}
function publicState(room) {
  return { code: room.code, players: room.players.map(p => ({ name: p.name })), state: room.state };
}
function send(ws, payload) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); }
function broadcast(room) { room.players.forEach((p, playerIndex) => { if (p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify({ type: 'state', ...publicState(room), playerIndex })); }); }
function currentPlayer(room, ws) { return room.players.findIndex(p => p.ws === ws); }
function start(room) {
  room.state.status = 'playing';
  room.state.players = room.players.map((p, i) => ({ name: p.name, color: i === 0 ? 'teal' : 'coral', score: 0, coins: 5, fleetsLeft: 9 }));
  room.state.log = [`${room.players[0].name} 与 ${room.players[1].name} 已准备就绪。争夺六轮后，胜利点较高者获胜！`];
}
function recount(room) {
  for (const island of room.state.islands) {
    const a = island.fleets[0] + island.forts[0] * 2;
    const b = island.fleets[1] + island.forts[1] * 2;
    island.owner = a === b ? null : a > b ? 0 : 1;
  }
}
function finishTurn(room) {
  const s = room.state;
  if (s.actionsLeft > 0) return;
  s.active = 1 - s.active;
  s.actionsLeft = 3;
  if (s.active === 0) {
    for (const island of s.islands) if (island.owner !== null) s.players[island.owner].score += island.points;
    s.log.unshift(`第 ${s.round} 轮结算：控制的岛屿已获得胜利点。`);
    if (s.round >= 6 || s.players.some(p => p.score >= 24)) {
      s.status = 'finished';
      const winner = s.players[0].score === s.players[1].score ? null : s.players[0].score > s.players[1].score ? 0 : 1;
      s.winner = winner;
      s.log.unshift(winner === null ? '六轮结束，双方势均力敌，平局！' : `${s.players[winner].name} 成为群岛议会的最终赢家！`);
    } else {
      s.round += 1;
      s.players.forEach(p => { p.coins += 3; p.fleetsLeft += 2; });
      s.log.unshift(`第 ${s.round} 轮开始：每位玩家获得 3 枚金币与 2 支船队。`);
    }
  }
}
function act(room, idx, data) {
  const s = room.state;
  if (s.status !== 'playing' || idx !== s.active || !Number.isInteger(s.actionsLeft) || s.actionsLeft < 1) return '现在还不能行动。';
  const island = s.islands.find(i => i.id === data.islandId);
  const player = s.players[idx];
  if (!island) return '请先选择一座岛屿。';
  if (data.action === 'sail') {
    if (player.fleetsLeft < 1) return '没有可部署的船队了。';
    if (island.fleets[idx] >= 5) return '这座岛上的船队已达上限。';
    island.fleets[idx] += 1; player.fleetsLeft -= 1;
    s.log.unshift(`${player.name} 派出一支船队前往${island.name}。`);
  } else if (data.action === 'fortify') {
    if (player.coins < 3) return '金币不足，建造灯塔需要 3 枚金币。';
    if (island.forts[idx] >= 2) return '这座岛最多建造两座灯塔。';
    if (island.fleets[idx] < 1) return '先派一支自己的船队到岛上，才能建造灯塔。';
    island.forts[idx] += 1; player.coins -= 3;
    s.log.unshift(`${player.name} 在${island.name}建造了一座灯塔（守势 +2）。`);
  } else return '未知行动。';
  recount(room);
  s.actionsLeft -= 1;
  finishTurn(room);
  return null;
}

wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { send(ws, { type: 'error', message: '请求格式无效。' }); return; }
    if (msg.type === 'create' || msg.type === 'join') {
      let room;
      if (msg.type === 'create') {
        let code; do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
        room = freshRoom(code); rooms.set(code, room);
      } else room = rooms.get(String(msg.code || '').trim().toUpperCase());
      if (!room) { send(ws, { type: 'error', message: '没有找到这个房间号，请检查后重试。' }); return; }
      if (room.players.length >= 2) { send(ws, { type: 'error', message: '这个房间已经坐满了。' }); return; }
      if (room.players.length && room.players[0].ws === ws) { send(ws, { type: 'error', message: '你已经在这个房间里。' }); return; }
      const name = String(msg.name || '').trim().slice(0, 14) || `航海家 ${room.players.length + 1}`;
      room.players.push({ ws, name });
      if (room.players.length === 2) start(room);
      broadcast(room);
      ws.room = room;
      return;
    }
    const room = ws.room;
    if (!room) { send(ws, { type: 'error', message: '请先创建或加入房间。' }); return; }
    if (msg.type === 'act') {
      const idx = currentPlayer(room, ws);
      const error = act(room, idx, msg);
      if (error) send(ws, { type: 'error', message: error });
      else broadcast(room);
    } else if (msg.type === 'rematch' && room.state.status === 'finished' && room.players.length === 2) {
      room.state = freshRoom(room.code).state; start(room); broadcast(room);
    }
  });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    room.players = room.players.filter(p => p.ws !== ws);
    if (!room.players.length) rooms.delete(room.code);
    else {
      room.state.status = 'waiting';
      room.state.log = [`${room.players[0].name} 留在房间中，等待对手重新加入。`];
      broadcast(room);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`群岛议会运行中：http://localhost:${PORT}`));
