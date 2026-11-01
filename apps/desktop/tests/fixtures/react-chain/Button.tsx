// A component that forwards nothing: the plugin's call-site stamp on <Button> never reaches the
// DOM, and the chain must still find it in the component fiber's props (SPEC-phase4 §2.2).
export function Button({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button type="button" className="btn" onClick={onClick}>
      {label}
    </button>
  );
}
