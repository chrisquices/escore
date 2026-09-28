package escore.ide.folding;

import com.intellij.codeInsight.folding.CodeFoldingManager;
import com.intellij.icons.AllIcons;
import com.intellij.lang.ASTNode;
import com.intellij.lang.folding.FoldingBuilderEx;
import com.intellij.lang.folding.FoldingDescriptor;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.EditorCustomElementRenderer;
import com.intellij.openapi.editor.FoldRegion;
import com.intellij.openapi.editor.FoldingGroup;
import com.intellij.openapi.editor.Inlay;
import com.intellij.openapi.editor.colors.EditorColorsManager;
import com.intellij.openapi.editor.event.DocumentEvent;
import com.intellij.openapi.editor.event.DocumentListener;
import com.intellij.openapi.editor.event.EditorFactoryEvent;
import com.intellij.openapi.editor.event.EditorFactoryListener;
import com.intellij.openapi.editor.event.EditorMouseEvent;
import com.intellij.openapi.editor.event.EditorMouseListener;
import com.intellij.openapi.editor.event.EditorMouseMotionListener;
import com.intellij.openapi.editor.ex.EditorEx;
import com.intellij.openapi.editor.ex.FoldingListener;
import com.intellij.openapi.editor.ex.util.EditorUtil;
import com.intellij.openapi.editor.highlighter.HighlighterIterator;
import com.intellij.openapi.editor.markup.HighlighterLayer;
import com.intellij.openapi.editor.markup.HighlighterTargetArea;
import com.intellij.openapi.editor.markup.RangeHighlighter;
import com.intellij.openapi.editor.markup.TextAttributes;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.util.Disposer;
import com.intellij.openapi.util.Key;
import com.intellij.openapi.util.TextRange;
import com.intellij.psi.PsiElement;
import com.intellij.psi.XmlRecursiveElementWalkingVisitor;
import com.intellij.psi.xml.XmlAttribute;
import com.intellij.psi.xml.XmlAttributeValue;
import com.intellij.util.messages.MessageBusConnection;
import com.intellij.util.ui.JBUI;
import escore.ide.settings.EscoreSettings;
import java.awt.Color;
import java.awt.Cursor;
import java.awt.Graphics;
import java.awt.Rectangle;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.swing.Icon;
import javax.swing.SwingUtilities;
import org.jetbrains.annotations.NotNull;

/** Owns HTML and Vue ARIA-value folding, placeholder styling, and inline collapse controls. */
@Service(Service.Level.APP)
public final class CollapsibleHtmlAria implements Disposable {
    private static final String GROUP_NAME = "escore.html.aria";
    private static final String PLACEHOLDER = "...";
    private static final Key<Controller> CONTROLLER = Key.create("escore.ariaCollapseButtons");

    static boolean isAriaAttribute(String name) {
        int prefix = name.startsWith("v-bind:") ? "v-bind:".length() : name.startsWith(":") ? 1 : 0;
        return name.length() > prefix + "aria-".length()
                && name.regionMatches(true, prefix, "aria-", 0, "aria-".length());
    }

    @Override
    public void dispose() {
        // Controllers are registered as children and disposed by the platform.
    }

    public static void setAllExpanded(@NotNull Editor editor, boolean expanded) {
        if (editor.isDisposed() || editor.getProject() == null || editor.getProject().isDisposed()
                || !EscoreSettings.getInstance().isCollapsibleHtmlAria()) return;
        Controller controller = editor.getUserData(CONTROLLER);
        if (controller == null || controller.disposed) return;
        CodeFoldingManager.getInstance(editor.getProject()).updateFoldRegions(editor);
        editor.getFoldingModel().runBatchFoldingOperation(() -> {
            for (FoldRegion region : editor.getFoldingModel().getAllFoldRegions()) {
                if (controller.isAriaRegion(region)) region.setExpanded(expanded);
            }
        });
    }

    public static final class FactoryListener implements EditorFactoryListener {
        @Override
        public void editorCreated(@NotNull EditorFactoryEvent event) {
            if (!(event.getEditor() instanceof EditorEx editor) || editor.getProject() == null) return;
            CollapsibleHtmlAria service = ApplicationManager.getApplication().getService(CollapsibleHtmlAria.class);
            Controller controller = new Controller(editor);
            editor.putUserData(CONTROLLER, controller);
            Disposer.register(service, controller);
        }

        @Override
        public void editorReleased(@NotNull EditorFactoryEvent event) {
            Controller controller = event.getEditor().getUserData(CONTROLLER);
            if (controller != null) Disposer.dispose(controller);
        }
    }

    /** Tracks only Escore ARIA folds, independently for each editor. */
    private static final class Controller implements Disposable, EditorMouseListener, EditorMouseMotionListener {
        private final EditorEx editor;
        private final Map<FoldRegion, Inlay<CollapseIcon>> buttons = new IdentityHashMap<>();
        private final Map<FoldRegion, RangeHighlighter> placeholderColors = new IdentityHashMap<>();
        private boolean ariaEnabled;
        private boolean refreshQueued;
        private boolean disposed;
        private boolean buttonClick;

        private Controller(EditorEx editor) {
            this.editor = editor;
            ariaEnabled = EscoreSettings.getInstance().isCollapsibleHtmlAria();
            editor.getFoldingModel().addListener(new FoldingListener() {
                @Override
                public void onFoldProcessingEnd() {
                    queueRefresh();
                }
            }, this);
            editor.getDocument().addDocumentListener(new DocumentListener() {
                @Override
                public void documentChanged(@NotNull DocumentEvent event) {
                    queueRefresh();
                }
            }, this);
            MessageBusConnection connection = ApplicationManager.getApplication().getMessageBus().connect(this);
            connection.subscribe(EscoreSettings.CHANGED, () -> {
                boolean enabled = EscoreSettings.getInstance().isCollapsibleHtmlAria();
                if (ariaEnabled == enabled) return;
                ariaEnabled = enabled;
                queueRefresh();
                if (!editor.isDisposed() && !editor.getProject().isDisposed()) {
                    CodeFoldingManager manager = CodeFoldingManager.getInstance(editor.getProject());
                    manager.scheduleAsyncFoldingUpdate(editor);
                    if (enabled) setAllExpanded(editor, false);
                }
            });
            connection.subscribe(EditorColorsManager.TOPIC, scheme -> queueRefresh());
            editor.addPropertyChangeListener(event -> {
                String property = event.getPropertyName();
                if (EditorEx.PROP_HIGHLIGHTER.equals(property) || EditorEx.PROP_FONT_SIZE.equals(property)
                        || EditorEx.PROP_FONT_SIZE_2D.equals(property)) queueRefresh();
            }, this);
            editor.addEditorMouseListener(this);
            editor.addEditorMouseMotionListener(this);
            queueRefresh();
        }

        private void queueRefresh() {
            if (disposed || refreshQueued) return;
            refreshQueued = true;
            // Inlays must be updated after the folding batch has finished.
            ApplicationManager.getApplication().invokeLater(() -> {
                refreshQueued = false;
                if (!disposed && !editor.isDisposed()) refresh();
            });
        }

        private void refresh() {
            Set<FoldRegion> expanded = Collections.newSetFromMap(new IdentityHashMap<>());
            Set<FoldRegion> collapsed = Collections.newSetFromMap(new IdentityHashMap<>());
            if (EscoreSettings.getInstance().isCollapsibleHtmlAria()) {
                for (FoldRegion region : editor.getFoldingModel().getAllFoldRegions()) {
                    if (!isAriaRegion(region)) continue;
                    if (region.isExpanded()) {
                        expanded.add(region);
                    } else if (editor.getFoldingModel().getCollapsedRegionAtOffset(region.getStartOffset()) == region) {
                        // Hidden ARIA highlights would also tint their enclosing fold's placeholder.
                        collapsed.add(region);
                    }
                }
            }

            placeholderColors.entrySet().removeIf(entry -> {
                FoldRegion region = entry.getKey();
                RangeHighlighter color = entry.getValue();
                if (!collapsed.contains(region) || !color.isValid()
                        || color.getStartOffset() != region.getStartOffset()
                        || color.getEndOffset() != region.getEndOffset()) {
                    color.dispose();
                    return true;
                }
                return false;
            });
            for (FoldRegion region : collapsed) {
                Color syntaxColor = attributeValueColor(region);
                TextAttributes attributes = new TextAttributes();
                attributes.setForegroundColor(withOpacity(syntaxColor, 0.60f));
                attributes.setBackgroundColor(withOpacity(syntaxColor, 0.30f));
                RangeHighlighter existing = placeholderColors.get(region);
                if (existing != null) {
                    if (!attributes.equals(existing.getTextAttributes(editor.getColorsScheme()))) {
                        editor.getMarkupModel().setRangeHighlighterAttributes(existing, attributes);
                    }
                    continue;
                }
                // Fold placeholders only inherit decorations explicitly marked visible when folded.
                RangeHighlighter color = editor.getMarkupModel().addRangeHighlighterAndChangeAttributes(
                        null, region.getStartOffset(), region.getEndOffset(), HighlighterLayer.GUARDED_BLOCKS + 1,
                        HighlighterTargetArea.EXACT_RANGE, false, highlighter -> {
                            highlighter.setTextAttributes(attributes);
                            highlighter.setVisibleIfFolded(true);
                        });
                placeholderColors.put(region, color);
            }

            buttons.entrySet().removeIf(entry -> {
                Inlay<CollapseIcon> button = entry.getValue();
                if (!expanded.contains(entry.getKey()) || !button.isValid()
                        || button.getOffset() != entry.getKey().getStartOffset()) {
                    Disposer.dispose(button);
                    return true;
                }
                return false;
            });
            for (FoldRegion region : expanded) {
                Inlay<CollapseIcon> existing = buttons.get(region);
                if (existing != null) {
                    existing.update();
                    continue;
                }
                Inlay<CollapseIcon> button = editor.getInlayModel().addInlineElement(
                        region.getStartOffset(), true, new CollapseIcon(region));
                if (button != null) buttons.put(region, button);
            }
            editor.setCustomCursor(this, null);
        }

        private Color attributeValueColor(FoldRegion region) {
            CharSequence text = editor.getDocument().getImmutableCharSequence();
            int offset = region.getStartOffset();
            while (offset < region.getEndOffset() - 1 && Character.isWhitespace(text.charAt(offset))) offset++;
            // Read syntax highlighting directly, without including our translucent range decoration.
            HighlighterIterator iterator = editor.getHighlighter().createIterator(offset);
            Color foreground = iterator.atEnd() ? null : iterator.getTextAttributes().getForegroundColor();
            if (foreground == null) foreground = editor.getColorsScheme().getDefaultForeground();
            return foreground;
        }

        private static Color withOpacity(Color color, float opacity) {
            return new Color(color.getRed(), color.getGreen(), color.getBlue(), Math.round(255 * opacity));
        }

        private boolean isExpandedAria(FoldRegion region) {
            return isAriaRegion(region) && region.isExpanded();
        }

        private boolean isAriaRegion(FoldRegion region) {
            if (!region.isValid() || region.getGroup() == null
                    || !GROUP_NAME.equals(region.getGroup().toString())) return false;
            CharSequence text = editor.getDocument().getImmutableCharSequence();
            int start = region.getStartOffset();
            int end = region.getEndOffset();
            if (start < 1 || end >= text.length()) return false;
            char quote = text.charAt(start - 1);
            return (quote == '"' || quote == '\'') && text.charAt(end) == quote;
        }

        private CollapseIcon buttonAt(EditorMouseEvent event) {
            Inlay<?> inlay = event.getInlay();
            return inlay != null && inlay.isValid() && inlay.getRenderer() instanceof CollapseIcon icon
                    ? icon : null;
        }

        @Override
        public void mousePressed(@NotNull EditorMouseEvent event) {
            buttonClick = false;
            if (event.isConsumed() || !SwingUtilities.isLeftMouseButton(event.getMouseEvent())) return;
            CollapseIcon icon = buttonAt(event);
            if (icon == null || !isExpandedAria(icon.region)) return;
            buttonClick = true;
            consume(event);
            editor.getFoldingModel().runBatchFoldingOperation(() -> icon.region.setExpanded(false));
        }

        @Override
        public void mouseReleased(@NotNull EditorMouseEvent event) {
            if (buttonClick) consume(event);
        }

        @Override
        public void mouseClicked(@NotNull EditorMouseEvent event) {
            // Do not let the same click expand the newly restored fold placeholder.
            if (buttonClick) consume(event);
            buttonClick = false;
        }

        @Override
        public void mouseMoved(@NotNull EditorMouseEvent event) {
            editor.setCustomCursor(this, buttonAt(event) == null ? null
                    : Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
        }

        @Override
        public void mouseExited(@NotNull EditorMouseEvent event) {
            editor.setCustomCursor(this, null);
        }

        private static void consume(EditorMouseEvent event) {
            event.consume();
            event.getMouseEvent().consume();
        }

        @Override
        public void dispose() {
            disposed = true;
            editor.putUserData(CONTROLLER, null);
            editor.removeEditorMouseListener(this);
            editor.removeEditorMouseMotionListener(this);
            for (Inlay<CollapseIcon> button : buttons.values()) Disposer.dispose(button);
            buttons.clear();
            for (RangeHighlighter color : placeholderColors.values()) color.dispose();
            placeholderColors.clear();
            if (!editor.isDisposed()) editor.setCustomCursor(this, null);
        }
    }

    /** An IDE icon painted before the expanded ARIA value; it never enters the document. */
    private static final class CollapseIcon implements EditorCustomElementRenderer {
        private final FoldRegion region;

        private CollapseIcon(FoldRegion region) {
            this.region = region;
        }

        @Override
        public int calcWidthInPixels(@NotNull Inlay inlay) {
            return Math.max(4 * EditorUtil.getPlainSpaceWidth(inlay.getEditor()),
                    AllIcons.General.CollapseComponent.getIconWidth() + JBUI.scale(6));
        }

        @Override
        public void paint(@NotNull Inlay inlay, @NotNull Graphics graphics,
                          @NotNull Rectangle bounds, @NotNull TextAttributes attributes) {
            Icon icon = AllIcons.General.CollapseComponent;
            icon.paintIcon(inlay.getEditor().getContentComponent(), graphics,
                    bounds.x + (bounds.width - icon.getIconWidth()) / 2,
                    bounds.y + (bounds.height - icon.getIconHeight()) / 2);
        }
    }

    /** Folds values of aria-*, :aria-*, and v-bind:aria-* attributes without changing their names. */
    public static final class FoldingBuilder extends FoldingBuilderEx implements DumbAware {
        @Override
        public FoldingDescriptor @NotNull [] buildFoldRegions(
                @NotNull PsiElement root, @NotNull Document document, boolean quick) {
            if (!EscoreSettings.getInstance().isCollapsibleHtmlAria()) return FoldingDescriptor.EMPTY_ARRAY;

            List<FoldingDescriptor> folds = new ArrayList<>();

            root.accept(new XmlRecursiveElementWalkingVisitor() {
                @Override
                public void visitXmlAttribute(@NotNull XmlAttribute attribute) {
                    super.visitXmlAttribute(attribute);
                    if (!isAriaAttribute(attribute.getName())) return;

                    XmlAttributeValue value = attribute.getValueElement();
                    if (value == null) return;

                    String text = value.getText();
                    if (text.length() < 3) return;
                    char quote = text.charAt(0);
                    if ((quote != '"' && quote != '\'') || text.charAt(text.length() - 1) != quote) return;

                    String ariaValue = text.substring(1, text.length() - 1);
                    if (ariaValue.isBlank()) return;

                    TextRange range = value.getTextRange();
                    folds.add(new FoldingDescriptor(value.getNode(),
                            new TextRange(range.getStartOffset() + 1, range.getEndOffset() - 1),
                            FoldingGroup.newGroup(GROUP_NAME)));
                }
            });

            return folds.toArray(FoldingDescriptor.EMPTY_ARRAY);
        }

        @Override
        public @NotNull String getPlaceholderText(@NotNull ASTNode node) {
            return PLACEHOLDER;
        }

        @Override
        public boolean isCollapsedByDefault(@NotNull ASTNode node) {
            return true;
        }

    }
}
