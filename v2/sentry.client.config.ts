import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    beforeSend(event) {
      // Drop noisy Howler / WebAudio / Safari autoplay warnings — they are
      // recoverable and not actionable.
      const msg = event.message ?? event.exception?.values?.[0]?.value ?? '';
      if (/autoplay|user gesture|NotAllowedError/i.test(msg)) return null;
      return event;
    },
  });
}
