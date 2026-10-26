'use client';

/** Submit button for a server action that asks for confirmation first. */
export function ConfirmButton({ action, message, children }: { action: () => Promise<void>; message: string; children: React.ReactNode }) {
  return (
    <form action={action} className="inline">
      <button className="danger small" onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</button>
    </form>
  );
}
