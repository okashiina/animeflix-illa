// Make every plugin (eslint-plugin-import especially) resolve through one
// consistent module resolver. Without this, on Windows `eslint-config-next`
// (rushstack-patched, lowercase drive `c:`) and `airbnb-base` (normal, `C:`)
// load eslint-plugin-import under two casings and ESLint errors with
// "couldn't determine the plugin 'import' uniquely", which breaks the
// pre-commit hook. The patch is a transitive dep via eslint-config-next.
// eslint-disable-next-line import/no-extraneous-dependencies
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
  root: true,
  extends: ['animeflix'],
};
