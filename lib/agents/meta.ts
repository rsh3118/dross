import type { AgentName } from '@/lib/db/schema'

export const AGENT_META: Record<
  AgentName,
  { label: string; description: string; schedule: string; output: string }
> = {
  research: {
    label: 'Research',
    description: 'Searches the web on a topic, collates sources, and writes a draft wiki page.',
    schedule: 'Hourly sweep for research-tagged tasks, or on demand.',
    output: 'Draft wiki page with citations',
  },
  housekeeping: {
    label: 'Housekeeping',
    description: 'Finds duplicate pages, broken links, stale tasks, and untagged content. Proposes fixes.',
    schedule: 'Nightly at 03:00 UTC.',
    output: 'Proposals for your approval',
  },
  newsletter: {
    label: 'Newsletter',
    description: 'Cross-references your interests with the web and your hub, then writes a digest.',
    schedule: 'Weekly, per your settings.',
    output: 'Emailed digest + archive',
  },
  notify: {
    label: 'Priority brief',
    description: 'Scans due and overdue tasks and sends a short brief when something needs attention.',
    schedule: 'Every 6 hours (respects quiet hours).',
    output: 'Inbox notification + email',
  },
  code: {
    label: 'Code change',
    description: 'Turns a plain-language request into a pull request against the dross repository.',
    schedule: 'On demand.',
    output: 'GitHub pull request',
  },
}
