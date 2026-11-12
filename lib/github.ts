import 'server-only'
import { Octokit } from '@octokit/rest'
import { getToken } from '@vercel/connect'

const GITHUB_CONNECTOR = 'github/dross-code-agent'

export const REPO = { owner: 'rsh3118', repo: 'dross' } as const

export async function getOctokit() {
  const token = await getToken(GITHUB_CONNECTOR, {
    subject: { type: 'app' },
    scopes: ['contents:write', 'pull_requests:write', 'metadata:read'],
  })
  return new Octokit({ auth: token })
}

export async function getDefaultBranch(octokit: Octokit) {
  const { data } = await octokit.repos.get(REPO)
  return data.default_branch
}

export type RepoFile = { path: string; content: string }

export async function listRepoTree(octokit: Octokit, ref: string) {
  const { data } = await octokit.git.getTree({ ...REPO, tree_sha: ref, recursive: 'true' })
  return data.tree
    .filter((t) => t.type === 'blob' && t.path)
    .map((t) => ({ path: t.path as string, size: t.size ?? 0 }))
}

export async function readRepoFile(octokit: Octokit, path: string, ref: string) {
  const { data } = await octokit.repos.getContent({ ...REPO, path, ref })
  if (Array.isArray(data) || data.type !== 'file') return null
  return Buffer.from(data.content, 'base64').toString('utf8')
}

export async function createBranch(octokit: Octokit, base: string, name: string) {
  const { data: ref } = await octokit.git.getRef({ ...REPO, ref: `heads/${base}` })
  await octokit.git.createRef({ ...REPO, ref: `refs/heads/${name}`, sha: ref.object.sha })
  return ref.object.sha
}

export async function commitFiles(
  octokit: Octokit,
  branch: string,
  files: RepoFile[],
  message: string,
) {
  for (const file of files) {
    let sha: string | undefined
    try {
      const { data } = await octokit.repos.getContent({ ...REPO, path: file.path, ref: branch })
      if (!Array.isArray(data) && data.type === 'file') sha = data.sha
    } catch {
      sha = undefined
    }
    await octokit.repos.createOrUpdateFileContents({
      ...REPO,
      path: file.path,
      branch,
      message,
      content: Buffer.from(file.content, 'utf8').toString('base64'),
      ...(sha && { sha }),
    })
  }
}

export async function openPullRequest(
  octokit: Octokit,
  opts: { head: string; base: string; title: string; body: string },
) {
  const { data } = await octokit.pulls.create({ ...REPO, ...opts })
  return { number: data.number, url: data.html_url }
}
