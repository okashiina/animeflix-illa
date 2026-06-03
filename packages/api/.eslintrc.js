// On Windows, eslint-config-next (rushstack-patched, lowercase drive) and
// airbnb-base (uppercase drive) load eslint-plugin-import under two path
// casings, so ESLint can't resolve the "import" plugin uniquely. This patch
// normalises module resolution and must run before the config loads.
// eslint-disable-next-line import/no-extraneous-dependencies
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  extends: ['animeflix'],
};
