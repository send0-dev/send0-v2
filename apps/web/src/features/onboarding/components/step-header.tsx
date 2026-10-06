export function StepHeader({ title, description }: { title: string; description: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}
