export default function Page({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-5 pt-16 sm:px-8">
      <h1 className="text-5xl font-semibold tracking-tightest">{title}</h1>
      <div className="mt-10 space-y-5 leading-relaxed text-mute [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_a]:text-ink [&_a]:underline">{children}</div>
    </article>
  );
}
