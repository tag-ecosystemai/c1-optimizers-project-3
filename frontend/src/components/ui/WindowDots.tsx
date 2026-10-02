/** The red / yellow / green dots of a desktop window title bar. */
export function WindowDots({ className = "gap-1.5", dot = "size-3" }: { className?: string; dot?: string }) {
  return (
    <span aria-hidden="true" className={`flex ${className}`}>
      <span className={`${dot} rounded-full bg-red-500`} />
      <span className={`${dot} rounded-full bg-yellow-500`} />
      <span className={`${dot} rounded-full bg-green-500`} />
    </span>
  );
}
