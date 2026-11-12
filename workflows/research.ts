import { FatalError } from 'workflow'

type Input = { userId: string; agentRunId: number; topic: string; taskId?: number }

export async function researchWorkflow(input: Input) {
  'use workflow'

  await markRunning(input.agentRunId, input.topic)

  try {
    const plan = await planQuestions(input.agentRunId, input.topic)
    const findings = await searchWeb(input.agentRunId, input.topic, plan.questions)
    const page = await writePage(input.agentRunId, input.userId, input.topic, findings, input.taskId)
    await finish(input.agentRunId, input.userId, page.slug, page.title, input.taskId)
    return { pageSlug: page.slug }
  } catch (err) {
    await fail(input.agentRunId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

async function markRunning(agentRunId: number, topic: string) {
  'use step'
  const { appendLog, setRunStatus } = await import('@/lib/agents/runlog')
  await setRunStatus(agentRunId, 'running')
  await appendLog(agentRunId, `Researching: ${topic}`)
}

async function planQuestions(agentRunId: number, topic: string) {
  'use step'
  const { generateText, Output } = await import('ai')
  const { z } = await import('zod')
  const { appendLog } = await import('@/lib/agents/runlog')

  const { output } = await generateText({
    model: 'anthropic/claude-haiku-4.5',
    output: Output.object({
      schema: z.object({
        title: z.string().describe('A clean wiki page title for this topic'),
        questions: z.array(z.string()).min(2).max(5).describe('Concrete research questions to answer'),
      }),
    }),
    prompt: `You are planning research for a personal knowledge base. Topic or request:\n\n${topic}\n\nProduce a wiki page title and 2-5 specific, answerable research questions that together would give a practical, well-rounded understanding.`,
  })
  await appendLog(agentRunId, `Planned ${output.questions.length} questions: ${output.questions.join(' · ')}`)
  return output
}

type Finding = { question: string; answer: string; sources: { title: string; url: string }[] }

async function searchWeb(agentRunId: number, topic: string, questions: string[]) {
  'use step'
  const { generateText } = await import('ai')
  const { appendLog } = await import('@/lib/agents/runlog')

  const findings: Finding[] = []
  for (const question of questions) {
    const result = await generateText({
      model: 'perplexity/sonar-pro',
      system:
        'You are a meticulous research assistant. Answer with concrete facts, numbers, dates and named entities. Cite sources inline as [n]. Prefer primary and recent sources.',
      prompt: `Context: ${topic}\n\nQuestion: ${question}`,
    })
    const sources = (result.sources ?? [])
      .filter((s): s is Extract<typeof s, { sourceType: 'url' }> => s.sourceType === 'url')
      .map((s) => ({ title: s.title ?? new URL(s.url).hostname, url: s.url }))
    findings.push({ question, answer: result.text, sources })
    await appendLog(agentRunId, `Answered "${question}" with ${sources.length} sources`)
  }
  return findings
}

async function writePage(
  agentRunId: number,
  userId: string,
  topic: string,
  findings: Finding[],
  taskId?: number,
) {
  'use step'
  const { generateText, Output } = await import('ai')
  const { z } = await import('zod')
  const { appendLog } = await import('@/lib/agents/runlog')
  const { createWikiPage } = await import('@/lib/wiki')
  const { db } = await import('@/lib/db')
  const { tasks } = await import('@/lib/db/schema')
  const { eq } = await import('drizzle-orm')

  const allSources = dedupe(findings.flatMap((f) => f.sources))
  const sourceIndex = allSources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n')
  const notes = findings.map((f) => `## ${f.question}\n${f.answer}`).join('\n\n')

  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4.6',
    output: Output.object({
      schema: z.object({
        title: z.string(),
        summary: z.string().max(300).describe('One-sentence summary'),
        tags: z.array(z.string()).max(6).describe('lowercase single-word tags'),
        markdown: z.string().describe('The full wiki page body in markdown'),
      }),
    }),
    system: `You write pages for a personal wiki. Style: dense, practical, skimmable. Use ## headings, short paragraphs, bullet lists, and a final "## Key takeaways" section. Cite sources inline with [n] using the provided numbering; do NOT invent sources or URLs. Do not include a sources section — it is rendered separately. Do not start with the title as a heading.`,
    prompt: `Topic/request:\n${topic}\n\nResearch notes:\n${notes}\n\nNumbered sources:\n${sourceIndex}`,
  })

  const page = await createWikiPage({
    userId,
    title: output.title,
    content: output.markdown,
    summary: output.summary,
    tags: [...new Set([...output.tags.map((t) => t.toLowerCase()), 'research'])],
    sources: allSources,
    status: 'draft',
    authoredBy: 'research-agent',
  })
  if (taskId) {
    await db.update(tasks).set({ researchPageId: page.id, updatedAt: new Date() }).where(eq(tasks.id, taskId))
  }
  await appendLog(agentRunId, `Wrote draft page "${page.title}" (${page.slug}) with ${allSources.length} sources`)
  return { slug: page.slug, title: page.title }
}

async function finish(agentRunId: number, userId: string, slug: string, title: string, taskId?: number) {
  'use step'
  const { setRunStatus, pushNotification } = await import('@/lib/agents/runlog')
  await setRunStatus(agentRunId, 'completed', { summary: `Draft: ${title}` })
  await pushNotification({
    userId,
    kind: 'agent',
    title: `Research ready: ${title}`,
    body: taskId ? 'Linked to your task. Review the draft and publish when happy.' : 'Review the draft and publish when happy.',
    href: `/wiki/${slug}`,
  })
}

async function fail(agentRunId: number, message: string) {
  'use step'
  const { setRunStatus, appendLog } = await import('@/lib/agents/runlog')
  await appendLog(agentRunId, message, 'error')
  await setRunStatus(agentRunId, 'failed', { error: message })
  if (/NOTIFY|FORBIDDEN|401|403/.test(message)) throw new FatalError(message)
}

function dedupe(sources: { title: string; url: string }[]) {
  const seen = new Set<string>()
  return sources.filter((s) => {
    const key = s.url.replace(/[#?].*$/, '').replace(/\/$/, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 20)
}
