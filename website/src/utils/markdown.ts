import { marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";

// GitHub-style heading ids so deep links (e.g. #the-tools) work everywhere we
// render markdown — guides, breaches, changelog.
marked.use(gfmHeadingId());

export function parseMarkdown(markdown: string): string | Promise<string> {
  return marked.parse(markdown);
}
