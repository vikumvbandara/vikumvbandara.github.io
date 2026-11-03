PINBALL SHARED LEADERBOARD

Project: Personal Website (tmsamlowojaxdtkvtejx)
The GitHub Pages frontend uses the project's public REST API. Browser configuration
is in static/js/pinball-config.mjs and contains only a publishable key, never a
secret or service-role key.

Apply migrations/202611020001_pinball_leaderboard.sql once to provision the table
and three RPC functions. It has been applied to the project above. For regression
checks, tests/pinball-leaderboard.sql creates fixtures inside a transaction and
rolls back every change.

Public API:
- pinball_start_run(): returns an unguessable session token for one game.
- pinball_submit_score(run_token, player_name, final_score): stores one score per
  session, validates the name, score range, score increments, and elapsed time.
  Retries are idempotent. Sessions expire after a day.
- pinball_top_scores(): returns only player names and scores for the top 10 runs,
  ordered by score descending and earliest submission for a tie.

The underlying table has RLS enabled, no public policies, and no table grants to
anon or authenticated. Public security-definer functions are intentional: they
use an empty search_path and expose no session tokens through the ranking API.
Supabase's RLS-no-policy and public-function advisory notices are expected for
this narrowly scoped API. References:
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

This is a casual, honor-system leaderboard. Scores originate in the browser;
validation is not authoritative game replay and cannot prevent a determined
visitor from fabricating plausible scores or using multiple display names.
There is a global limit of 2,000 session starts per hour to bound write volume.
A competitive/prize leaderboard would need server verification and stronger
per-player abuse controls. No login, email, or browser fingerprint is collected.

Visuals follow the existing website CSS variables. The original synthesized music
is opt-in, supports a volume slider, and stops while paused or in a hidden tab.
