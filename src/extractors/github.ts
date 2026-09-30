/**
 * GitHub adapter. GitHub's code view renders lines lazily, so the DOM text is
 * incomplete; the page keeps the full file in a hidden textarea. Pull requests use the .diff view.
 */

const MAX_DIFF_CHARS = 150_000;

const LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  md: 'markdown',
  html: 'html',
  css: 'css',
  sql: 'sql',
  vue: 'vue',
  svelte: 'svelte',
};

export interface GitHubContent {
  title: string;
  markdown: string;
  source: 'github-code' | 'github-diff';
}

export function isGitHubUrl(url: URL): boolean {
  return url.hostname === 'github.com';
}

function fence(code: string, language = ''): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((match) => match[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}${language}\n${code}\n${ticks}`;
}

function readFileText(doc: Document): string | undefined {
  const textarea = doc.querySelector<HTMLTextAreaElement>('#read-only-cursor-text-area');
  if (textarea?.value) return textarea.value;
  for (const script of doc.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
    try {
      const data = JSON.parse(script.textContent ?? '') as {
        payload?: { blob?: { rawLines?: string[] } };
      };
      const lines = data.payload?.blob?.rawLines;
      if (Array.isArray(lines)) return lines.join('\n');
    } catch {
      // Not the JSON we're looking for.
    }
  }
  return undefined;
}

export async function extractGitHub(doc: Document, url: URL): Promise<GitHubContent | undefined> {
  const parts = url.pathname.split('/').filter(Boolean);
  const [owner, repo, section, id] = parts;
  if (!owner || !repo) return undefined;

  if (section === 'blob') {
    const text = readFileText(doc);
    if (!text) return undefined;
    const fileName = parts.at(-1) ?? '';
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';
    const path = parts.slice(4).join('/');
    return {
      title: `${path} · ${owner}/${repo}`,
      markdown: `File \`${path}\` in ${owner}/${repo}:\n\n${fence(text, LANGUAGES[extension ?? ''] ?? '')}`,
      source: 'github-code',
    };
  }

  if (section === 'pull' && id && /^\d+$/.test(id)) {
    const response = await fetch(`https://github.com/${owner}/${repo}/pull/${id}.diff`, {
      credentials: 'include',
    });
    if (!response.ok) return undefined;
    let diff = await response.text();
    if (diff.length > MAX_DIFF_CHARS) diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n… (diff truncated)`;
    const title =
      doc.querySelector('.js-issue-title, [data-testid="issue-title"]')?.textContent?.trim() ??
      doc.title;
    const description = doc.querySelector('.comment-body')?.textContent?.trim() ?? '';
    const intro = `Pull request #${id} in ${owner}/${repo}: ${title}`;
    return {
      title: `${title} · PR #${id}`,
      markdown: [intro, description && `Description:\n${description}`, fence(diff, 'diff')]
        .filter(Boolean)
        .join('\n\n'),
      source: 'github-diff',
    };
  }
  return undefined;
}
