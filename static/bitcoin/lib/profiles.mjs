export const PROFILES = Object.freeze({
  accumulation: Object.freeze({ id:'accumulation', label:'Long-term accumulation', intervalMinutes:1440, intervalSeconds:86400, reviewTtlSeconds:21600, checkSeconds:86400, alertCooldownSeconds:86400, marketCacheSeconds:300, refreshSeconds:300 }),
  daytrade: Object.freeze({ id:'daytrade', label:'Day trading', intervalMinutes:15, intervalSeconds:900, reviewTtlSeconds:300, checkSeconds:900, alertCooldownSeconds:3600, marketCacheSeconds:30, refreshSeconds:60 }),
});

export function getProfile(strategy = 'accumulation') {
  if (!Object.hasOwn(PROFILES,strategy)) throw Object.assign(new Error('Choose long-term accumulation or day trading.'),{status:400});
  return PROFILES[strategy];
}

export function reviewExpiresAt(analysis, profile) {
  return Math.min(analysis.generatedAt + profile.reviewTtlSeconds, analysis.lastClosedAt + profile.intervalSeconds);
}
