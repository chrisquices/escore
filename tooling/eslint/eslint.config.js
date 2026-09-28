import requireLabelInput from './rules/template/element-association/require-label-input.js';
import requirePlacementFieldContent from './rules/template/element-placement/require-placement-field-content.js';
import requirePlacementFieldLabel from './rules/template/element-placement/require-placement-field-label.js';
import requireFieldStructureForm from './rules/template/element-placement/require-field-structure-form.js';
import requireIdForAssociationField from './rules/template/element-association/require-id-for-association-field.js';
import forbidLabelInForm from './rules/template/element-placement/forbid-label-in-form.js';
import enforceOneLinerEmptyDescription from './rules/template/element-one-liners/enforce-one-liner-empty-description.js';
import enforceOneLinerDialogDescription from './rules/template/element-one-liners/enforce-one-liner-dialog-description.js';
import enforceLayoutElement from './rules/template/element-one-liners/enforce-layout-element.js';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import inertiaPlusRules from './rules/packages/inertia-plus.js';
import enforceConstProps from './rules/script/enforce-const-props.js';
import enforceOrderScript from './rules/script/enforce-order-script.js';
import requireCodeFoldingRegion from './rules/script/require-code-folding-region.js';
import requireUsageCodeFoldingRegion from './rules/script/require-usage-code-folding-region.js';
import forbidHardcodedUrls from './rules/general/forbid-hardcoded-urls.js';
import requireIconContextMenuItem from './rules/template/element-icons/require-icon-context-menu-item.js';
import requireIconContextMenuLabel from './rules/template/element-icons/require-icon-context-menu-label.js';
import forbidConsecutiveBlankLines from './rules/general/forbid-consecutive-blank-lines.js';
import enforceBlankLineAboveComment from './rules/general/enforce-blank-line-above-comment.js';
import enforceBlankLineBelowDialogHeader from './rules/template/element-spacing/enforce-blank-line-below-dialog-header.js';
import enforceBlankLineAboveDialogFooter from './rules/template/element-spacing/enforce-blank-line-above-dialog-footer.js';
import enforcePlacementDialog from './rules/template/element-placement/enforce-placement-dialog.js';
import enforcePlacementAlertDialog from './rules/template/element-placement/enforce-placement-alert-dialog.js';
import forbidOneLinerButton from './rules/template/element-one-liners/forbid-one-liner-button.js';
import forbidOneLinerTableCell from './rules/template/element-one-liners/forbid-one-liner-table-cell.js';
import forbidOneLinerTableHead from './rules/template/element-one-liners/forbid-one-liner-table-head.js';
import requireCommentButton from './rules/template/element-comments/require-comment-button.js';
import requireCommentAlert from './rules/template/element-comments/require-comment-alert.js';
import requireCommentTabsContent from './rules/template/element-comments/require-comment-tabs-content.js';
import requireCommentBadge from './rules/template/element-comments/require-comment-badge.js';
import requireCommentCard from './rules/template/element-comments/require-comment-card.js';
import requireCommentCombobox from './rules/template/element-comments/require-comment-combobox.js';
import requireCommentContextMenuItem from './rules/template/element-comments/require-comment-context-menu-item.js';
import requireCommentContextMenuLabel from './rules/template/element-comments/require-comment-context-menu-label.js';
import requireCommentContextMenuSeparator from './rules/template/element-comments/require-comment-context-menu-separator.js';
import requireCommentDialog from './rules/template/element-comments/require-comment-dialog.js';
import requireCommentDialogClose from './rules/template/element-comments/require-comment-dialog-close.js';
import requireCommentDropdownMenu from './rules/template/element-comments/require-comment-dropdown-menu.js';
import requireCommentDropdownMenuItem from './rules/template/element-comments/require-comment-dropdown-menu-item.js';
import requireCommentDropdownMenuSeparator from './rules/template/element-comments/require-comment-dropdown-menu-separator.js';
import requireCommentEmpty from './rules/template/element-comments/require-comment-empty.js';
import requireCommentField from './rules/template/element-comments/require-comment-field.js';
import requireCommentFieldSet from './rules/template/element-comments/require-comment-field-set.js';
import requireCommentPageSection from './rules/template/element-comments/require-comment-page-section.js';
import requireCommentPopover from './rules/template/element-comments/require-comment-popover.js';
import requireCommentSeparator from './rules/template/element-comments/require-comment-separator.js';
import requireCommentSidepanelHeader from './rules/template/element-comments/require-comment-sidepanel-header.js';
import requireCommentSidepanelSectionHeader from './rules/template/element-comments/require-comment-sidepanel-section-header.js';
import requireCommentStatCard from './rules/template/element-comments/require-comment-stat-card.js';
import requireCommentTableEmpty from './rules/template/element-comments/require-comment-table-empty.js';
import requireCommentTableHead from './rules/template/element-comments/require-comment-table-head.js';
import requireCommentToggleGroupItem from './rules/template/element-comments/require-comment-toggle-group-item.js';
import requireCommentButtonGroup from './rules/template/element-comments/require-comment-button-group.js';
import requireCommentTableCell from './rules/template/element-comments/require-comment-table-cell.js';
import requireCommentTableRow from './rules/template/element-comments/require-comment-table-row.js';
import requireAttributeButtonType from './rules/template/element-attributes/require-attribute-button-type.js';
import requireAttributeButtonSize from './rules/template/element-attributes/require-attribute-button-size.js';
import requireAttributeButtonVariant from './rules/template/element-attributes/require-attribute-button-variant.js';
import enforceAttributeOrderInput from './rules/template/element-attributes-order/enforce-attribute-order-input.js';
import requireAttributeInputId from './rules/template/element-attributes/require-attribute-input-id.js';
import requireAttributeInputType from './rules/template/element-attributes/require-attribute-input-type.js';
import forbidNativeLabel from './rules/template/element-native/forbid-native-label.js';
import requireAttributeLabelFor from './rules/template/element-attributes/require-attribute-label-for.js';
import requireAttributeDialogProcessing from './rules/template/element-attributes/require-attribute-dialog-processing.js';
import requireAttributeDialogDismissible from './rules/template/element-attributes/require-attribute-dialog-dismissible.js';
import requireAttributeDialogUpdateOpen from './rules/template/element-attributes/require-attribute-dialog-update-open.js';
import requireAttributeDialogCloseAsChild from './rules/template/element-attributes/require-attribute-dialog-close-as-child.js';
import requireAttributeFieldLabelFor from './rules/template/element-attributes/require-attribute-field-label-for.js';
import requireAttributeFieldDataInvalid from './rules/template/element-attributes/require-attribute-field-data-invalid.js';
import requireAttributeFieldErrorErrors from './rules/template/element-attributes/require-attribute-field-error-errors.js';
import forbidAttributeAria from './rules/template/element-attributes/forbid-attribute-aria.js';
import forbidAttributeTitle from './rules/template/element-attributes/forbid-attribute-title.js';

const escore = {
    rules: {
        'require-label-input': requireLabelInput,
        'require-placement-field-content': requirePlacementFieldContent,
        'require-placement-field-label': requirePlacementFieldLabel,
        'require-field-structure-form': requireFieldStructureForm,
        'forbid-label-in-form': forbidLabelInForm,
        ...inertiaPlusRules,
        'forbid-native-label': forbidNativeLabel,
        'require-attribute-label-for': requireAttributeLabelFor,
        'forbid-attribute-aria': forbidAttributeAria,
        'forbid-attribute-title': forbidAttributeTitle,
        'require-comment-tabs-content': requireCommentTabsContent,
        'require-comment-badge': requireCommentBadge,
        'require-comment-card': requireCommentCard,
        'require-comment-combobox': requireCommentCombobox,
        'require-comment-context-menu-item': requireCommentContextMenuItem,
        'require-comment-context-menu-label': requireCommentContextMenuLabel,
        'require-comment-context-menu-separator': requireCommentContextMenuSeparator,
        'require-comment-dialog': requireCommentDialog,
        'require-comment-dialog-close': requireCommentDialogClose,
        'require-comment-dropdown-menu': requireCommentDropdownMenu,
        'require-comment-dropdown-menu-item': requireCommentDropdownMenuItem,
        'require-comment-dropdown-menu-separator': requireCommentDropdownMenuSeparator,
        'require-comment-empty': requireCommentEmpty,
        'require-comment-field': requireCommentField,
        'require-comment-field-set': requireCommentFieldSet,
        'require-comment-page-section': requireCommentPageSection,
        'require-comment-popover': requireCommentPopover,
        'require-comment-separator': requireCommentSeparator,
        'require-comment-sidepanel-header': requireCommentSidepanelHeader,
        'require-comment-sidepanel-section-header': requireCommentSidepanelSectionHeader,
        'require-comment-stat-card': requireCommentStatCard,
        'require-comment-table-empty': requireCommentTableEmpty,
        'require-comment-table-head': requireCommentTableHead,
        'require-comment-toggle-group-item': requireCommentToggleGroupItem,
        'require-comment-button-group': requireCommentButtonGroup,
        'require-comment-table-cell': requireCommentTableCell,
        'require-comment-table-row': requireCommentTableRow,
        'forbid-one-liner-table-cell': forbidOneLinerTableCell,
        'forbid-one-liner-table-head': forbidOneLinerTableHead,
        'forbid-one-liner-button': forbidOneLinerButton,
        'require-comment-button': requireCommentButton,
        'require-comment-alert': requireCommentAlert,
        'enforce-layout-element': enforceLayoutElement,
        'enforce-blank-line-above-comment': enforceBlankLineAboveComment,
        'forbid-consecutive-blank-lines': forbidConsecutiveBlankLines,
        'enforce-blank-line-below-dialog-header': enforceBlankLineBelowDialogHeader,
        'enforce-blank-line-above-dialog-footer': enforceBlankLineAboveDialogFooter,
        'enforce-one-liner-dialog-description': enforceOneLinerDialogDescription,
        'enforce-one-liner-empty-description': enforceOneLinerEmptyDescription,
        'require-attribute-dialog-processing': requireAttributeDialogProcessing,
        'require-attribute-dialog-dismissible': requireAttributeDialogDismissible,
        'require-attribute-dialog-update-open': requireAttributeDialogUpdateOpen,
        'require-attribute-dialog-close-as-child': requireAttributeDialogCloseAsChild,
        'enforce-placement-dialog': enforcePlacementDialog,
        'enforce-placement-alert-dialog': enforcePlacementAlertDialog,
        'enforce-order-script': enforceOrderScript,
        'enforce-const-props': enforceConstProps,
        'require-code-folding-region': requireCodeFoldingRegion,
        'require-usage-code-folding-region': requireUsageCodeFoldingRegion,
        'forbid-hardcoded-urls': forbidHardcodedUrls,
        'require-id-for-association-field': requireIdForAssociationField,
        'require-attribute-field-label-for': requireAttributeFieldLabelFor,
        'require-attribute-field-data-invalid': requireAttributeFieldDataInvalid,
        'require-attribute-field-error-errors': requireAttributeFieldErrorErrors,
        'require-attribute-button-type': requireAttributeButtonType,
        'require-attribute-button-variant': requireAttributeButtonVariant,
        'require-attribute-button-size': requireAttributeButtonSize,
        'require-attribute-input-type': requireAttributeInputType,
        'require-attribute-input-id': requireAttributeInputId,
        'enforce-attribute-order-input': enforceAttributeOrderInput,
        'require-icon-context-menu-item': requireIconContextMenuItem,
        'require-icon-context-menu-label': requireIconContextMenuLabel,
    },
};

const projectDirectory = process.cwd();

const projectRequire = createRequire(join(projectDirectory, 'package.json'));

async function importProjectPackage(packageName) {
    let resolvedPath;

    try {
        resolvedPath = projectRequire.resolve(packageName);
    } catch (cause) {
        throw new Error(
            `Shared ESLint config could not resolve ${packageName} from target project ${projectDirectory}.`,
            {cause}
        );
    }

    try {
        return await import(pathToFileURL(resolvedPath).href);
    } catch (cause) {
        throw new Error(
            `Shared ESLint config could not load ${packageName} from target project ${projectDirectory}.`,
            {cause}
        );
    }
}

function unwrapDefault(module) {
    return module.default ?? module;
}

const stylistic = unwrapDefault(
    await importProjectPackage('@stylistic/eslint-plugin')
);
const vueTsModule = await importProjectPackage('@vue/eslint-config-typescript');
const vueTs = unwrapDefault(vueTsModule);
const defineConfigWithVueTs = vueTsModule.defineConfigWithVueTs ?? vueTs.defineConfigWithVueTs;
const vueTsConfigs = vueTsModule.vueTsConfigs ?? vueTs.vueTsConfigs;
const importModule = await importProjectPackage('eslint-plugin-import-x');
const importPlugin = unwrapDefault(importModule);
const {createTypeScriptImportResolver} = await importProjectPackage('eslint-import-resolver-typescript');
const vue = unwrapDefault(await importProjectPackage('eslint-plugin-vue'));

const controlStatements = [
    'if',
    'return',
    'for',
    'while',
    'do',
    'switch',
    'try',
    'throw'
];
const paddingAroundControl = [
    ...controlStatements.flatMap((stmt) => [
        {blankLine: 'always', prev: '*', next: stmt},
        {blankLine: 'always', prev: stmt, next: '*'}
    ])
];

export default defineConfigWithVueTs(
    vue.configs['flat/essential'],
    vueTsConfigs.recommended,
    {
        plugins: {
            'import-x': importPlugin,
            escore
        },
        settings: {
            'import-x/resolver-next': [
                createTypeScriptImportResolver({
                    alwaysTryTypes: true,
                    project: join(projectDirectory, 'tsconfig.json')
                }),
                importModule.createNodeResolver()
            ]
        },
        rules: {
            'escore/enforce-blank-line-above-comment': 'error',
            'escore/forbid-consecutive-blank-lines': 'error',
            'escore/forbid-hardcoded-urls': 'error',
            'escore/inertia-plus-form-options': 'error',
            'escore/inertia-plus-const': 'error',
            'escore/inertia-plus-form-name': 'error',
            'escore/inertia-plus-single-line-opening': 'error',
            'escore/inertia-plus-form-definition': 'error',
            'escore/inertia-plus-form-submit': 'error',
            'escore/inertia-plus-form-methods': 'error',
            'escore/inertia-plus-form-method-context': 'error',
            'escore/inertia-plus-before-submit-call': 'error',
            'escore/inertia-plus-submit-processing-guard': 'error',
            'escore/inertia-plus-surface-openable': 'error',
            'vue/multi-word-component-names': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-expressions': ['error', {allowTernary: true}],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports'
                }
            ],
            'import-x/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']
                    // alphabetize: { order: 'asc', caseInsensitive: true },
                }
            ],
            'import-x/consistent-type-specifier-style': [
                'error',
                'prefer-top-level'
            ]
        }
    },
    {
        files: ['**/*.vue'],
        plugins: {
            escore
        },
        rules: {
            'escore/require-comment-tabs-content': 'error',
            'escore/require-comment-badge': 'error',
            'escore/require-comment-card': 'error',
            'escore/require-comment-combobox': 'error',
            'escore/require-comment-context-menu-item': 'error',
            'escore/require-comment-context-menu-label': 'error',
            'escore/require-comment-context-menu-separator': 'error',
            'escore/require-comment-dialog': 'error',
            'escore/require-comment-dialog-close': 'error',
            'escore/require-comment-dropdown-menu': 'error',
            'escore/require-comment-dropdown-menu-item': 'error',
            'escore/require-comment-dropdown-menu-separator': 'error',
            'escore/require-comment-empty': 'error',
            'escore/require-comment-field': 'error',
            'escore/require-comment-field-set': 'error',
            'escore/require-comment-page-section': 'error',
            'escore/require-comment-popover': 'error',
            'escore/require-comment-separator': 'error',
            'escore/require-comment-sidepanel-header': 'error',
            'escore/require-comment-sidepanel-section-header': 'error',
            'escore/require-comment-stat-card': 'error',
            'escore/require-comment-table-empty': 'error',
            'escore/require-comment-table-head': 'error',
            'escore/require-comment-toggle-group-item': 'error',
            'escore/require-comment-button-group': 'error',
            'escore/require-comment-table-cell': 'error',
            'escore/require-comment-table-row': 'error',
            'escore/forbid-one-liner-table-cell': 'error',
            'escore/forbid-one-liner-table-head': 'error',
            'escore/forbid-one-liner-button': 'error',
            'escore/require-comment-button': 'error',
            'escore/require-comment-alert': 'error',
            'escore/enforce-layout-element': 'error',
            'escore/enforce-blank-line-below-dialog-header': 'error',
            'escore/enforce-blank-line-above-dialog-footer': 'error',
            'escore/enforce-one-liner-dialog-description': 'error',
            'escore/enforce-one-liner-empty-description': 'error',
            'escore/require-attribute-dialog-processing': 'error',
            'escore/require-attribute-dialog-dismissible': 'error',
            'escore/require-attribute-dialog-update-open': 'error',
            'escore/require-attribute-dialog-close-as-child': 'error',
            'escore/enforce-placement-dialog': 'error',
            'escore/enforce-placement-alert-dialog': 'error',
            'escore/enforce-order-script': 'error',
            'escore/enforce-const-props': 'error',
            'escore/require-code-folding-region': 'warn',
            'escore/require-usage-code-folding-region': 'warn',
            'escore/require-id-for-association-field': 'error',
            'escore/require-label-input': 'error',
            'escore/require-attribute-field-label-for': 'error',
            'escore/require-attribute-field-data-invalid': 'error',
            'escore/require-attribute-field-error-errors': 'error',
            'escore/forbid-label-in-form': 'error',
            'escore/require-placement-field-content': 'error',
            'escore/require-placement-field-label': 'error',
            'escore/require-field-structure-form': 'error',
            'escore/require-attribute-button-type': 'error',
            'escore/require-attribute-button-variant': 'error',
            'escore/require-attribute-button-size': 'error',
            'escore/require-attribute-input-type': 'error',
            'escore/require-attribute-input-id': 'error',
            'escore/enforce-attribute-order-input': 'error',
            'escore/forbid-attribute-aria': 'error',
            'escore/forbid-attribute-title': 'error',
            'escore/forbid-native-label': 'error',
            'escore/require-attribute-label-for': 'error',
            'escore/require-icon-context-menu-item': ['warn', {sources: ['@lucide/vue', 'lucide-vue-next']}],
            'escore/require-icon-context-menu-label': ['warn', {sources: ['@lucide/vue', 'lucide-vue-next']}]
        }
    },
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            '@stylistic/brace-style': ['error', '1tbs', {allowSingleLine: false}],
            '@stylistic/padding-line-between-statements': [
                'error',
                ...paddingAroundControl,
                {blankLine: 'any', prev: 'if', next: 'if'}
            ]
        }
    },
    {
        ignores: [
            'vendor',
            'node_modules',
            'public',
            'bootstrap/ssr',
            'tailwind.config.js',
            'vite.config.ts',
            'resources/js/actions/**',
            'resources/js/components/ui/*',
            'resources/js/routes/**',
            'resources/js/wayfinder/**'
        ]
    },
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            curly: ['error', 'multi-line'],
            '@stylistic/brace-style': ['error', '1tbs', {allowSingleLine: false}]
        }
    }
);
