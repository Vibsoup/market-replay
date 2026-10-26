// Hand-drawn chalk arrow used for the little white annotations.
type Props = { className?: string };

function Arrow({ className }: Props) {
  return (
    <svg className={className} width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M8 10 C 34 6, 58 26, 52 52" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M40 44 C 46 46, 50 50, 52 54 C 55 49, 58 44, 61 40" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
export default Arrow;
