// Credits page content. Edit the details here; the Credits dialog (src/components/CreditsModal.jsx) reads them.

import { version as reactVersion, license as reactLicenseName } from '../../node_modules/react/package.json';
import reactLicense from '../../node_modules/react/LICENSE?raw';
import { version as reactDomVersion, license as reactDomLicenseName } from '../../node_modules/react-dom/package.json';
import reactDomLicense from '../../node_modules/react-dom/LICENSE?raw';
import { version as schedulerVersion, license as schedulerLicenseName } from '../../node_modules/scheduler/package.json';
import schedulerLicense from '../../node_modules/scheduler/LICENSE?raw';

export const AUTHOR = {
  name: 'Jack Mudge',
  url: 'https://mudge.dev',
  label: 'mudge.dev',
};

// The project's source code. If this is set to '', the Credits page says "coming soon" instead.
export const GITHUB_URL = 'https://github.com/jmudge14/perseus-bound';

// Open-source packages whose code is bundled into the game file. Their licenses require the notice to be
// shipped with the game, so the full license text is shown. The text and version are read from
// node_modules at build time, so they always match what was actually built.
export const BUNDLED = [
  { name: 'React', pkg: { version: reactVersion, license: reactLicenseName }, url: 'https://react.dev', text: reactLicense },
  { name: 'React DOM', pkg: { version: reactDomVersion, license: reactDomLicenseName }, url: 'https://react.dev', text: reactDomLicense },
  { name: 'Scheduler', pkg: { version: schedulerVersion, license: schedulerLicenseName }, url: 'https://github.com/facebook/react', text: schedulerLicense, note: 'used internally by React DOM' },
].map(({ pkg, ...rest }) => ({ ...rest, version: pkg.version, license: pkg.license }));

// Tools used to build the game. None of their code ends up in the game file, so they're credited by name.
export const BUILD_TOOLS = [
  { name: 'Vite', url: 'https://vitejs.dev', license: 'MIT' },
  { name: '@vitejs/plugin-react', url: 'https://github.com/vitejs/vite-plugin-react', license: 'MIT' },
  { name: 'vite-plugin-singlefile', url: 'https://github.com/richardtallent/vite-plugin-singlefile', license: 'MIT' },
];
