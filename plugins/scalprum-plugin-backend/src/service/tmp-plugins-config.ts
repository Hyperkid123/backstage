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

import { Configuration } from 'webpack';
import { DynamicRemotePlugin } from '@openshift/dynamic-plugin-sdk-webpack';
import path from 'path';

// draft of the plugin configuration
export type DynamicPluginConfig = {
  name: string;
  version?: string;
};

export type TmpPluginsConfig = DynamicPluginConfig[];

// this should be defined within the app-config.yaml probably
export const plugins: TmpPluginsConfig = [
  {
    name: '@backstage/plugin-user-settings',
  },
];

// generate names from the original npm package names
export function getName(plugin: DynamicPluginConfig) {
  let pluginName: string;
  if (plugin.name.includes('/')) {
    const fragments = plugin.name.split('/');
    pluginName = `${fragments[0].replace('@', '')}.${fragments[1]}`;
  } else {
    pluginName = plugin.name;
  }

  return `dynamic-${pluginName}`;
}

// some template system should replace this
export function getPackageContent(plugin: DynamicPluginConfig) {
  return {
    name: getName(plugin),
    version: plugin.version || '0.0.0',
    private: true,
    dependencies: {
      [plugin.name]: plugin.version || '*',
    },
  };
}

// v2 plugins are currently available under the alpha path
// probably should be some configuration option as well
export function getReexportContent(plugin: DynamicPluginConfig) {
  return `export * from '${plugin.name}';\nexport { default } from '${plugin.name}/alpha';\n`;
}

export const sharedModules = {
  /**
   * Mandatory singleton packages for sharing
   */
  react: {
    singleton: true,
    requiredVersion: '*',
  },
  'react-dom': {
    singleton: true,
    requiredVersion: '*',
  },
  'react-router-dom': {
    singleton: true,
    requiredVersion: '*',
  },
  'react-router': {
    singleton: true,
    requiredVersion: '*',
  },
  '@backstage/version-bridge': {
    singleton: true,
    requiredVersion: '*',
  },
  '@backstage/core-app-api': {
    singleton: true,
    requiredVersion: '*',
  },
  '@backstage/core-plugin-api': {
    singleton: true,
    requiredVersion: '*',
  },
  '@backstage/frontend-plugin-api': {
    singleton: true,
    requiredVersion: '*',
  },
  '@scalprum/react-core': {
    singleton: true,
    requiredVersion: '*',
  },
  '@openshift/dynamic-plugin-sdk': {
    singleton: true,
    requiredVersion: '*',
  },
  /**
   * The following two packages are required to be shared as singletons to enable UI theming
   */
  '@material-ui/core/styles': {
    singleton: true,
    requiredVersion: '*',
  },
  '@material-ui/styles': {
    singleton: true,
    requiredVersion: '*',
  },
};

// Minimal webpack config for the plugin
export function getWebpackConfig(
  plugin: DynamicPluginConfig,
  pluginRoot: string,
) {
  const pluginName = getName(plugin);
  const dynamicPluginPlugin = new DynamicRemotePlugin({
    extensions: [],
    sharedModules,
    entryScriptFilename: `[name].[contenthash].js`,
    moduleFederationSettings: {
      libraryType: 'global',
    },
    pluginMetadata: {
      name: pluginName,
      version: plugin.version || '0.0.0',
      exposedModules: {
        pluginEntry: './src/index.js',
      },
    },
  });
  const config: Configuration = {
    context: pluginRoot,
    output: {
      chunkFilename: `${pluginName}.[contenthash].js`,
      path: path.resolve(pluginRoot, 'dist'),
      publicPath: 'auto',
    },
    entry: {},
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    plugins: [dynamicPluginPlugin],
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /(node_modules)/,
          use: {
            loader: 'swc-loader',
          },
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
        },
      ],
    },
  };
  return config;
}
