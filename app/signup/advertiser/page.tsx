import { Logo } from '../../_components/Logo';
import { SignupForm } from '../SignupForm';

export const metadata = { title: 'Advertise with us' };

export default function AdvertiserSignup() {
  return (
    <main className="login">
      <div className="auth-box wide">
        <div className="auth-brand"><Logo height={36} /><span>Affiliate platform</span></div>
        <SignupForm role="advertiser" />
      </div>
    </main>
  );
}
