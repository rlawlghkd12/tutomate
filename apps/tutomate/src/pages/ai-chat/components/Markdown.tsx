import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 어시스턴트 답변용 마크다운 렌더러. 큰 글씨/넉넉한 간격으로 60대 사용자 가독성 우선. */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h1 className="mb-2 mt-1 text-xl font-bold">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-1 text-lg font-bold">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-1 text-base font-bold">{children}</h3>,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-base">{children}</code>
        ),
        pre: ({ children }) => (
          <pre className="mb-2 overflow-x-auto rounded-lg bg-background/60 p-3 font-mono text-base last:mb-0">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground last:mb-0">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-border" />,
        table: ({ children }) => (
          <div className="mb-2 overflow-x-auto last:mb-0">
            <table className="w-full border-collapse text-base">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-background/40 px-2 py-1 text-left font-semibold">{children}</th>
        ),
        td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
