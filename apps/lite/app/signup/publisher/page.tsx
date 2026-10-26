import { SignupForm } from '../SignupForm';

export const metadata = { title: 'Join as a publisher' };

export default function PublisherSignup() {
  return (
    <main className="login">
      <div className="auth-box wide">
        <div className="auth-brand">{process.env.BRAND_NAME ?? 'Tracking'}<span>Affiliate platform</span></div>
        <SignupForm role="publisher" />
      </div>
    </main>
  );
}
