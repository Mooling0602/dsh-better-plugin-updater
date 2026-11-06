/** Repository link for this bundle's detail page. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PluginDetailProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';

/** Render the repository link only for the bundle that owns it. */
export function RepositoryLink({ subject, bundleName }: PluginDetailProps & { readonly bundleName: string }) {
  if (subject.kind !== 'bundle' || subject.pkg.name !== bundleName) return null;
  return (
    <Button variant="outline" size="sm" onClick={() => {
      window.open('https://github.com/Mooling0602/dsh-better-plugin-updater', '_blank', 'noopener,noreferrer');
    }}>
      GitHub
    </Button>
  );
}
