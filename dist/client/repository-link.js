import { jsx as _jsx } from "react/jsx-runtime";
/** Repository link for this bundle's detail page. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
/** Render the repository link only for the bundle that owns it. */
export function RepositoryLink({ subject, bundleName }) {
    if (subject.kind !== 'bundle' || subject.pkg.name !== bundleName)
        return null;
    return (_jsx(Button, { variant: "outline", size: "sm", onClick: () => {
            window.open('https://github.com/Mooling0602/dsh-better-plugin-updater', '_blank', 'noopener,noreferrer');
        }, children: "GitHub" }));
}
//# sourceMappingURL=repository-link.js.map