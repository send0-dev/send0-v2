export function StepHeader({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="mb-7 animate-enter">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-balance">{title}</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
