import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from '../../env';

// "Continue with Google" via Google Identity Services. Google renders the
// button itself (its branding rules), hands back an ID token, and the server
// verifies it — see authController.googleAuth. Patients only; the server
// enforces that, this component only appears on the patient paths.
//
// Renders nothing when no client id is configured, so an environment without
// Google set up simply shows the email/password form.

declare global {
  interface Window {
    google?: any;
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

const loadScript = (): Promise<void> => {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('Could not load Google sign-in')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
};

interface Props {
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

export default function GoogleSignInButton({ onCredential, text = 'continue_with' }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !host.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp: { credential?: string }) => { if (resp.credential) callback.current(resp.credential); },
          ux_mode: 'popup',
          context: text === 'signup_with' ? 'signup' : 'signin',
        });
        const width = Math.min(host.current.offsetWidth || 360, 400);
        window.google.accounts.id.renderButton(host.current, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text, width, logo_alignment: 'center',
        });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [text]);

  if (!GOOGLE_CLIENT_ID) return null;
  if (failed) {
    return <p className="text-center text-xs text-gray-400">Google sign-in could not load. Use your email and password instead.</p>;
  }
  return <div ref={host} className="flex justify-center min-h-[44px]" data-testid="google-signin" />;
}

/** "or" separator shown between the Google button and the email form. */
export function OrDivider({ label = 'or' }: { label?: string }) {
  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className="flex items-center gap-3 my-5" aria-hidden="true">
      <span className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</span>
      <span className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
