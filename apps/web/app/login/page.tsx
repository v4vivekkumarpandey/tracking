import { login } from './actions';

export default async function LoginPage(props: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = await props.searchParams;
  return (
    <main className="login">
      <form action={login} className="card stack">
        <h1>Sign in</h1>
        {searchParams.error && <p className="error">Wrong email or password.</p>}
        <label>
          Email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
