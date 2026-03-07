export function stripFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) return content;

  const endIndex = trimmed.indexOf('\n---', 3);
  if (endIndex === -1) return content;

  return trimmed.slice(endIndex + 4).trim();
}
