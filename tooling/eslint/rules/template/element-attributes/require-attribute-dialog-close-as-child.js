import { hasElementAttribute } from '../../../helpers/require-element-attribute.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require as-child on DialogFooter close controls containing Button' },
    fixable: 'code',
    schema: [],
    messages: { missing: '<DialogClose> containing <Button> inside <DialogFooter> requires as-child.' },
  },

  create(context) {
    const parserServices = context.sourceCode.parserServices;
    if (!parserServices.defineTemplateBodyVisitor) return {};

    const insideFooter = (node) => {
      let parent = node.parent;
      while (parent?.type === 'VElement') {
        if (['DialogFooter', 'dialog-footer'].includes(parent.rawName)) return true;
        if (['Dialog', 'AlertDialog', 'alert-dialog'].includes(parent.rawName)) return false;
        parent = parent.parent;
      }
      return false;
    };

    const containsButton = (node) => node.children.some((child) => {
      if (child.type !== 'VElement') return false;
      if (child.rawName === 'Button') return true;
      if (['DialogClose', 'dialog-close', 'Dialog', 'AlertDialog', 'alert-dialog'].includes(child.rawName)) return false;
      return containsButton(child);
    });

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!['DialogClose', 'dialog-close'].includes(node.rawName)
          || !insideFooter(node) || !containsButton(node)) return;

        const hasAsChild = hasElementAttribute(node, ['as-child', 'aschild'], { caseInsensitive: true });

        if (!hasAsChild) {
          context.report({
            loc: node.startTag.loc,
            messageId: 'missing',
            fix: (fixer) => fixer.insertTextAfterRange(
              [node.startTag.range[0], node.startTag.range[0] + node.rawName.length + 1],
              ' as-child',
            ),
          });
        }
      },
    });
  },
};
