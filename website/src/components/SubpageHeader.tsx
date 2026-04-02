interface SubpageHeaderProps {
  label?: string;
  title: string;
}

export function SubpageHeader({
  label,
  title,
}: SubpageHeaderProps) {
  return (
    <header className="space-y-4">
      {label ? (
        <p className="badge badge-primary badge-soft tracking-wider">
          {label}
        </p>
      ) : null}
      <div className="space-y-3">
        <h1 className="text-4xl font-bold">{title}</h1>
      </div>
    </header>
  );
}
