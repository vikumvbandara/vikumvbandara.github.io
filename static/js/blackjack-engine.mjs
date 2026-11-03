export const SUITS = [
  { symbol: '♠', name: 'spades', red: false },
  { symbol: '♥', name: 'hearts', red: true },
  { symbol: '♣', name: 'clubs', red: false },
  { symbol: '♦', name: 'diamonds', red: true },
];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function shuffledDeck(random = Math.random) {
  const deck = SUITS.flatMap(suit => RANKS.map(rank => ({ rank, suit })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function handValue(cards) {
  let total = 0, aces = 0;
  for (const { rank } of cards) {
    if (rank === 'A') { total += 11; aces++; }
    else total += ['J', 'Q', 'K'].includes(rank) ? 10 : Number(rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export class BlackjackGame {
  constructor(deckFactory = shuffledDeck) {
    this.deckFactory = deckFactory;
    this.state = 'ready';
    this.round = 0;
    this.player = [];
    this.dealer = [];
    this.stats = { wins: 0, losses: 0, ties: 0 };
    this.outcome = null;
    this.reason = '';
  }

  deal() {
    if (this.state === 'playing') return false;
    this.deck = this.deckFactory();
    this.player = [];
    this.dealer = [];
    this.outcome = null;
    this.reason = '';
    this.round++;
    this.state = 'playing';
    for (let i = 0; i < 2; i++) {
      this.player.push(this.deck.pop());
      this.dealer.push(this.deck.pop());
    }
    const playerNatural = handValue(this.player).total === 21;
    const dealerNatural = handValue(this.dealer).total === 21;
    if (playerNatural && dealerNatural) this.finish('tie', 'You both have blackjack.');
    else if (dealerNatural) this.finish('loss', 'The dealer has blackjack.');
    else if (playerNatural) this.finish('win', 'An ace and a 10-point card. Blackjack!');
    return true;
  }

  hit() {
    if (this.state !== 'playing') return false;
    this.player.push(this.deck.pop());
    const { total } = handValue(this.player);
    if (total > 21) this.finish('loss', `You have ${total}. That’s a bust.`);
    else if (total === 21) this.stand();
    return true;
  }

  stand() {
    if (this.state !== 'playing') return false;
    // This table stands on every 17, including soft 17.
    while (handValue(this.dealer).total < 17) this.dealer.push(this.deck.pop());
    const player = handValue(this.player).total;
    const dealer = handValue(this.dealer).total;
    if (dealer > 21) this.finish('win', `The dealer has ${dealer} and busts. Your ${player} wins.`);
    else if (player > dealer) this.finish('win', `Your ${player} beats the dealer’s ${dealer}.`);
    else if (player < dealer) this.finish('loss', `The dealer’s ${dealer} beats your ${player}.`);
    else this.finish('tie', `You both have ${player}. That’s a push.`);
    return true;
  }

  finish(outcome, reason) {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.outcome = outcome;
    this.reason = reason;
    this.stats[{ win: 'wins', loss: 'losses', tie: 'ties' }[outcome]]++;
  }
}
