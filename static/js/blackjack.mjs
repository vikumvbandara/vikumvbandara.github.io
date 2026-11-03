import { BlackjackGame, handValue } from './blackjack-engine.mjs';

const root = document.querySelector('[data-blackjack]');
if (root) {
  const game = new BlackjackGame();
  const table = root.querySelector('.bj-table');
  const deal = root.querySelector('[data-deal]');
  const hit = root.querySelector('[data-hit]');
  const stand = root.querySelector('[data-stand]');
  const names = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };

  function drawHand(selector, cards, hideHole = false) {
    const list = root.querySelector(selector);
    if (!cards.length) return;
    list.replaceChildren();
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
    deal.disabled = playing;
    hit.disabled = !playing;
    stand.disabled = !playing;
    deal.textContent = game.round ? 'Next hand' : 'Deal a hand';
    root.querySelector('[data-round]').textContent = game.round ? `Hand ${game.round}` : 'Ready to deal';
    for (const [key, value] of Object.entries(game.stats)) root.querySelector(`[data-${key}]`).textContent = value;
    drawHand('[data-dealer-cards]', game.dealer, playing);
    drawHand('[data-player-cards]', game.player);
    if (game.round) {
      root.querySelector('[data-dealer-total]').textContent = playing ? `${handValue([game.dealer[0]]).total} showing` : totalLabel(game.dealer);
      root.querySelector('[data-player-total]').textContent = totalLabel(game.player);
    }
    if (playing) {
      root.querySelector('[data-result]').textContent = 'Your move.';
      root.querySelector('[data-message]').textContent = `You have ${totalLabel(game.player)}. Hit for another card, or stand to keep your hand.`;
    } else if (game.state === 'over') {
      root.querySelector('[data-result]').textContent = { win: 'You win!', loss: 'Dealer wins.', tie: 'A tie.' }[game.outcome];
      root.querySelector('[data-message]').textContent = `${game.reason} Choose “Next hand” to play again.`;
    }
  }

  function act(action) {
    if (!game[action]()) return;
    render();
    // Keep keyboard focus on a stable element when action buttons become disabled.
    table.focus({ preventScroll: true });
  }
  deal.addEventListener('click', () => act('deal'));
  hit.addEventListener('click', () => act('hit'));
  stand.addEventListener('click', () => act('stand'));
  table.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const action = { KeyH: 'hit', KeyS: 'stand', KeyN: 'deal' }[event.code];
    if (action) { event.preventDefault(); act(action); }
  });
  render();
}
