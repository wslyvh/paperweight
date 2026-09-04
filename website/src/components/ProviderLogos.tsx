export function GoogleLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function MicrosoftLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" className={className} aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function AppleLogo({ className = "w-5 h-5 fill-current" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function ProtonLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M1 16.8C1 7.52162 8.52162 0 17.8 0C27.0784 0 34.6 7.52162 34.6 16.8V33C34.6 34.6569 33.2569 36 31.6 36H27.4L4.6 32.4L1 18V16.8ZM27.4 16.8C27.4 11.4981 23.1019 7.2 17.8 7.2C12.4981 7.2 8.2 11.4981 8.2 16.8L15.4294 23.1257C16.7867 24.3133 18.8133 24.3133 20.1706 23.1257L24.9853 22.3629L27.4 16.8Z" fill="url(#proton-grad0)" />
      <path d="M1 18L11.2402 26.7773C12.5958 27.9392 14.5981 27.9321 15.9453 26.7606L27.4 16.8V36H4C2.34315 36 1 34.6569 1 33V18Z" fill="url(#proton-grad1)" />
      <defs>
        <radialGradient id="proton-grad0" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32.6204 38.9636) rotate(-138.788) scale(42.0132 34.2426)">
          <stop stopColor="#E2DBFF" />
          <stop offset="1" stopColor="#6D4AFF" />
        </radialGradient>
        <linearGradient id="proton-grad1" x1="14.3512" y1="26.5887" x2="5.56632" y2="45.8192" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D4AFF" />
          <stop offset="1" stopColor="#28B0E8" />
        </linearGradient>
      </defs>
    </svg>
  );
}
