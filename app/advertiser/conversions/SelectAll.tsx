'use client';

/** Header checkbox that toggles every row checkbox in the given form. */
export function SelectAll({ form }: { form: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`#${form} input[name="ids"]`).forEach((cb) => (cb.checked = e.target.checked));
      }}
    />
  );
}
