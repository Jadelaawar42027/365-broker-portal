/**
 * File: apps/web/src/components/training/lesson-body.tsx
 * Purpose: Renders lesson text (shared lesson Markdown) as the mockup 2b styles: paragraphs, headings, lists, tables
 * and the manual's callouts (WATCH amber, NEVER navy, HOUSE RULE blue, EDGE green, FIELD NOTE grey). Everything is
 * rendered as text elements, never as raw HTML.
 *
 * Functions:
 * - Inlines({ items }): one line of text with bold, italic and links.
 * - Blocks({ blocks, inverted }): renders a list of blocks (used inside callouts too).
 * - LessonBody({ markdown }): parses the lesson text and renders it.
 */
import { parseLessonMarkdown, type CalloutKind, type Inline, type LessonBlock } from "@bp/shared";
import { rowCells } from "@/lib/lesson-table";

const CALLOUT_STYLES: Record<CalloutKind, { box: string; label: string }> = {
  WATCH: { box: "bg-[#fdf3e3] text-[#5b3a10]", label: "text-warn" },
  NEVER: { box: "bg-navy text-white", label: "text-[#ff9a9a]" },
  "HOUSE RULE": { box: "bg-brand-soft text-ink", label: "text-brand" },
  EDGE: { box: "bg-success-soft text-[#123f24]", label: "text-success" },
  "FIELD NOTE": { box: "bg-neutral-soft text-ink", label: "text-muted" },
};

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((item, index) => {
        if (item.type === "strong") return <strong key={index} className="font-bold">{item.text}</strong>;
        if (item.type === "em") return <em key={index}>{item.text}</em>;
        if (item.type === "link") {
          return (
            <a key={index} href={item.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">
              {item.text}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          );
        }
        return <span key={index}>{item.text}</span>;
      })}
    </>
  );
}

function Blocks({ blocks, inverted = false }: { blocks: LessonBlock[]; inverted?: boolean }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return block.level === 2 ? (
            <h2 key={index} className="text-2xl font-extrabold">{block.text}</h2>
          ) : (
            <h3 key={index} className="text-xl font-bold">{block.text}</h3>
          );
        }
        if (block.type === "paragraph") {
          return (
            <p key={index} className="text-lg leading-relaxed">
              <Inlines items={block.inlines} />
            </p>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index} className={`space-y-2 pl-6 text-lg leading-relaxed ${block.ordered ? "list-decimal" : "list-disc"}`}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inlines items={item} />
                </li>
              ))}
            </Tag>
          );
        }
        if (block.type === "table") {
          return (
            <div key={index} className="overflow-x-auto rounded-2xl border border-line">
              <table className="w-full border-collapse text-left text-base sm:text-[17px]">
                <thead className="bg-brand-soft">
                  <tr>
                    {block.header.map((cell, cellIndex) => (
                      <th key={cellIndex} scope="col" className="px-4 py-3.5 font-bold sm:px-5">
                        <Inlines items={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-line">
                      {rowCells(row).map(({ cell, span }, cellIndex) => {
                        const Cell = cellIndex === 0 ? "th" : "td";
                        return (
                          <Cell key={cellIndex} scope={cellIndex === 0 ? "row" : undefined} colSpan={span > 1 ? span : undefined} className={`px-4 py-3.5 align-top sm:px-5 ${cellIndex === 0 ? "font-normal text-muted" : ""}`}>
                            <Inlines items={cell} />
                          </Cell>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const style = CALLOUT_STYLES[block.kind];
        return (
          <aside key={index} aria-label={block.kind.toLowerCase()} className={`flex flex-col gap-2 rounded-2xl px-5 py-5 sm:flex-row sm:gap-5 sm:px-6 ${style.box}`}>
            <p className={`shrink-0 pt-0.5 text-[15px] font-extrabold tracking-[0.08em] ${style.label}`}>{block.kind}</p>
            <div className="space-y-3 [&_p]:text-[17px]">
              <Blocks blocks={block.blocks} inverted={!inverted} />
            </div>
          </aside>
        );
      })}
    </>
  );
}

export function LessonBody({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-6">
      <Blocks blocks={parseLessonMarkdown(markdown)} />
    </div>
  );
}
