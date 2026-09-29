// Allowed direct children and layout. Existence and ordering are separate rules.
// Unlisted leaf components keep unrestricted contents; media and actions are optional.
export default {
  root: 'Empty',

  elements: {
    Empty: {
      children: ['EmptyHeader', 'EmptyContent'],
    },

    EmptyHeader: {
      children: ['EmptyMedia', 'EmptyTitle', 'EmptyDescription'],
    },

    EmptyContent: {
      children: ['Button'],
      blankLine: 'above',
    },
  },
};
