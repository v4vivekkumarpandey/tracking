import { SignupForm } from '../SignupForm';

export const metadata = { title: 'Advertise with us' };

export default function AdvertiserSignup() {
  return (
    <main className="login">
      <div className="auth-box wide">
        <div className="auth-brand">{process.env.BRAND_NAME ?? 'Tracking'}<span>Affiliate platform</span></div>
        <SignupForm role="advertiser" />
      </div>
    </main>
  );
}
