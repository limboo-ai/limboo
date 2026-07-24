/**
 * Auto-categorize an MCP server into one of the logical groups the MCP workspace
 * list uses, so a user with dozens of servers isn't scrolling one flat list.
 * Pure heuristic over the server's name / command / url — never blocks a save,
 * and the user can always override the assignment.
 */
import type { McpCategory } from '@shared/types';

const RULES: Array<{ category: McpCategory; re: RegExp }> = [
  { category: 'version-control', re: /\b(git|github|gitlab|bitbucket|gitea|svn)\b/ },
  { category: 'issue-tracker', re: /\b(jira|linear|asana|trello|shortcut|clickup|youtrack)\b/ },
  { category: 'database', re: /\b(postgres|postgresql|mysql|mariadb|sqlite|mongo|mongodb|redis|dbhub|snowflake|bigquery|supabase|planetscale|clickhouse|sql)\b/ },
  { category: 'cloud', re: /\b(aws|amazon|azure|gcp|google-?cloud|cloudflare|vercel|netlify|heroku|digitalocean|render)\b/ },
  { category: 'deployment', re: /\b(deploy|kubernetes|k8s|helm|terraform|pulumi|ansible|argo)\b/ },
  { category: 'container', re: /\b(docker|podman|containerd|compose)\b/ },
  { category: 'monitoring', re: /\b(sentry|datadog|grafana|prometheus|statsig|newrelic|honeycomb|pagerduty|opentelemetry)\b/ },
  { category: 'communication', re: /\b(slack|discord|telegram|teams|mattermost|twilio|gmail|email|smtp)\b/ },
  { category: 'browser', re: /\b(playwright|puppeteer|browser|chrome|selenium|browserbase)\b/ },
  { category: 'documentation', re: /\b(docs?|notion|confluence|readme|context7|mintlify|gitbook)\b/ },
  { category: 'ai', re: /\b(openai|anthropic|huggingface|replicate|perplexity|embedding|llm|vector|pinecone|weaviate|qdrant|chroma)\b/ },
  { category: 'search', re: /\b(search|elastic|elasticsearch|algolia|meilisearch|brave|tavily|exa)\b/ },
  { category: 'memory', re: /\b(memory|knowledge|recall|mem0)\b/ },
  { category: 'filesystem', re: /\b(filesystem|file-?system|files?|fs|storage|s3|gdrive|dropbox)\b/ },
  { category: 'productivity', re: /\b(calendar|todo|task|sheet|airtable|excel|figma|drive|docs)\b/ },
];

/** Best-effort category for a server given its identifying strings. */
export function categorizeServer(name: string, command?: string, url?: string): McpCategory {
  const hay = `${name} ${command ?? ''} ${url ?? ''}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.re.test(hay)) return rule.category;
  }
  return 'custom';
}
