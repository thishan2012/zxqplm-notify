// The 20 monitored services, split into two shards (a/b) so the two
// notify workflows can run in parallel instead of one long sequential run.
//
// `format`: "auto" (default — sniff JSON vs XML), "atom", or "json-gc"
// (Google Cloud incidents.json).
// `verify: true` means the feed URL was flagged "verify before use" in the
// source list — run the Smoke Feeds workflow after setup to confirm.

export const SERVICES = [
  // Shard A (1–10)
  { id: 'openai',     shard: 'a', name: 'OpenAI',                url: 'https://status.openai.com/feed.rss',                       format: 'auto' },
  { id: 'xai',        shard: 'a', name: 'xAI / Grok',            url: 'https://status.x.ai/feed.xml',                             format: 'auto' },
  { id: 'slack',      shard: 'a', name: 'Slack',                 url: 'https://slack-status.com/feed/rss',                        format: 'auto' },
  { id: 'gitlab',     shard: 'a', name: 'GitLab',                url: 'https://status.gitlab.com/pages/5b36dc6502d06804c08349f7/rss', format: 'auto' },
  { id: 'docker',     shard: 'a', name: 'Docker',                url: 'https://www.dockerstatus.com/pages/533c6539221ae15e3f000031/rss', format: 'auto' },
  { id: 'algolia',    shard: 'a', name: 'Algolia',               url: 'https://status.algolia.com/history.rss',                   format: 'auto' },
  { id: 'azure',      shard: 'a', name: 'Microsoft Azure',       url: 'https://rssfeed.azure.status.microsoft/en-us/status/feed/', format: 'auto' },
  { id: 'aws-ec2',    shard: 'a', name: 'AWS (EC2 us-east-1)',   url: 'https://status.aws.amazon.com/rss/ec2-us-east-1.rss',      format: 'auto' },
  { id: 'gcloud',     shard: 'a', name: 'Google Cloud',          url: 'https://status.cloud.google.com/incidents.json',           format: 'json-gc' },
  { id: 'github',     shard: 'a', name: 'GitHub',                url: 'https://www.githubstatus.com/history.rss',                 format: 'auto' },

  // Shard B (11–20)
  { id: 'meta-ads',   shard: 'b', name: 'Meta Ads Manager',      url: 'https://metastatus.com/outage-events-feed-ads-manager.rss', format: 'auto' },
  { id: 'cloudflare', shard: 'b', name: 'Cloudflare',            url: 'https://www.cloudflarestatus.com/history.atom',            format: 'atom' },
  { id: 'anthropic',  shard: 'b', name: 'Anthropic / Claude',    url: 'https://status.claude.com/history.rss',                    format: 'auto', verify: true },
  { id: 'discord',    shard: 'b', name: 'Discord',               url: 'https://discordstatus.com/history.rss',                    format: 'auto', verify: true },
  { id: 'stripe',     shard: 'b', name: 'Stripe',                url: 'https://www.stripestatus.com/history.rss',                 format: 'auto' },
  { id: 'netlify',    shard: 'b', name: 'Netlify',               url: 'https://www.netlifystatus.com/history.rss',                format: 'auto' },
  { id: 'zoom',       shard: 'b', name: 'Zoom',                  url: 'https://www.zoomstatus.com/history.rss',                   format: 'auto' },
  // Not a feed URL as shipped — /history.rss is the statuspage.io convention; verify with the Smoke Feeds workflow.
  { id: 'vercel',     shard: 'b', name: 'Vercel',                url: 'https://www.vercel-status.com/history.rss',                format: 'auto', verify: true },
  // Same story — verify the feed URL with the Smoke Feeds workflow.
  { id: 'supabase',   shard: 'b', name: 'Supabase',              url: 'https://status.supabase.com/history.rss',                  format: 'auto', verify: true },
  { id: 'arena',      shard: 'b', name: 'Arena AI',              url: 'https://status.arena.ai/feed.rss',                         format: 'auto' },
];

export function findService(id) {
  const needle = String(id || '').trim().toLowerCase();
  return SERVICES.find((s) => s.id === needle) || null;
}

export function servicesForShard(shard) {
  return SERVICES.filter((s) => s.shard === shard);
}
