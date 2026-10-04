(() => {
  const propRoot = document.createElement('section');
  propRoot.id = 'property-game';
  propRoot.className = 'prop-shell hidden';
  propRoot.innerHTML = `
    <div class="prop-hint"><i>⌂</i><div><strong id="prop-hint-title">等待玩家入席</strong><small id="prop-hint-copy">分享房间号，大家到齐后开局。</small></div><span id="prop-hint-badge">准备中</span><div class="prop-room">房间 <b id="prop-room-code">------</b> <button id="prop-copy-room">复制</button></div></div>
    <header class="prop-head"><div><small class="kicker">THE BAYFRONT ESTATES · PROPERTY SEASON</small><h1>海湾地产局</h1><p>掷骰前进 · 买地经营 · 竞价交易 · 争夺海湾街区</p></div><span class="prop-season" id="prop-season">海湾新一季</span></header>
    <div class="prop-layout">
      <section class="prop-board-panel"><div class="prop-board-title"><b>海湾环线 · 40处街区</b><small>经过启航点领取 2,000 海贝</small><span class="prop-dice" id="prop-dice">— · —</span></div><div class="prop-board" id="prop-board"></div><div class="prop-board-legend" id="prop-board-legend"></div></section>
      <aside class="prop-sidebar">
        <section class="prop-card"><div class="prop-card-title"><b>玩家资产</b><small id="prop-seat-count">等待入席</small></div><div class="prop-players" id="prop-player-list"></div></section>
        <section class="prop-card"><div class="prop-card-title"><b>当前步骤</b><small id="prop-phase-label">准备中</small></div><div class="prop-control" id="prop-controls"></div><div class="prop-bank-line" id="prop-bank-line"></div></section>
        <section class="prop-card"><div class="prop-card-title"><b>名下街区</b><small>建房、抵押、赎回</small></div><div class="prop-assets" id="prop-assets"></div></section>
        <section class="prop-card"><div class="prop-card-title"><b>谈判桌</b><small>地产与海贝自由议价</small></div><div class="prop-trade" id="prop-trade"></div></section>
        <section class="prop-card"><div class="prop-card-title"><b>海湾纪事</b><small>最近发生</small></div><div class="prop-log" id="prop-log"></div></section>
      </aside>
    </div>
    <div class="prop-end hidden" id="prop-end"><article><small>地产季结算</small><h2 id="prop-end-title">海湾新主人</h2><p id="prop-end-copy"></p><button id="prop-rematch">再开一局</button></article></div>`;
  const propFooter = document.querySelector('main footer');
  document.querySelector('.shell').insertBefore(propRoot, propFooter);
  const helpModal = $('#help-modal');
  const originalHelp = {
    kicker: helpModal.querySelector('.kicker').textContent,
    heading: helpModal.querySelector('h2').textContent,
    sections: [...helpModal.querySelectorAll('section')].map((section) => [section.querySelector('b').textContent, section.querySelector('p').textContent])
  };

  let propData = null;
  const colors = ['#438c78', '#d0795d', '#6f83ac', '#aa77a0'];
  const $p = (s) => propRoot.querySelector(s);
  const safe = (x) => escapeHtml(String(x ?? ''));
  const money = (n) => `${Number(n || 0).toLocaleString('zh-CN')} 海贝`;
  const holdings = (idx) => (propData?.state.board || []).filter((x) => x.owner === idx);
  const coordinates = (i) => {
    if (i === 0) return [11, 11];
    if (i <= 9) return [11, 11 - i];
    if (i === 10) return [11, 1];
    if (i <= 19) return [21 - i, 1];
    if (i === 20) return [1, 1];
    if (i <= 29) return [1, i - 19];
    if (i === 30) return [1, 11];
    return [i - 29, 11];
  };
  const icon = (x) => ({go:'⚓',chance:'✦',chest:'❀',tax:'◈',jail:'▥',parking:'◉',goJail:'⚑',rail:'↔',utility:'⚙'})[x.type] || '⌂';
  const buildings = (x) => x.hotel ? '旅店' : x.houses ? '⌂'.repeat(x.houses) : '';

  function showPropertyRules() {
    const modal = $('#help-modal');
    modal.querySelector('.kicker').textContent = 'THE BAYFRONT ESTATES';
    modal.querySelector('h2').textContent = '买下街区，经营你的海湾版图。';
    const text = [
      '轮到你时掷两枚骰子，按点数沿40处环形棋盘前进。经过“启航”领取2000海贝；落在无人地产可购买或发起公开竞价，落在他人地产则按地契支付租金。',
      '集齐同色街区后可在自己的回合均衡建造房屋，升级旅店以提高租金。铁路越多租金越高；两处公共设施的租金按骰点计算。房屋与旅店数量受公共库存限制。',
      '可以向其他玩家提出地产与海贝交易；也可出售建筑、抵押地产筹集现金，再用略高于抵押额的价格赎回。进入监所后可尝试掷对子、支付保释金或使用免罚通行券。',
      '无力支付到期债务时，可先出售建筑或抵押地产；仍无法清偿则宣布破产并退出。最后仍未破产的玩家获胜。名称、插画、版图和事件卡均为本项目原创。'
    ];
    modal.querySelectorAll('section').forEach((section, i) => {
      section.querySelector('b').textContent = ['你的回合','购地与建设','交易与监所','破产与胜利'][i];
      section.querySelector('p').textContent = text[i];
    });
    modal.classList.remove('hidden');
  }

  function draw(m) {
    propData = m;
    const s = m.state;
    const players = s.players || [];
    const me = players[m.playerIndex];
    const waiting = s.status === 'waiting';
    const active = s.status === 'playing' && s.active === m.playerIndex;
    const phase = s.phase;

    propRoot.classList.remove('hidden');
    $('#home').classList.add('hidden');
    $('#lobby').classList.add('hidden');
    $('#game').classList.add('hidden');
    $('#gem-game').classList.add('hidden');
    propFooter.classList.add('hidden');
    $('#brand-copy').innerHTML = '海湾地产局 <small>地产竞逐季</small>';
    $('#round-label').textContent = waiting ? '等待玩家' : s.status === 'finished' ? '地产季结算' : `第 ${s.turn + 1} 次行动`;
    $('#back-home').classList.add('hidden');
    $p('#prop-room-code').textContent = m.code;
    $p('#prop-season').textContent = waiting ? `${m.players.length}/${m.maxPlayers} 位玩家已入席` : s.status === 'finished' ? '本局已结束' : `${players.filter((p) => !p.bankrupt).length} 位地产家仍在场`;
    $p('#prop-seat-count').textContent = waiting ? `${m.players.length}/${m.maxPlayers} 已入席` : `${m.maxPlayers} 人对局`;

    $p('#prop-player-list').innerHTML = players.map((p, i) => {
      const connected = m.players[i];
      const name = connected?.name || p.name || `等待第 ${i + 1} 位玩家`;
      const n = holdings(i).length;
      return `<div class="prop-player ${s.active === i && s.status === 'playing' ? 'is-active' : ''} ${p.bankrupt ? 'prop-player-bankrupt' : ''}" style="--player-color:${colors[i % 4]}"><span class="prop-avatar">${safe(name.slice(0, 1))}</span><div><span class="prop-player-name">${safe(name)}${i === m.playerIndex ? '（你）' : ''}</span><small class="prop-player-meta">${p.bankrupt ? '已破产退出' : waiting ? '等待开局' : `${n} 处地产${p.jailed ? ' · 监所中' : ''}`}</small></div><b class="prop-player-cash">${waiting ? '—' : money(p.cash)}</b></div>`;
    }).join('');
    $p('#prop-dice').textContent = s.dice?.some(Boolean) ? `${s.dice[0]} · ${s.dice[1]}` : '— · —';

    const tokensAt = (i) => players.map((p, j) => p.pos === i && !p.bankrupt ? `<i class="prop-token" style="--player-color:${colors[j % 4]}" title="${safe(p.name)}">${j + 1}</i>` : '').join('');
    $p('#prop-board').innerHTML = s.board.map((x, i) => {
      const [row, col] = coordinates(i);
      const owner = x.owner;
      const isOwned = owner !== null && owner !== undefined;
      const price = x.price ? `$${x.price}` : x.amount ? `$${x.amount}` : '';
      const extra = x.type === 'lot' ? buildings(x) || x.groupName : x.type === 'rail' ? '交通' : x.type === 'utility' ? '公用设施' : ({chance:'机遇',chest:'基金',tax:'缴费',go:'起点',goJail:'前往监所',jail:'监所',parking:'休息'})[x.type] || '';
      const special = ['go','chance','chest','parking','jail'].includes(x.type);
      return `<button class="prop-cell ${isOwned ? `owned-${owner}` : ''} ${x.mortgaged ? 'mortgaged' : ''} ${special ? 'prop-special' : ''} ${x.type === 'tax' ? 'prop-tax' : ''} ${players.some((p) => p.pos === i && !p.bankrupt) ? 'current-land' : ''}" style="grid-row:${row};grid-column:${col};--prop-color:${x.color || '#c7b997'}" title="${safe(x.name)}${price ? ` · ${price} 海贝` : ''}${isOwned ? ` · ${safe(players[owner]?.name)}持有` : ''}" data-space="${i}">${x.type === 'lot' ? '<i class="prop-band"></i>' : ''}<span class="prop-space-name">${safe(x.name)}</span><span class="prop-space-symbol">${icon(x)}</span><small class="prop-space-price">${price ? safe(price) : safe(extra)}</small>${x.type === 'lot' && buildings(x) ? `<small class="prop-buildings">${safe(buildings(x))}</small>` : ''}<span class="prop-tokens">${tokensAt(i)}</span></button>`;
    }).join('') + '<div class="prop-center"><em>✧　⌂　✧</em><strong>海湾地产局</strong><p>海风带来新的机会。买下街区、建造家园，与伙伴竞逐海湾未来。</p><span class="prop-compass">✥</span></div>';
    $p('#prop-board-legend').innerHTML = players.map((p, i) => `<span><i style="--player-color:${colors[i % 4]}"></i>${safe(p.name)} · ${holdings(i).length} 处</span>`).join('');

    let title, copy, badge;
    if (waiting) {
      title = '等待玩家入席'; copy = `房间已坐 ${m.players.length}/${m.maxPlayers} 人；把房间号发给朋友，人数到齐后自动开局。`; badge = '等待开局';
    } else if (s.status === 'finished') {
      title = '地产季结束'; copy = s.winner === null ? '所有玩家都已退出本局。' : `${players[s.winner]?.name}成为海湾最后的地产赢家。`; badge = '已结算';
    } else if (phase === 'buy') {
      title = active ? '你踩中了一块待售街区' : '玩家正在决定是否购地'; copy = active ? `可用 ${money(me.cash)} 直接买下，或开启公开竞价。` : `${players[s.pending?.player]?.name || '玩家'}正在决定购买 ${s.board[s.pending?.space]?.name || '地产'}。`; badge = '购地决定';
    } else if (phase === 'auction') {
      title = s.auction?.turn === m.playerIndex ? '轮到你出价或放弃' : '公开竞价进行中'; copy = `${s.board[s.auction?.space]?.name || '地产'} 当前最高价 ${money(s.auction?.bid)}；领先者：${s.auction?.leader === null ? '暂无' : players[s.auction?.leader]?.name || '玩家'}。`; badge = '公开竞价';
    } else if (phase === 'debt') {
      title = s.debt?.debtor === m.playerIndex ? '需要筹集资金清偿债务' : '玩家正在筹集资金'; copy = `待付 ${money(s.debt?.amount)}：${s.debt?.reason || '应付款项'}。可出售建筑、抵押地产，或宣布破产。`; badge = '处理债务';
    } else if (phase === 'trade') {
      title = s.trade?.to === m.playerIndex ? '收到一份地产交易提议' : '交易等待对方回应'; copy = s.trade ? `${players[s.trade.from]?.name}提出了地产与海贝交换方案。` : '请等待交易对象回应。'; badge = '谈判中';
    } else {
      title = active ? (me?.jailed ? '你在灯塔监所，选择脱身方式' : '轮到你：掷骰并按点数前进') : `现在是${players[s.active]?.name || '对手'}的回合`;
      copy = active ? (me?.jailed ? '可付保释金、尝试掷对子，或使用通行券。' : '掷骰后可购买街区、向地产所有者支付租金，或触发沿途事件。') : '留意对手落点；你的地产会自动收取租金。'; badge = active ? '你的回合' : '对手行动';
    }
    $p('#prop-hint-title').textContent = title;
    $p('#prop-hint-copy').textContent = copy;
    $p('#prop-hint-badge').textContent = badge;
    $p('#prop-phase-label').textContent = waiting ? '等待入席' : ({roll:'掷骰阶段',buy:'购买决定',auction:'公开竞价',debt:'债务结算',trade:'交易回应',finished:'已结算'})[phase] || '游戏进行中';

    let controls = '';
    if (waiting) {
      controls = `<div class="prop-turn-message"><b>牌桌准备中</b>创建房间的人选择人数；朋友输入同一个六位房间号加入。${m.players.length ? `<br>已入席：${m.players.map((p) => safe(p.name)).join('、')}` : ''}</div><button id="prop-copy-room-wait">复制房间号邀请</button>`;
    } else if (s.status === 'finished') {
      controls = `<div class="prop-turn-message"><b>${s.winner === null ? '本局没有赢家' : `${safe(players[s.winner]?.name)}赢得本局`}</b>成为最后未破产的玩家即获胜。</div>`;
    } else if (phase === 'buy') {
      const x = s.board[s.pending.space];
      controls = `<div class="prop-buy-box"><strong>${safe(x.name)} · ${money(x.price)}</strong><small>请选择直接购买、公开竞价或放弃。</small><div class="prop-actions"><button class="prop-primary" data-prop-action="buy" ${s.pending.player === m.playerIndex && me.cash >= x.price ? '' : 'disabled'}>直接买下</button><button data-prop-action="auction" ${s.pending.player === m.playerIndex ? '' : 'disabled'}>开启竞价</button><button data-prop-action="skip" ${s.pending.player === m.playerIndex ? '' : 'disabled'}>暂不购买</button></div></div>`;
    } else if (phase === 'auction') {
      const mine = s.auction?.turn === m.playerIndex;
      controls = `<div class="prop-auction-box"><strong>${mine ? '轮到你决定' : '等待下一位竞价者'}</strong><small>当前最高出价：${money(s.auction.bid)}${s.auction.leader !== null ? ` · ${safe(players[s.auction.leader]?.name)}` : ''}</small>${mine ? `<div class="prop-offer-row"><input id="prop-bid-amount" type="number" min="${s.auction.bid + 1}" max="${me.cash}" step="100" placeholder="输入更高出价"><button class="prop-primary" data-prop-action="bid">出价</button></div><button data-prop-action="pass" ${s.auction.leader === m.playerIndex ? 'disabled' : ''}>放弃本轮竞价</button>` : '<small>按顺序轮流加价或退出；最高出价者获得该地产。</small>'}</div>`;
    } else if (phase === 'debt') {
      const owing = s.debt?.debtor === m.playerIndex;
      controls = `<div class="prop-debt-box"><strong>${owing ? '请筹款结清' : '债务处理中'} · ${money(s.debt?.amount)}</strong><small>${safe(s.debt?.reason || '等待债务处理')}。你可在下方名下地产区出售建筑或抵押地产。</small>${owing ? '<button class="prop-primary" data-prop-action="bankrupt">宣布破产并退出</button>' : ''}</div>`;
    } else if (phase === 'trade') {
      controls = `<div class="prop-answer-box"><strong>${s.trade?.to === m.playerIndex ? '请决定是否接受交易' : '交易提议已送达'}</strong><small>${s.trade?.to === m.playerIndex ? '确认前请检查双方交换的地产和海贝。' : '等待对方接受或拒绝。'}</small>${s.trade?.to === m.playerIndex ? '<div class="prop-actions"><button class="prop-primary" data-prop-action="tradeAccept">接受</button><button data-prop-action="tradeDecline">拒绝</button></div>' : ''}</div>`;
    } else if (active) {
      controls = `<button class="prop-primary prop-roll" data-prop-action="roll">${me.jailed ? '掷骰尝试离开监所' : '掷骰前进'}</button>${me.jailed ? `<div class="prop-actions"><button data-prop-action="bailRoll" ${me.cash >= 500 ? '' : 'disabled'}>支付500保释后掷骰</button><button data-prop-action="jailCard" ${me.jailCards.length ? '' : 'disabled'}>使用免罚通行券</button></div><small class="prop-turn-message">若三次仍未掷出对子，将支付保释金后移动。</small>` : ''}<small class="prop-turn-message">一次掷骰后完成落点结算。掷出对子（监所外）可额外再掷一次。</small>`;
    } else {
      controls = '<div class="prop-turn-message"><b>等待行动</b>可以先查看地产、租金、公共竞价和交易报价。</div>';
    }
    $p('#prop-controls').innerHTML = controls;

    const canManage = active && phase === 'roll';
    const oweHere = phase === 'debt' && s.debt?.debtor === m.playerIndex;
    const assets = holdings(m.playerIndex);
    $p('#prop-assets').innerHTML = assets.length ? assets.map((x) => {
      const options = [];
      if (x.type === 'lot' && (x.houses || x.hotel)) options.push(`<button data-prop-action="sellBuilding" data-space-id="${x.id}" ${canManage || oweHere ? '' : 'disabled'}>售建筑</button>`);
      if (x.mortgaged) options.push(`<button data-prop-action="unmortgage" data-space-id="${x.id}" ${canManage ? '' : 'disabled'}>赎回</button>`);
      else options.push(`<button data-prop-action="mortgage" data-space-id="${x.id}" ${canManage || oweHere ? '' : 'disabled'}>抵押</button>`);
      if (x.type === 'lot') options.push(`<button data-prop-action="build" data-space-id="${x.id}" ${canManage ? '' : 'disabled'}>建造</button>`);
      const railCount = s.board.filter((q) => q.type === 'rail' && q.owner === m.playerIndex && !q.mortgaged).length;
      const rent = x.type === 'lot' ? x.rents[x.hotel ? 5 : x.houses] : x.type === 'rail' ? x.rents[Math.max(0, railCount - 1)] : '按骰点';
      return `<div class="prop-asset"><span class="prop-asset-name">${safe(x.name)}<small class="prop-asset-meta">${x.mortgaged ? '已抵押' : x.hotel ? '旅店' : x.houses ? `${x.houses} 栋房屋` : '无建筑'} · 租金 ${typeof rent === 'number' ? money(rent) : rent}</small></span><span class="prop-asset-actions">${options.join('')}</span></div>`;
    }).join('') : '<div class="prop-turn-message">尚未购入地产。落在无人街区时可以购买或竞价。</div>';
    $p('#prop-bank-line').textContent = `公共库存：房屋 ${s.bank.houses} · 旅店 ${s.bank.hotels} · 每次经过启航点领取2,000海贝`;

    const others = players.map((p, i) => ({p, i})).filter(({p, i}) => i !== m.playerIndex && !p.bankrupt);
    const tradableMine = assets.filter((x) => !x.mortgaged && !x.houses && !x.hotel);
    const tradableOthers = others.flatMap(({p, i}) => holdings(i).filter((x) => !x.mortgaged && !x.houses && !x.hotel).map((x) => ({x, i, name:p.name})));
    let trade = '';
    if (s.trade) {
      const giveName = s.trade.giveProperty ? s.board.find((x) => x.id === s.trade.giveProperty)?.name : '';
      const wantName = s.trade.wantProperty ? s.board.find((x) => x.id === s.trade.wantProperty)?.name : '';
      trade = `<div class="prop-turn-message"><b>${safe(players[s.trade.from]?.name)} → ${safe(players[s.trade.to]?.name)}</b>${giveName ? `${safe(giveName)} ` : ''}${s.trade.giveCash ? `+ ${money(s.trade.giveCash)} ` : ''} ⇄ ${wantName ? `${safe(wantName)} ` : ''}${s.trade.wantCash ? `+ ${money(s.trade.wantCash)}` : ''}</div>`;
    } else if (canManage && others.length) {
      trade = `<label>交易对象<select id="prop-trade-to">${others.map(({p, i}) => `<option value="${i}">${safe(p.name)}</option>`).join('')}</select></label><div class="prop-trade-grid"><label>我提供的地产<select id="prop-trade-give"><option value="">不提供地产</option>${tradableMine.map((x) => `<option value="${x.id}">${safe(x.name)}</option>`).join('')}</select></label><label>对方地产<select id="prop-trade-want"><option value="">不交换地产</option>${tradableOthers.map(({x, i, name}) => `<option value="${x.id}" data-owner="${i}">${safe(name)} · ${safe(x.name)}</option>`).join('')}</select></label><label>我附加海贝<input id="prop-trade-give-cash" type="number" min="0" max="${me.cash}" value="0"></label><label>要求对方海贝<input id="prop-trade-want-cash" type="number" min="0" max="${Math.max(...others.map(({p}) => p.cash))}" value="0"></label></div><button data-prop-action="offerTrade">提出交易</button>`;
    } else {
      trade = '<div class="prop-turn-message">轮到你行动时，可以向其他玩家提出地产或海贝交易。</div>';
    }
    $p('#prop-trade').innerHTML = trade;
    $p('#prop-log').innerHTML = (s.log || []).slice(0, 12).map((line) => `<p>${safe(line)}</p>`).join('');
    $p('#prop-end').classList.toggle('hidden', s.status !== 'finished');
    if (s.status === 'finished') {
      $p('#prop-end-title').textContent = s.winner === null ? '本局结束' : `${players[s.winner]?.name}赢得海湾地产季`;
      $p('#prop-end-copy').textContent = players.map((p, i) => `${p.name}：${money(p.cash)} · ${holdings(i).length} 处地产${p.bankrupt ? ' · 已破产' : ''}`).join(' / ');
    }
  }

  function action(name, extra = {}) {
    send({type:'act', action:name, ...extra});
  }

  propRoot.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'prop-copy-room' || button.id === 'prop-copy-room-wait') {
      try { await navigator.clipboard.writeText(propData.code); notify('房间号已复制，发给朋友吧！'); }
      catch { notify(`房间号：${propData.code}`); }
      return;
    }
    if (button.id === 'prop-rematch') { send({type:'rematch'}); return; }
    if (button.dataset.space !== undefined) return;
    const name = button.dataset.propAction;
    if (!name) return;
    const spaceId = button.dataset.spaceId;
    if (name === 'bid') {
      const amount = Number($p('#prop-bid-amount').value);
      if (!Number.isInteger(amount) || amount <= propData.state.auction.bid) return notify('请输入高于当前价格的整数出价。');
      action(name, {amount}); return;
    }
    if (name === 'offerTrade') {
      const want = $p('#prop-trade-want').selectedOptions[0];
      const owner = want?.dataset.owner;
      if (owner !== undefined && Number(owner) !== Number($p('#prop-trade-to').value)) return notify('所选地产不属于当前交易对象，请重新选择。');
      action(name, {to:Number($p('#prop-trade-to').value), giveProperty:$p('#prop-trade-give').value || null, wantProperty:$p('#prop-trade-want').value || null, giveCash:Number($p('#prop-trade-give-cash').value) || 0, wantCash:Number($p('#prop-trade-want-cash').value) || 0});
      return;
    }
    if (name === 'tradeAccept') { action('tradeAnswer', {accept:true}); return; }
    if (name === 'tradeDecline') { action('tradeAnswer', {accept:false}); return; }
    action(name, spaceId ? {spaceId} : {});
  });

  const renderPrevious = render;
  render = (m) => {
    if (m.game === 'property') {
      draw(m);
      $('#help-open').onclick = $('#help-open-bottom').onclick = showPropertyRules;
      return;
    }
    propRoot.classList.add('hidden');
    propFooter.classList.remove('hidden');
    helpModal.querySelector('.kicker').textContent = originalHelp.kicker;
    helpModal.querySelector('h2').textContent = originalHelp.heading;
    helpModal.querySelectorAll('section').forEach((section, i) => {
      section.querySelector('b').textContent = originalHelp.sections[i][0];
      section.querySelector('p').textContent = originalHelp.sections[i][1];
    });
    $('#help-open').onclick = m.game === 'gem'
      ? () => notify('星晶商路：每回合只能进行一项行动；晶石库存上限10，超额时选取超额晶石退回。达到15声望后按先后手补齐回合并结算。')
      : () => $('#help-modal').classList.remove('hidden');
    renderPrevious(m);
  };
})();
