import { Logo } from '../../_components/Logo';
import { SignupForm } from '../SignupForm';

export const metadata = { title: 'Join as a publisher' };

export default async function PublisherSignup(props: { searchParams: Promise<{ ref?: string }> }) {
  const ref = ((await props.searchParams).ref ?? '').toLowerCase();
  return (
    <main className="login">
      <div className="auth-box wide">
        <div className="auth-brand"><Logo height={36} /><span>Affiliate platform</span></div>
        <SignupForm role="publisher" referral={/^[a-z0-9]{6,16}$/.test(ref) ? ref : undefined} />
      </div>
    </main>
  );
}
