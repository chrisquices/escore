import enforceBlankLine from '../../../helpers/enforce-blank-line.js';
import structure from './structure.js';

export default enforceBlankLine({
  structure,
  elements: ['EmptyContent'],
  position: structure.elements.EmptyContent.blankLine,
});
