import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig, repoPublic } from './shared';

function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" />
        <ellipse cx="16" cy="16.5" rx="6.2" ry="8" fill="none" stroke="var(--color-fd-background)" strokeWidth="3.2" />
        <circle cx="25.5" cy="6.5" r="5" fill="var(--color-send0-accent)" stroke="var(--color-fd-background)" strokeWidth="2" />
      </svg>
      {appName}
      <span className="font-normal text-fd-muted-foreground">docs</span>
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Logo />, url: '/' },
    links: [
      { text: 'Home', url: 'https://send0.dev', external: true },
      { text: 'API spec', url: 'https://api.send0.dev/openapi.json', external: true },
    ],
    ...(repoPublic ? { githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}` } : {}),
  };
}
