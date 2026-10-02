/** RunOut wordmark: arrow mark + "runout". Colour follows currentColor. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg width="103" height="26" viewBox="0 0 103 26" fill="none" role="img" aria-label="RunOut" className={className}>
      <svg x="0" y="3" width="23.7" height="20" viewBox="0 0 703 593" fill="currentColor" stroke="currentColor" strokeWidth="36" strokeLinejoin="round">
        <polygon points="195,18 442,18 684,292 432,574 227,574 436,316" />
        <polygon points="186,263 329,263 161,468 18,468" />
      </svg>
      <text x="29" y="20.5" fontFamily="var(--font-inter), Inter, sans-serif" fontWeight="700" fontSize="22" letterSpacing="-0.7" fill="currentColor">
        runout
      </text>
    </svg>
  );
}
