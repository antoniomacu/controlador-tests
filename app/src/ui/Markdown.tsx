import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** Renders explanation Markdown from the bank, sanitised before insertion. */
export function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
  return <div class="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
