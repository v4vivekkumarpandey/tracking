import { ActionForm } from '../../../_components/ActionForm';
import { mergePublisherAction } from '../../actions';

/** Merge a duplicate publisher account into this one. */
export function MergePublisher({ id, name, others }: { id: number; name: string; others: { id: number; name: string; email: string | null }[] }) {
  return (
    <details className="card edit-offer">
      <summary><strong>Merge another publisher into this one</strong> <span className="muted">for duplicate accounts</span></summary>
      <ActionForm action={mergePublisherAction} submit="Merge publishers">
        <input type="hidden" name="id" value={id} />
        <p className="muted">
          Everything of the chosen publisher moves to <strong>{name}</strong>: tracking links (they keep working), clicks,
          conversions, balance and payments, offer access, postbacks, smart links and domains. Sales on their older clicks
          are credited here too. Their payment methods move only if {name} has none; their login moves only if {name} has
          no login, otherwise it&apos;s removed. The other publisher is then deleted. <strong>This can&apos;t be undone.</strong>
        </p>
        <label>Publisher to merge into {name}
          <select name="from_id" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {others.map((o) => <option key={o.id} value={o.id}>#{o.id} {o.name}{o.email ? ` (${o.email})` : ''}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" name="confirm" required /> I understand the other publisher will be deleted</label>
      </ActionForm>
    </details>
  );
}
