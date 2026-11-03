export class Leaderboard {
  constructor(root, config, fetcher = (...args) => fetch(...args)) {
    this.root = root;
    this.config = config;
    this.fetcher = fetcher;
    this.run = null;
    this.pending = null;
    this.generation = 0;
    this.submitting = false;
    this.status = root.querySelector('[data-leaderboard-status]');
    this.form = root.querySelector('[data-score-form]');
    this.submitStatus = root.querySelector('[data-submit-status]');
    this.refresh = root.querySelector('[data-refresh-scores]');
    this.refresh.addEventListener('click', () => this.load());
    this.form.addEventListener('submit', event => { event.preventDefault(); this.submit(); });
    this.load();
  }

  get configured() { return Boolean(this.config.url && this.config.publishableKey); }

  async rpc(name, body = {}) {
    const response = await this.fetcher(`${this.config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: this.config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('Leaderboard request failed.');
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async load() {
    if (!this.configured) {
      this.status.textContent = 'The shared leaderboard is not available yet. You can still play and beat your personal best.';
      this.refresh.disabled = true;
      return;
    }
    this.refresh.disabled = true;
    this.status.textContent = 'Loading scores…';
    try {
      const entries = await this.rpc('pinball_top_scores');
      if (!Array.isArray(entries)) throw new Error('Invalid leaderboard response.');
      const rows = this.root.querySelector('[data-leaderboard-rows]');
      rows.replaceChildren();
      entries.slice(0, 10).forEach((entry, index) => {
        const row = document.createElement('tr');
        for (const value of [index + 1, String(entry.player_name), Number(entry.score).toLocaleString()]) {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          row.append(cell);
        }
        rows.append(row);
      });
      this.root.querySelector('[data-leaderboard-table]').hidden = !entries.length;
      this.status.textContent = entries.length ? 'Latest scores from all visitors.' : 'No scores yet. Be the first to set the record!';
    } catch (error) {
      console.warn('Pinball leaderboard could not load:', error.message);
      this.status.textContent = 'Could not refresh the leaderboard. Please try again.';
    } finally { this.refresh.disabled = false; }
  }

  reset() {
    this.generation++;
    this.run = null;
    this.pending = null;
    this.form.hidden = true;
    this.submitStatus.textContent = '';
  }

  start() {
    if (!this.configured || this.run) return;
    // Start once per game. A failed connection never interrupts local play.
    this.run = this.rpc('pinball_start_run').catch(() => null);
  }

  finish(score) {
    if (!this.configured) return;
    this.pending = { score, generation: this.generation, run: this.run };
    this.root.querySelector('[data-final-score]').textContent = score.toLocaleString();
    this.form.hidden = false;
    this.form.querySelector('button').disabled = false;
  }

  async submit() {
    if (this.submitting || !this.pending) return;
    const player = this.form.elements.player.value.trim();
    if (!player || player.length > 20) {
      this.submitStatus.textContent = 'Enter a display name with 1–20 characters.';
      return;
    }
    const pending = this.pending;
    this.submitting = true;
    this.form.querySelector('button').disabled = true;
    this.submitStatus.textContent = 'Submitting your score…';
    try {
      const token = await pending.run;
      if (!token) throw new Error('No online run.');
      await this.rpc('pinball_submit_score', { run_token: token, player_name: player, final_score: pending.score });
      if (this.pending === pending) {
        this.pending = null;
        this.submitStatus.textContent = 'Score submitted! Thanks for playing.';
      }
      await this.load();
    } catch {
      if (this.pending === pending) {
        this.submitStatus.textContent = 'Could not submit this score. Check your connection and retry. If the game started offline, start a new game while connected.';
        this.form.querySelector('button').disabled = false;
      }
    } finally { this.submitting = false; }
  }
}
