import type { ExtractedPage, PositionedSpan } from './model.js';

/** A continuous reading area for records that continue on the next page.
 * Source page numbers remain attached to spans. Repeated margin chrome is
 * excluded on detail pages; the original extraction is never modified.
 */
export function joinPages(pages: readonly ExtractedPage[]): ExtractedPage {
  const first = pages[0];
  const width = first?.width ?? 595;
  const spans: PositionedSpan[] = [];
  let bottom: number | undefined;
  for (const page of pages) {
    const content = page.spans.filter(
      (span) =>
        page.number === 1 ||
        (span.y > page.height * 0.06 && span.y < page.height * 0.91),
    );
    if (content.length === 0) continue;
    const top = content.reduce(
      (highest, span) => Math.max(highest, span.y),
      -Infinity,
    );
    const offset = bottom === undefined ? 0 : bottom - 13 - top;
    for (const span of content) {
      spans.push({
        ...span,
        page: page.number,
        x: (span.x * width) / page.width,
        width: (span.width * width) / page.width,
        y: span.y + offset,
      });
    }
    bottom =
      content.reduce((lowest, span) => Math.min(lowest, span.y), Infinity) +
      offset;
  }
  return {
    number: first?.number ?? 1,
    width,
    height: first?.height ?? 842,
    spans,
  };
}
