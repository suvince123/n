const assert = require('node:assert/strict');
const PropertyEngine = require('../property-engine');

function makeRoom(count = 2) {
  const room = PropertyEngine.freshRoom('TEST01', count);
  room.players = Array.from({length: count}, (_, i) => ({name: `Player ${i + 1}`}));
  PropertyEngine.start(room, room.players.map((player) => player.name));
  return room;
}

function withDice(randomValues, callback) {
  const originalRandom = Math.random;
  let i = 0;
  Math.random = () => randomValues[i++];
  try { callback(); }
  finally { Math.random = originalRandom; }
}

function testBoardAndTurnRules() {
  const room = PropertyEngine.freshRoom('BOARD', 4);
  assert.equal(room.state.board.length, 40);
  assert.equal(room.maxPlayers, 4);
  assert.equal(PropertyEngine.freshRoom('CLAMP', 2.8).maxPlayers, 2);
  room.players = [{name:'A'}, {name:'B'}, {name:'C'}, {name:'D'}];
  PropertyEngine.start(room, room.players.map((player) => player.name));
  assert.equal(room.state.board[4].amount, 2000);
  assert.equal(room.state.board[38].amount, 1000);
  assert.equal(PropertyEngine.act(room, 1, {action:'roll'}), '现在不是你的回合。');
}

function testRentAndTax() {
  const room = makeRoom();
  const {state} = room;
  state.board[1].owner = 1;
  state.board[3].owner = 1;
  assert.equal(state.board[3].rents[0], 50);
  withDice([0, 1 / 6], () => PropertyEngine.act(room, 0, {action:'roll'}));
  assert.equal(state.players[0].cash, 14900, 'full color set doubles base rent');
  assert.equal(state.active, 1);

  const taxRoom = makeRoom();
  withDice([0, 1 / 3], () => PropertyEngine.act(taxRoom, 0, {action:'roll'}));
  assert.equal(taxRoom.state.players[0].cash, 13000, 'landing on the port tax charges the listed amount');

  const utilityRoom = makeRoom();
  utilityRoom.state.board[12].owner = 1;
  utilityRoom.state.board[28].owner = 1;
  withDice([5 / 6, 5 / 6], () => PropertyEngine.act(utilityRoom, 0, {action:'roll'}));
  assert.equal(utilityRoom.state.players[0].cash, 13800, 'owning both utilities charges ten times the dice total');
}

function testBuildingsAndDebt() {
  const room = makeRoom();
  const {state} = room;
  for (const index of [1, 3, 5, 6, 8, 9]) state.board[index].owner = 0;
  assert.equal(PropertyEngine.act(room, 0, {action:'build', spaceId:'lot-1'}), null);
  assert.equal(state.board[1].houses, 1);
  assert.equal(state.players[0].cash, 14500);
  state.phase = 'debt';
  state.debt = {debtor:0, creditor:null, amount:500, reason:'test debt'};
  assert.equal(PropertyEngine.act(room, 0, {action:'mortgage', spaceId:'rail-5'}), null);
  assert.equal(state.players[0].cash, 15000);
  assert.equal(state.phase, 'roll', 'settling debt resumes the interrupted turn');
  assert.equal(state.active, 1);
}

function testFourPlayerAuction() {
  const room = makeRoom(4);
  const {state} = room;
  state.phase = 'buy';
  state.pending = {space:6, player:1};
  assert.equal(PropertyEngine.act(room, 1, {action:'auction'}), null);
  assert.equal(PropertyEngine.act(room, 1, {action:'bid', amount:800}), null);
  assert.equal(PropertyEngine.act(room, 2, {action:'pass'}), null);
  assert.equal(PropertyEngine.act(room, 3, {action:'bid', amount:900}), null);
  assert.equal(PropertyEngine.act(room, 0, {action:'pass'}), null);
  assert.equal(PropertyEngine.act(room, 1, {action:'bid', amount:1000}), null);
  assert.equal(PropertyEngine.act(room, 3, {action:'pass'}), null);
  assert.equal(state.board[6].owner, 1);
  assert.equal(state.players[1].cash, 14000);
}

function testNegotiatedTradeAndBankruptcy() {
  const room = makeRoom(3);
  const {state} = room;
  state.board[1].owner = 0;
  state.board[6].owner = 1;
  assert.equal(PropertyEngine.act(room, 0, {action:'offerTrade', to:1, giveProperty:'lot-1', wantProperty:'lot-6', giveCash:500, wantCash:200}), null);
  assert.equal(PropertyEngine.act(room, 1, {action:'tradeAnswer', accept:true}), null);
  assert.equal(state.board[1].owner, 1);
  assert.equal(state.board[6].owner, 0);
  assert.equal(state.players[0].cash, 14700);
  assert.equal(state.players[1].cash, 15300);

  const bankruptRoom = makeRoom();
  const bs = bankruptRoom.state;
  bs.board[1].owner = 0;
  bs.board[1].houses = 1;
  bs.players[0].cash = 100;
  bs.phase = 'debt';
  bs.debt = {debtor:0, creditor:1, amount:1000, reason:'test insolvency'};
  assert.equal(PropertyEngine.act(bankruptRoom, 0, {action:'bankrupt'}), null);
  assert.equal(bs.board[1].owner, 1);
  assert.equal(bs.players[0].bankrupt, true);
  assert.equal(bs.winner, 1);
}

testBoardAndTurnRules();
testRentAndTax();
testBuildingsAndDebt();
testFourPlayerAuction();
testNegotiatedTradeAndBankruptcy();
console.log('Property engine tests passed: board, turns, rent, taxes, construction, debt, auction, trade and bankruptcy.');
