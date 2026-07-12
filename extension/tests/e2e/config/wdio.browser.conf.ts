import { config as baseConfig } from './wdio.conf.js';
import { getChromeExtensionPath } from '../utils/extension-path.js';
import { IS_CI } from '@extension/env';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const extensions = await readdir(join(import.meta.dirname, '../../../dist-zip'));
const latestExtension = extensions.filter(file => extname(file) === '.zip').at(-1);
const extPath = join(import.meta.dirname, `../../../dist-zip/${latestExtension}`);
const bundledExtension = (await readFile(extPath)).toString('base64');

const chromeCapabilities = {
  browserName: 'chrome',
  acceptInsecureCerts: true,
  'goog:chromeOptions': {
    args: [
      '--disable-web-security',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      ...(IS_CI ? ['--headless'] : []),
    ],
    prefs: { 'extensions.ui.developer_mode': true },
    extensions: [bundledExtension],
  },
};

export const config: WebdriverIO.Config = {
  ...baseConfig,
  capabilities: [chromeCapabilities],

  maxInstances: IS_CI ? 10 : 1,
  logLevel: 'error',
  execArgv: IS_CI ? [] : ['--inspect'],
  before: async ({ browserName }: WebdriverIO.Capabilities, _specs, browser: WebdriverIO.Browser) => {
    if (browserName === 'chrome') {
      browser.addCommand('getExtensionPath', async () => getChromeExtensionPath(browser));
    }
  },
  afterTest: async () => {
    if (!IS_CI) {
      await browser.pause(500);
    }
  },
};
