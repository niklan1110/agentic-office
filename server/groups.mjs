// Skill groups: the area each skill is for, so the team page can show them by area.
// The first rule whose pattern matches a skill's name wins; when no name rule
// matches, the description rules run the same way; anything left is "Other".
// A skill added to skills/ lands in a group by itself. A SKILL.md can also name
// its group outright with a `group:` (or `category:`) frontmatter field holding a group id.

export const GROUPS = Object.freeze([
  { id: 'planning', label: 'Planning & workflow', blurb: 'Turn ideas into specs, plans and task lists; decide what to build and in what steps.' },
  { id: 'frontend', label: 'Web & frontend', blurb: 'React, Vue, Next.js and other web UI work, in the browser.' },
  { id: 'design', label: 'Design & UX', blurb: 'Interfaces, design systems, motion, brand and diagrams.' },
  { id: 'backend', label: 'Backend & APIs', blurb: 'Servers, frameworks, APIs and integrations.' },
  { id: 'data', label: 'Data & ML', blurb: 'Databases, migrations, pipelines and machine learning.' },
  { id: 'languages', label: 'Languages', blurb: 'Idioms and standards for one programming language.' },
  { id: 'mobile', label: 'Mobile & desktop apps', blurb: 'iOS, Android, Flutter, React Native and desktop.' },
  { id: 'testing', label: 'Testing & QA', blurb: 'Tests, TDD, end-to-end checks, evals and verification.' },
  { id: 'quality', label: 'Code quality & review', blurb: 'Reviews, simplification, debugging, refactors and audits.' },
  { id: 'security', label: 'Security & compliance', blurb: 'Hardening, vulnerability reviews and regulated data.' },
  { id: 'devops', label: 'DevOps & infrastructure', blurb: 'CI/CD, containers, deploys, git, networks and monitoring.' },
  { id: 'agents', label: 'AI agents & LLMs', blurb: 'Building, running and tuning agents, prompts and context.' },
  { id: 'gateway', label: 'LLM gateway tools', blurb: 'The omni-* and cli-* skills for running an LLM gateway: providers, routing, keys, cost.' },
  { id: 'docs', label: 'Docs & writing', blurb: 'Documentation, decision records, onboarding and articles.' },
  { id: 'research', label: 'Research & analysis', blurb: 'Web and literature research, markets and competitors.' },
  { id: 'marketing', label: 'Marketing & content', blurb: 'Content, social, brand voice, SEO and investor outreach.' },
  { id: 'media', label: 'Video & media', blurb: 'Video editing, generation, animation and slides.' },
  { id: 'business', label: 'Business operations', blurb: 'Billing, logistics, procurement, healthcare and other ops.' },
  { id: 'other', label: 'Other', blurb: 'Skills that fit no other group.' },
])

// Skills whose names mislead the rules below.
const EXACT = {
  'api-and-interface-design': 'backend',
  'api-design': 'backend',
  'loop-design-check': 'agents',
  'inventory-demand-planning': 'business',
  'agent-architecture-audit': 'agents',
  'agent-introspection-debugging': 'agents',
  'ecc-tools-cost-audit': 'agents',
  'regex-vs-llm-structured-text': 'agents',
  'scientific-db-pubmed-database': 'research',
  'scientific-db-uspto-database': 'research',
  'ai-first-engineering': 'agents',
  'evm-token-decimals': 'backend',
  'opensource-pipeline': 'devops',
  'data-scraper-agent': 'data',
}

// [group, pattern on the skill's folder name]
const BY_NAME = [
  ['gateway', /^(omni-|cli-)/],
  ['security', /secur|^safety-guard$|^gateguard$|hipaa|phi-compliance|security-bounty/],
  ['testing', /testing|-tdd$|^tdd-|^e2e-|browser-qa|-verification$|^verification-loop$|^eval-harness$|^agent-eval$|regression|windows-desktop-e2e|^benchmark$/],
  ['planning', /^spec-|planning|^idea-refine$|^interview-me$|^blueprint$|^plan-|intent-driven|constraint-driven|doubt-driven|contract-first|^product-|decision-ledger|^orch-|^council$|santa-method|rfc-pipeline|project-flow|^using-agent-skills$|^incremental-implementation$|source-driven/],
  ['mobile', /android|compose-multiplatform|react-native|swiftui|^swift-|flutter|foundation-models|ios-icon/],
  ['design', /design|liquid-glass|interfaces-feel|^motion-|^brand-discovery$|^archify$|^ui-demo$/],
  ['frontend', /frontend|^react-|^vue-|nuxt|nextjs|angular|^vite-|ui-to-vue|^accessibility$|i18n|^browser-testing/],
  ['backend', /^api-|backend|django|fastapi|laravel|rails|springboot|quarkus|nestjs|dotnet|jpa-|ktor|exposed|mcp-server|error-handling|hexagonal|cache-pattern|^redis-|latency-critical|tinystruct|mailtrap|^x-api$|jira|bun-runtime|^nodejs-/],
  ['data', /postgres|mysql|clickhouse|prisma|database|data-|dashboard|pytorch|recsys|^mle-|^ml-|regex-vs-llm/],
  ['languages', /^(python|golang|rust|perl|cpp|java|kotlin|csharp|fsharp)-|coding-standards$|flox-/],
  ['quality', /code-review|simplif|^ponytail|plankton|codehealth|legacy-style|^repo-scan$|-audit$|debugging|deprecation|performance|^code-tour$|refine-code|^benchmark-/],
  ['devops', /ci-cd|docker|kubernetes|deployment|shipping|observability|canary|^git-|github|uncloud|homelab|network|cisco|netmiko|^terminal-|delivery-gate|^config-gc$/],
  ['agents', /agent|agentic|autonomous|continuous-|context-|llm|prompt|team-|dev-team|devfleet|council-multi|gan-style|retrieval|memory|token-budget|^skill-|hookify|rules-distill|workflow-mode|dmux|nanoclaw|openclaw|^ito-|nasiko|parallel-execution|loop-design|approval-loop|^ck$|^ecc-|configure-ecc|codex|hermes|strategic-compact|^search-first$/],
  ['docs', /documentation|architecture-decision|living-docs|onboarding|article-writing|installer|esign|document-processing|doc-translate|agreement-generator/],
  ['research', /research|exa-search|competitive|scientific|prediction-market|lead-intelligence/],
  ['marketing', /content-engine|crosspost|social|marketing|brand-voice|^seo$|growth|investor|email-ops|messages-ops/],
  ['media', /video|remotion|manim|^taste|fal-ai|slides|blender/],
  ['business', /billing|carrier|logistics|inventory|production-scheduling|nonconformance|procurement|customs|counterparty|knowledge-ops|workspace-ops|-ops$|healthcare|notifications|connections|cost-tracking|payment/],
]

// [group, pattern on the description], for names no rule above knows.
const BY_DESCRIPTION = [
  ['security', /\bsecurity|vulnerab|compliance\b/i],
  ['testing', /\btest(s|ing)?\b|\bqa\b/i],
  ['frontend', /\b(react|vue|svelte|frontend|css|browser|web app)\b/i],
  ['design', /\b(design|ui|ux|typography|animation)\b/i],
  ['mobile', /\b(ios|android|mobile)\b/i],
  ['backend', /\b(api|server|backend|endpoint)\b/i],
  ['data', /\b(database|sql|data pipeline|machine learning)\b/i],
  ['devops', /\b(deploy|ci\/cd|docker|kubernetes|infrastructure)\b/i],
  ['agents', /\b(agent|llm|prompt|claude)\b/i],
  ['planning', /\b(plan|spec|roadmap|requirements)\b/i],
  ['docs', /\b(docs?|documentation|readme)\b/i],
  ['research', /\bresearch\b/i],
  ['media', /\b(video|image|audio)\b/i],
  ['marketing', /\b(marketing|social|content)\b/i],
]

const IDS = new Set(GROUPS.map((g) => g.id))

export function groupOf(name, description = '', declared = '') {
  const own = String(declared).toLowerCase().trim()

  if (IDS.has(own)) return own
  if (Object.hasOwn(EXACT, name)) return EXACT[name]

  return BY_NAME.find(([, re]) => re.test(name))?.[0] ?? BY_DESCRIPTION.find(([, re]) => re.test(description))?.[0] ?? 'other'
}
