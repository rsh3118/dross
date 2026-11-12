type Input = { userId: string; agentRunId: number; request: string }

const IGNORED_PATH = /^(node_modules|\.next|public\/|pnpm-lock|package-lock|\.git)/
const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|css|md|mdx|json|ya?ml|txt)$/

export async function codeChangeWorkflow(input: Input) {
  'use workflow'

  await markRunning(input.agentRunId, input.request)

  try {
    const repo = await loadRepoContext(input.agentRunId)
    const plan = await planChange(input.agentRunId, input.request, repo.tree)
    const files = await readTargetFiles(input.agentRunId, plan.files, repo.baseBranch)
    const patch = await generatePatch(input.agentRunId, input.request, plan, files)
    const pr = await pushAndOpenPr(input.agentRunId, repo.baseBranch, patch)
    await finish(input.agentRunId, input.userId, input.request, pr, patch)
    return pr
  } catch (err) {
    await fail(input.agentRunId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

async function markRunning(agentRunId: number, request: string) {
  'use step'
  const { appendLog, setRunStatus } = await import('@/lib/agents/runlog')
  await setRunStatus(agentRunId, 'running')
  await appendLog(agentRunId, `Change request: ${request}`)
}

async function loadRepoContext(agentRunId: number) {
  'use step'
  const { getOctokit, getDefaultBranch, listRepoTree } = await import('@/lib/github')
  const { appendLog } = await import('@/lib/agents/runlog')

  const octokit = await getOctokit()
  const baseBranch = await getDefaultBranch(octokit)
  const tree = (await listRepoTree(octokit, baseBranch))
    .filter((f) => !IGNORED_PATH.test(f.path) && TEXT_EXT.test(f.path))
    .map((f) => f.path)
  await appendLog(agentRunId, `Read ${tree.length} source files from ${baseBranch}`)
  return { baseBranch, tree }
}

async function planChange(agentRunId: number, request: string, tree: string[]) {
  'use step'
  const { generateText, Output } = await import('ai')
  const { z } = await import('zod')
  const { appendLog } = await import('@/lib/agents/runlog')

  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4.5',
    output: Output.object({
      schema: z.object({
        branch: z.string().describe('kebab-case branch name, no prefix'),
        title: z.string().describe('PR title, imperative mood, under 70 chars'),
        files: z
          .array(z.string())
          .max(8)
          .describe('Existing file paths to read before editing. Only paths from the tree.'),
        approach: z.string().describe('2-4 sentence implementation approach'),
      }),
    }),
    system:
      'You are a senior engineer planning a small, focused change to a Next.js 16 + Tailwind v4 + Drizzle codebase called dross. Keep scope minimal. Never touch auth, secrets, or database schema unless the request explicitly demands it.',
    prompt: `Change request:\n${request}\n\nRepository files:\n${tree.join('\n')}\n\nPlan the change.`,
  })
  await appendLog(agentRunId, `Plan: ${output.approach}`)
  return output
}

async function readTargetFiles(agentRunId: number, paths: string[], ref: string) {
  'use step'
  const { getOctokit, readRepoFile } = await import('@/lib/github')
  const { appendLog } = await import('@/lib/agents/runlog')

  const octokit = await getOctokit()
  const files: { path: string; content: string }[] = []
  for (const path of paths) {
    const content = await readRepoFile(octokit, path, ref)
    if (content !== null && content.length < 60_000) files.push({ path, content })
  }
  await appendLog(agentRunId, `Loaded ${files.length} files for editing`)
  return files
}

type Plan = { branch: string; title: string; approach: string }

async function generatePatch(
  agentRunId: number,
  request: string,
  plan: Plan,
  files: { path: string; content: string }[],
) {
  'use step'
  const { generateText, Output } = await import('ai')
  const { z } = await import('zod')
  const { appendLog } = await import('@/lib/agents/runlog')

  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4.5',
    output: Output.object({
      schema: z.object({
        files: z
          .array(z.object({ path: z.string(), content: z.string() }))
          .min(1)
          .max(8)
          .describe('Complete new contents for each changed or created file'),
        summary: z.string().describe('PR body in markdown: what changed and why, plus how to verify'),
      }),
    }),
    system:
      'You write production-quality TypeScript/React for a Next.js 16 App Router project using Tailwind v4, shadcn (base-ui), Drizzle ORM, and Better Auth. Return the FULL content of every file you change; never return diffs or partial files. Do not invent files outside the request scope.',
    prompt: `Request:\n${request}\n\nApproach:\n${plan.approach}\n\nCurrent files:\n${files
      .map((f) => `=== ${f.path} ===\n${f.content}`)
      .join('\n\n')}`,
  })
  await appendLog(agentRunId, `Generated changes for ${output.files.map((f) => f.path).join(', ')}`)
  return { ...output, branch: plan.branch, title: plan.title }
}

async function pushAndOpenPr(
  agentRunId: number,
  baseBranch: string,
  patch: { branch: string; title: string; summary: string; files: { path: string; content: string }[] },
) {
  'use step'
  const { getOctokit, createBranch, commitFiles, openPullRequest } = await import('@/lib/github')
  const { appendLog } = await import('@/lib/agents/runlog')

  const octokit = await getOctokit()
  const branch = `dross-agent/${patch.branch}-${Date.now().toString(36)}`
  await createBranch(octokit, baseBranch, branch)
  await commitFiles(octokit, branch, patch.files, patch.title)
  const pr = await openPullRequest(octokit, {
    head: branch,
    base: baseBranch,
    title: patch.title,
    body: `${patch.summary}\n\n---\n_Opened by the dross code agent. Review before merging._`,
  })
  await appendLog(agentRunId, `Opened PR #${pr.number}: ${pr.url}`)
  return { ...pr, branch }
}

async function finish(
  agentRunId: number,
  userId: string,
  request: string,
  pr: { number: number; url: string; branch: string },
  patch: { title: string; summary: string; files: { path: string }[] },
) {
  'use step'
  const { db } = await import('@/lib/db')
  const { agentRuns, proposals } = await import('@/lib/db/schema')
  const { eq } = await import('drizzle-orm')
  const { setRunStatus, pushNotification } = await import('@/lib/agents/runlog')

  const [run] = await db.select({ runId: agentRuns.runId }).from(agentRuns).where(eq(agentRuns.id, agentRunId))
  await db.insert(proposals).values({
    userId,
    agent: 'code',
    runId: run?.runId ?? null,
    kind: 'code_change',
    title: patch.title,
    rationale: `Requested: "${request}". Merge squashes PR #${pr.number} into the default branch; Close PR closes it unmerged.`,
    payload: { prNumber: pr.number, prUrl: pr.url, branch: pr.branch, files: patch.files.map((f) => f.path) },
  })
  await setRunStatus(agentRunId, 'completed', { summary: `PR #${pr.number}: ${pr.url}` })
  await pushNotification({
    userId,
    kind: 'agent',
    title: `Code agent opened PR #${pr.number}`,
    body: patch.summary.slice(0, 280),
    href: '/proposals',
  })
}

async function fail(agentRunId: number, message: string) {
  'use step'
  const { appendLog, setRunStatus } = await import('@/lib/agents/runlog')
  await appendLog(agentRunId, message, 'error')
  await setRunStatus(agentRunId, 'failed', { error: message })
}
