import { BlackjackGame, handValue, MIN_WAGER } from './blackjack-engine.mjs?v=2';
import { BlackjackLeaderboard } from './blackjack-leaderboard.mjs?v=1';

const root = document.querySelector('[data-blackjack]');
if (root) {
  const game = new BlackjackGame();
  const leaderboard = new BlackjackLeaderboard(root, 'https://tmsamlowojaxdtkvtejx.supabase.co/functions/v1/blackjack-leaderboard');
  const table = root.querySelector('.bj-table');
  const deal = root.querySelector('[data-deal]');
  const hit = root.querySelector('[data-hit]');
  const stand = root.querySelector('[data-stand]');
  const wager = root.querySelector('[data-wager]');
  const reset = root.querySelector('[data-reset]');
  const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const signedMoney = cents => `${cents > 0 ? '+' : ''}${money(cents)}`;
  const names = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };

  function drawHand(selector, cards, hideHole = false) {
    const list = root.querySelector(selector);
    list.replaceChildren();
    if (!cards.length) {
      const placeholder = document.createElement('li');
      placeholder.className = 'bj-card bj-placeholder';
      placeholder.textContent = '?';
      placeholder.setAttribute('aria-label', 'No cards yet');
      list.append(placeholder);
      return;
    }
    cards.forEach((card, index) => {
      const node = document.createElement('li');
      node.className = 'bj-card';
      // Never expose the hidden card's rank, suit or total in the DOM.
      if (hideHole && index === 1) {
        node.classList.add('bj-card-back');
        node.setAttribute('aria-label', 'Face-down card');
        const back = document.createElement('span');
        back.textContent = '◇';
        back.setAttribute('aria-hidden', 'true');
        node.append(back);
      } else {
        if (card.suit.red) node.classList.add('bj-red');
        node.setAttribute('aria-label', `${names[card.rank] || card.rank} of ${card.suit.name}`);
        for (const [className, text] of [['bj-card-rank', card.rank], ['bj-card-suit', card.suit.symbol], ['bj-card-corner', card.rank]]) {
          const span = document.createElement('span');
          span.className = className;
          span.textContent = text;
          span.setAttribute('aria-hidden', 'true');
          node.append(span);
        }
      }
      list.append(node);
    });
  }

  function totalLabel(cards) {
    const { total, soft } = handValue(cards);
    return `${total}${soft ? ' · soft' : ''}${total > 21 ? ' · bust' : ''}`;
  }

  function render() {
    const playing = game.state === 'playing';
    const tooLow = game.balance < MIN_WAGER;
    deal.disabled = playing || tooLow;
    hit.disabled = !playing;
    stand.disabled = !playing;
    reset.disabled = playing;
    wager.disabled = playing || tooLow;
    if (!playing) {
      const max = Math.max(MIN_WAGER, Math.floor(game.balance / MIN_WAGER) * MIN_WAGER) / 100;
      wager.max = max;
      if (Number(wager.value) > max) wager.value = max;
    }
    root.querySelector('[data-balance]').textContent = money(game.balance);
    root.querySelector('[data-net]').textContent = signedMoney(game.netProfit);
    root.querySelector('[data-hand-money-label]').textContent = playing ? 'Wager in play' : 'Last hand';
    root.querySelector('[data-hand-money]').textContent = playing ? money(game.wager) : game.round ? signedMoney(game.lastProfit) : '—';
    root.querySelector('[data-wager-note]').textContent = playing ? `${money(game.wager)} is in play. Your wager is locked until the hand ends.` : tooLow ? 'You need at least $5 to play. Reset to $1,000 to start again.' : 'Choose a wager in $5 steps before dealing.';
    deal.textContent = game.round ? 'Next hand' : 'Deal a hand';
    root.querySelector('[data-round]').textContent = game.round ? `Hand ${game.round}` : 'Ready to deal';
    for (const [key, value] of Object.entries(game.stats)) root.querySelector(`[data-${key}]`).textContent = value;
    drawHand('[data-dealer-cards]', game.dealer, playing);
    drawHand('[data-player-cards]', game.player);
    if (game.round) {
      root.querySelector('[data-dealer-total]').textContent = playing ? `${handValue([game.dealer[0]]).total} showing` : totalLabel(game.dealer);
      root.querySelector('[data-player-total]').textContent = totalLabel(game.player);
    } else {
      root.querySelector('[data-dealer-total]').textContent = '—';
      root.querySelector('[data-player-total]').textContent = '—';
    }
    if (playing) {
      root.querySelector('[data-result]').textContent = 'Your move.';
      root.querySelector('[data-message]').textContent = `You have ${totalLabel(game.player)}. Hit for another card, or stand to keep your hand.`;
    } else if (game.state === 'over') {
      root.querySelector('[data-result]').textContent = `${{ win: 'You win!', loss: 'Dealer wins.', tie: 'A tie.' }[game.outcome]} ${signedMoney(game.lastProfit)}`;
      root.querySelector('[data-message]').textContent = `${game.reason} ${tooLow ? 'Reset your practice balance to play again.' : 'Choose “Next hand” to play again.'}`;
    } else {
      root.querySelector('[data-result]').textContent = 'Take a seat.';
      root.querySelector('[data-message]').textContent = 'Choose your practice wager, then “Deal a hand” to begin.';
    }
    leaderboard.update(game);
  }

  function act(action) {
    if (action === 'deal' && (game.state === 'playing' || game.balance < MIN_WAGER || !wager.reportValidity())) return;
    if (!game[action](action === 'deal' ? Number(wager.value) * 100 : undefined)) return;
    if (action === 'reset') { wager.value = '25'; leaderboard.reset(); }
    render();
    // Keep keyboard focus on a stable element when action buttons become disabled.
    table.focus({ preventScroll: true });
  }
  deal.addEventListener('click', () => act('deal'));
  hit.addEventListener('click', () => act('hit'));
  stand.addEventListener('click', () => act('stand'));
  reset.addEventListener('click', () => act('reset'));
  table.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.target.matches('input, select, textarea')) return;
    const action = { KeyH: 'hit', KeyS: 'stand', KeyN: 'deal' }[event.code];
    if (action) { event.preventDefault(); act(action); }
  });
  render();
}
