/* eslint-disable no-restricted-syntax */
/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './service/router';
import webpack from 'webpack';

import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import { ensureDirSync, writeJSON, writeFile, ensureFile } from 'fs-extra';

import {
  getName,
  getPackageContent,
  getReexportContent,
  getWebpackConfig,
  plugins,
} from './service/tmp-plugins-config';

// How does prod build behave? Is it OK to create a directories like this?
const CDN_PATH = path.resolve(__dirname, './assets');

/**
 * This function takes quite a while to finish and delays the plugin initialization
 * UI dynamic plugins will not be able to load until the "CDN" is created
 */
async function createCDN() {
  ensureDirSync(CDN_PATH);
  const tasks = plugins.map(async plugin => {
    const dynamicName = getName(plugin);
    const packagePath = path.resolve(CDN_PATH, dynamicName);
    ensureDirSync(packagePath);
    await writeJSON(
      path.resolve(packagePath, 'package.json'),
      getPackageContent(plugin),
      { spaces: 2 },
    );
    // using silent to suppress warnings
    const { stderr } = await promisify(exec)('npm install --silent', {
      cwd: packagePath,
    });
    if (stderr) {
      throw new Error(stderr);
    }
    const filePath = path.resolve(packagePath, 'src', 'index.js');
    await ensureFile(filePath);
    await writeFile(filePath, getReexportContent(plugin), {
      encoding: 'utf-8',
    });
    // compile the re-exported plugin
    const webpackConfig = getWebpackConfig(plugin, packagePath);
    const compiler = webpack(webpackConfig);
    const asyncRun = promisify(compiler.run.bind(compiler));
    return asyncRun();
  });

  const results = await Promise.allSettled(tasks);
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        'Unable to load plugin: ',
        plugins[index],
        '! Reason: ',
        result.reason,
      );
    }
  });
}

/**
 * scalprumPluginPlugin backend plugin
 *
 * @public
 */
export const scalprumPluginPlugin = createBackendPlugin({
  pluginId: 'scalprum-plugin',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
      },
      async init({ httpRouter, logger }) {
        try {
          await createCDN();
        } catch (error) {
          logger.error('Failed to create CDN', error);
        }
        httpRouter.use(
          await createRouter(
            {
              logger,
            },
            CDN_PATH,
          ),
        );
        // asset server, no auth required for frontend assets
        httpRouter.addAuthPolicy({
          path: '/assets',
          allow: 'unauthenticated',
        });
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
