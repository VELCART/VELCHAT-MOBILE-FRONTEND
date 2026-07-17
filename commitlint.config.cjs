/**
 * Conventional Commits — enforced via the husky commit-msg hook.
 * https://www.conventionalcommits.org/
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        // layers / areas
        'app',
        'mobile',
        'design-system',
        'theme',
        'i18n',
        'navigation',
        'infra',
        'domain',
        'core',
        // features
        'auth',
        'chat',
        'conversations',
        'groups',
        'status',
        'calls',
        'media',
        'search',
        'settings',
        'notifications',
        // ops
        'ci',
        'deps',
        'repo',
        'release',
      ],
    ],
    'body-max-line-length': [0, 'always'],
  },
};
