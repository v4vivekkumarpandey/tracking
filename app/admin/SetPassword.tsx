import { ActionForm } from '../_components/ActionForm';
import { setLoginPassword } from './actions';

/** Admin chooses the password for a publisher/advertiser login (creates the login if needed). */
export function SetPassword({ role, id }: { role: 'publisher' | 'advertiser'; id: number }) {
  return (
    <details className="set-password">
      <summary>Set password</summary>
      <ActionForm action={setLoginPassword} submit="Set password" reset>
        <input type="hidden" name="role" value={role} />
        <input type="hidden" name="id" value={id} />
        <label>New password (min 10)<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <label>Repeat password<input name="password2" type="password" required minLength={10} autoComplete="new-password" /></label>
        <p className="muted">Send it to them privately. Their current sessions are signed out; they can change it in Settings.</p>
      </ActionForm>
    </details>
  );
}
