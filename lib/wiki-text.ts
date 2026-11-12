export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled'
  )
}

/** Extracts [[Wiki Link]] targets from markdown content. */
export function extractWikiLinks(content: string) {
  const out = new Set<string>()
  for (const m of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) {
    out.add(slugify(m[1]))
  }
  return [...out]
}

/** Converts [[Title]] / [[Title|label]] into markdown links to /wiki/slug. */
export function renderWikiLinks(content: string) {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => {
    return `[${label ?? target}](/wiki/${slugify(target)})`
  })
}
