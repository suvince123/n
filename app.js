const lobby = document.querySelector('#lobby');
const game = document.querySelector('#game');
const toast = document.querySelector('#toast');
let socket;
let roomCode = '';
let myIndex = -1;
let gameState = null;
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function ensureSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${scheme}://${location.host}`);
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('连不上游戏服务器，请稍后重试。'));
    socket.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'error') notify(msg.message);
      if (msg.type === 'state') render(msg);
    };
    socket.onclose = () => { if (roomCode) notify('与房间的连接已断开，刷新页面后重新加入。'); };
  });
}
function send(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
async function enterRoom(type) {
  const name = document.querySelector('#player-name').value.trim() || '航海家';
  const code = document.querySelector('#room-code').value.trim().toUpperCase();
  if (type === 'join' && code.length !== 6) { notify('房间号是 6 位字母或数字。'); return; }
  try {
    await ensureSocket();
    send(type === 'create' ? { type, name } : { type, name, code });
  } catch (err) { notify(err.message); }
}
document.querySelector('#create-room').addEventListener('click', () => enterRoom('create'));
document.querySelector('#join-room').addEventListener('click', () => enterRoom('join'));
document.querySelector('#room-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
document.querySelector('#room-code').addEventListener('keydown', event => { if (event.key === 'Enter') enterRoom('join'); });
document.querySelectorAll('.island-node').forEach(node => node.addEventListener('click', () => {
  document.querySelectorAll('.island-node').forEach(n => n.classList.toggle('selected', n === node));
  const selected = gameState?.state.islands.find(i => i.id === node.dataset.island);
  const msg = selected ? `${selected.name} · 控制者：${selected.owner === null ? '无人' : gameState.players[selected.owner].name} · 船队 ${selected.fleets[0]} : ${selected.fleets[1]} · 灯塔 ${selected.forts[0]} : ${selected.forts[1]}` : '选择一座岛屿，然后部署船队或建造灯塔。';
  document.querySelector('#island-tooltip').textContent = msg;
}));
document.querySelector('#sail-action').addEventListener('click', () => perform('sail'));
document.querySelector('#fortify-action').addEventListener('click', () => perform('fortify'));
function perform(action) {
  const selected = document.querySelector('.island-node.selected');
  if (!selected) { notify('先在海图上选择一座岛屿。'); return; }
  send({ type: 'act', action, islandId: selected.dataset.island });
}
document.querySelector('#copy-room').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(roomCode); notify('房间号已复制，发给朋友吧！'); }
  catch { notify(`房间号：${roomCode}`); }
});
function render(payload) {
  roomCode = payload.code;
  gameState = payload;
  myIndex = payload.playerIndex;
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  const s = payload.state;
  document.querySelector('#room-display').textContent = roomCode;
  document.querySelector('#round-label').textContent = s.status === 'waiting' ? '等待玩家' : `第 ${s.round} 轮`;
  document.querySelector('#round-number').textContent = s.status === 'waiting' ? '—' : s.round;
  document.querySelector('#board-heading').textContent = s.status === 'waiting' ? '等待第二位玩家登船' : s.status === 'finished' ? '航海旅程结束' : `第 ${s.round} 轮 · 群岛争夺战`;
  payload.players.forEach((p, i) => {
    document.querySelector(`#player-name-${i}`).textContent = p.name;
    document.querySelector(`#player-card-${i}`).classList.toggle('active', s.status === 'playing' && s.active === i);
    document.querySelector(`#turn-${i}`).textContent = s.active === i ? '行动中' : '待命';
  });
  if (s.status === 'playing' || s.status === 'finished') s.players.forEach((p, i) => {
    document.querySelector(`#score-${i}`).textContent = p.score;
    document.querySelector(`#fleets-${i}`).textContent = p.fleetsLeft;
    document.querySelector(`#coins-${i}`).textContent = p.coins;
  });
  s.islands.forEach(island => {
    const node = document.querySelector(`[data-island="${island.id}"]`);
    node.classList.toggle('owner-0', island.owner === 0);
    node.classList.toggle('owner-1', island.owner === 1);
    const stack = node.querySelector('.fleet-stack');
    stack.innerHTML = '';
    for (let n = 0; n < island.fleets[0]; n++) stack.insertAdjacentHTML('beforeend', '<span class="ship-token p0">✦</span>');
    for (let n = 0; n < island.fleets[1]; n++) stack.insertAdjacentHTML('beforeend', '<span class="ship-token p1">✦</span>');
    node.querySelector('.fort-mark').textContent = '⌂'.repeat(island.forts[0]) + '⌂'.repeat(island.forts[1]);
  });
  const mine = s.status === 'playing' && s.active === myIndex;
  document.querySelector('#action-turn').textContent = s.status === 'waiting' ? '等待对手加入' : mine ? '轮到你了' : s.status === 'finished' ? '本局已结束' : `等待 ${s.players[s.active]?.name || '对手'}`;
  document.querySelector('#actions-left').textContent = s.status === 'playing' ? `剩余 ${s.actionsLeft} 次行动` : '';
  document.querySelector('#sail-action').disabled = !mine;
  document.querySelector('#fortify-action').disabled = !mine;
  const list = document.querySelector('#log-list');
  list.innerHTML = s.log.slice(0, 10).map(entry => `<div class="log-entry">${escapeHtml(entry)}</div>`).join('');
  if (s.status === 'finished' && !document.querySelector('#end-modal').dataset.shown) {
    document.querySelector('#end-modal').dataset.shown = 'yes';
    document.querySelector('#end-title').textContent = s.winner === null ? '这场航海，势均力敌' : `${s.players[s.winner].name} 赢得群岛议会`;
    document.querySelector('#end-copy').textContent = `${s.players[0].name} ${s.players[0].score} 分 · ${s.players[1].name} ${s.players[1].score} 分`;
    document.querySelector('#end-modal').classList.remove('hidden');
  }
}
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
document.querySelector('#rematch-button').addEventListener('click', () => { document.querySelector('#end-modal').classList.add('hidden'); delete document.querySelector('#end-modal').dataset.shown; send({ type: 'rematch' }); });
const rules = document.querySelector('#rules-modal');
document.querySelector('#help-open').addEventListener('click', () => rules.classList.remove('hidden'));
document.querySelector('#help-open-bottom').addEventListener('click', () => rules.classList.remove('hidden'));
document.querySelector('#modal-close').addEventListener('click', () => rules.classList.add('hidden'));
document.querySelector('#modal-close-backdrop').addEventListener('click', () => rules.classList.add('hidden'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') { rules.classList.add('hidden'); document.querySelector('#end-modal').classList.add('hidden'); } });
