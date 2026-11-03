export const formatMoney = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const signedMoney = cents => `${cents > 0 ? '+' : ''}${formatMoney(cents)}`;

export class BlackjackLeaderboard {
  constructor(root, endpoint, fetcher = (...args) => fetch(...args)) {
    this.root = root;
    this.endpoint = endpoint;
    this.fetcher = fetcher;
    this.form = root.querySelector('[data-bj-score-form]');
    this.name = root.querySelector('[data-bj-name]');
    this.submitButton = root.querySelector('[data-bj-submit]');
    this.notice = root.querySelector('[data-bj-submit-status]');
    this.refreshButton = root.querySelector('[data-bj-refresh]');
    this.generation = 0;
    this.form.addEventListener('submit', event => { event.preventDefault(); this.submit(); });
    this.refreshButton.addEventListener('click', () => this.load());
    this.reset();
    this.load();
  }

  async request(body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-game-token'] = token;
    const response = await this.fetcher(this.endpoint, {
      method: body ? 'POST' : 'GET', headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000), cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || 'The leaderboard is unavailable. Please try again.');
    return result;
  }

  async load() {
    if (this.loading) return;
    this.loading = true;
    this.refreshButton.disabled = true;
    const status = this.root.querySelector('[data-bj-board-status]');
    const rows = this.root.querySelector('[data-bj-score-rows]');
    status.textContent = 'Loading scores…';
    try {
      const scores = await this.request();
      rows.replaceChildren();
      for (const [index, score] of scores.entries()) {
        const row = document.createElement('tr');
        for (const value of [index + 1, score.player_name, signedMoney(score.profit_cents), score.hands]) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.append(cell);
        }
        rows.append(row);
      }
      status.textContent = scores.length ? 'Top 10 · shared by all visitors' : 'No scores yet. Finish a hand and be the first on the board.';
    } catch {
      status.textContent = rows.children.length ? 'Could not refresh. Showing the last loaded scores.' : 'Scores could not load. Choose Refresh to try again.';
    } finally {
      this.loading = false;
      this.refreshButton.disabled = false;
    }
  }

  reset() {
    this.generation++;
    this.session = null;
    this.snapshot = null;
    this.saved = null;
    this.busy = false;
    this.playing = false;
    this.notice.textContent = '';
    this.render();
  }

  start() {
    if (!this.session) {
      const generation = this.generation;
      const promise = this.request({ action: 'start' }).then(result => result.token).catch(() => {
        if (generation === this.generation) this.session = null;
        return null;
      });
      this.session = promise;
    }
    return this.session;
  }

  update(game) {
    this.playing = game.state === 'playing';
    if (game.round) this.start();
    if (game.state === 'over') this.snapshot = { profit: game.netProfit, hands: game.round };
    this.render();
  }

  render() {
    const eligible = this.snapshot && !this.playing;
    this.root.querySelector('[data-bj-current-score]').textContent = this.snapshot ? signedMoney(this.snapshot.profit) : '—';
    this.root.querySelector('[data-bj-saved-score]').textContent = this.saved ? signedMoney(this.saved.profit_cents) : '—';
    this.submitButton.disabled = this.busy || !eligible || (this.saved && this.snapshot.profit <= this.saved.profit_cents);
    this.name.disabled = this.busy;
    this.submitButton.textContent = this.busy ? 'Saving…' : this.saved ? 'Update my score' : 'Submit my score';
    this.root.querySelector('[data-bj-score-hint]').textContent = this.playing ? 'Finish your current hand to submit.' : !this.snapshot ? 'Finish a hand to submit your net winnings.' : this.saved && this.snapshot.profit <= this.saved.profit_cents ? 'Your best submitted score is saved. Beat it to update your entry.' : `${this.snapshot.hands} completed ${this.snapshot.hands === 1 ? 'hand' : 'hands'} · ready to submit`;
  }

  async submit() {
    if (this.submitButton.disabled || !this.form.reportValidity()) return;
    const name = this.name.value.trim();
    if (!name || [...name].length > 20 || /[\u0000-\u001f\u007f]/u.test(name)) {
      this.notice.textContent = 'Enter a display name of 1–20 characters.';
      this.name.focus();
      return;
    }
    const generation = this.generation;
    const snapshot = { ...this.snapshot };
    this.busy = true;
    this.notice.textContent = '';
    this.render();
    try {
      const token = await this.start();
      if (generation !== this.generation) return;
      if (!token) throw new Error('Could not connect. Please try submitting again.');
      const result = await this.request({ action: 'submit', name, ...snapshot }, token);
      // A reset must never receive the previous session's response.
      if (generation !== this.generation) return;
      this.saved = result;
      this.notice.textContent = `Saved! Your best submitted net winnings are ${signedMoney(result.profit_cents)}.`;
      await this.load();
    } catch (error) {
      if (generation === this.generation) this.notice.textContent = error.message || 'Could not save. Please try again.';
    } finally {
      if (generation === this.generation) { this.busy = false; this.render(); }
    }
  }
}
