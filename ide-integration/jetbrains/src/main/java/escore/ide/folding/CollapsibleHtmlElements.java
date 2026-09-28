package escore.ide.folding;

import com.intellij.codeInsight.folding.CodeFoldingManager;
import com.intellij.icons.AllIcons;
import com.intellij.lang.html.HTMLLanguage;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ReadAction;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.editor.Document;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.FoldRegion;
import com.intellij.openapi.editor.event.DocumentEvent;
import com.intellij.openapi.editor.event.DocumentListener;
import com.intellij.openapi.editor.event.EditorFactoryEvent;
import com.intellij.openapi.editor.event.EditorFactoryListener;
import com.intellij.openapi.editor.event.EditorMouseEvent;
import com.intellij.openapi.editor.event.EditorMouseEventArea;
import com.intellij.openapi.editor.event.EditorMouseListener;
import com.intellij.openapi.editor.event.EditorMouseMotionListener;
import com.intellij.openapi.editor.ex.EditorEx;
import com.intellij.openapi.editor.ex.FoldingListener;
import com.intellij.openapi.util.Disposer;
import com.intellij.openapi.util.Key;
import com.intellij.openapi.util.TextRange;
import com.intellij.psi.PsiDocumentManager;
import com.intellij.psi.PsiFile;
import com.intellij.psi.util.PsiTreeUtil;
import com.intellij.psi.xml.XmlTag;
import com.intellij.util.ui.JBUI;
import com.intellij.xml.util.XmlTagUtil;
import escore.ide.settings.EscoreSettings;
import org.jetbrains.annotations.NotNull;

import javax.swing.Icon;
import javax.swing.JLabel;
import javax.swing.SwingConstants;
import javax.swing.SwingUtilities;
import java.awt.Cursor;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import java.util.ArrayList;
import java.util.List;

/** Hover controls for existing HTML element folds. Never creates folds or edits the document. */
@Service(Service.Level.APP)
public final class CollapsibleHtmlElements implements Disposable {
    private static final Key<Controller> CONTROLLER = Key.create("escore.htmlElementFoldControls");

    @Override
    public void dispose() {
        // Editor controllers are disposed as children of this service.
    }

    public static void setAllExpanded(@NotNull Editor editor, boolean expanded) {
        if (editor.isDisposed() || editor.getProject() == null || editor.getProject().isDisposed()) return;
        CodeFoldingManager.getInstance(editor.getProject()).updateFoldRegions(editor);
        List<FoldRegion> elements = ReadAction.computeBlocking(() -> {
            List<FoldRegion> result = new ArrayList<>();
            PsiFile file = PsiDocumentManager.getInstance(editor.getProject()).getCachedPsiFile(editor.getDocument());
            if (file == null) return result;
            for (FoldRegion region : editor.getFoldingModel().getAllFoldRegions()) {
                if (!region.isValid() || region.shouldNeverExpand()) continue;
                XmlTag tag = PsiTreeUtil.getParentOfType(
                        file.findElementAt(Math.max(0, region.getStartOffset() - 1)), XmlTag.class, false);
                if (isElementFold(region, tag)) result.add(region);
            }
            return result;
        });
        editor.getFoldingModel().runBatchFoldingOperation(() -> {
            for (FoldRegion region : elements) {
                if (region.isValid()) region.setExpanded(expanded);
            }
        });
    }

    private static boolean isElementFold(FoldRegion region, XmlTag tag) {
        if (tag == null || !tag.getLanguage().isKindOf(HTMLLanguage.INSTANCE)) return false;
        TextRange opening = XmlTagUtil.getStartTagRange(tag);
        TextRange closing = XmlTagUtil.getEndTagRange(tag);
        if (opening == null) return false;
        int tagEnd = tag.getTextRange().getEndOffset();
        int minimumEnd = closing == null ? tagEnd - 1 : closing.getStartOffset();
        return region.getStartOffset() >= tag.getTextRange().getStartOffset()
                && region.getStartOffset() <= opening.getEndOffset()
                && region.getEndOffset() >= minimumEnd && region.getEndOffset() <= tagEnd;
    }

    public static final class FactoryListener implements EditorFactoryListener {
        @Override
        public void editorCreated(@NotNull EditorFactoryEvent event) {
            if (!(event.getEditor() instanceof EditorEx editor) || editor.getProject() == null) return;
            Controller controller = new Controller(editor);
            editor.putUserData(CONTROLLER, controller);
            Disposer.register(ApplicationManager.getApplication().getService(CollapsibleHtmlElements.class), controller);
        }

        @Override
        public void editorReleased(@NotNull EditorFactoryEvent event) {
            Controller controller = event.getEditor().getUserData(CONTROLLER);
            if (controller != null) Disposer.dispose(controller);
        }
    }

    private record Target(FoldRegion region, int tagOffset) {}

    private static final class Controller implements Disposable, EditorMouseListener, EditorMouseMotionListener {
        private final EditorEx editor;
        private final JLabel button = new JLabel();
        private Target target;
        private int hoveredVisualLine = -1;
        private boolean refreshQueued;
        private boolean disposed;

        private Controller(EditorEx editor) {
            this.editor = editor;
            button.setOpaque(false);
            button.setFocusable(false);
            button.setHorizontalAlignment(SwingConstants.CENTER);
            button.setCursor(Cursor.getPredefinedCursor(Cursor.HAND_CURSOR));
            button.setVisible(false);
            button.addMouseListener(new MouseAdapter() {
                @Override
                public void mousePressed(MouseEvent event) {
                    if (!EscoreSettings.getInstance().isCollapsibleHtmlElements()
                            || !SwingUtilities.isLeftMouseButton(event) || target == null || !target.region().isValid()) return;
                    event.consume();
                    FoldRegion region = target.region();
                    editor.getFoldingModel().runBatchFoldingOperation(() -> region.setExpanded(!region.isExpanded()));
                    queueRefresh();
                }

                @Override
                public void mouseExited(MouseEvent event) {
                    queueRefresh();
                }
            });
            // A transparent child overlays existing indentation; it adds no editor columns or source text.
            editor.getContentComponent().add(button);
            ApplicationManager.getApplication().getMessageBus().connect(this)
                    .subscribe(EscoreSettings.CHANGED, this::queueRefresh);
            editor.addEditorMouseListener(this);
            editor.addEditorMouseMotionListener(this);
            editor.getFoldingModel().addListener(new FoldingListener() {
                @Override
                public void onFoldProcessingEnd() {
                    queueRefresh();
                }
            }, this);
            editor.getScrollingModel().addVisibleAreaListener(event -> queueRefresh(), this);
            editor.addPropertyChangeListener(event -> queueRefresh(), this);
            editor.getDocument().addDocumentListener(new DocumentListener() {
                @Override
                public void documentChanged(@NotNull DocumentEvent event) {
                    hideButton();
                    hoveredVisualLine = -1;
                    PsiDocumentManager.getInstance(editor.getProject())
                            .performForCommittedDocument(event.getDocument(), Controller.this::queueRefresh);
                }
            }, this);
        }

        private void queueRefresh() {
            if (disposed || refreshQueued) return;
            refreshQueued = true;
            ApplicationManager.getApplication().invokeLater(() -> {
                refreshQueued = false;
                if (disposed || editor.isDisposed() || editor.getProject().isDisposed()) return;
                hoveredVisualLine = -1;
                refreshAt(editor.getContentComponent().getMousePosition(true));
            });
        }

        private void refreshAt(Point point) {
            if (!EscoreSettings.getInstance().isCollapsibleHtmlElements()
                    || point == null || !editor.getScrollingModel().getVisibleArea().contains(point)) {
                hoveredVisualLine = -1;
                hideButton();
                return;
            }
            int visualLine = editor.xyToVisualPosition(point).line;
            if (visualLine != hoveredVisualLine || target != null && !target.region().isValid()) {
                hideButton();
                hoveredVisualLine = visualLine;
                int line = editor.visualToLogicalPosition(editor.xyToVisualPosition(point)).line;
                target = ReadAction.computeBlocking(() -> findTarget(line));
            }
            if (target == null) return;

            Point tagPoint = editor.offsetToXY(target.tagOffset());
            // Wrapped continuation rows must not reveal a button on a different row.
            if (editor.offsetToVisualPosition(target.tagOffset()).line != visualLine) {
                hideButton();
                return;
            }
            Icon icon = target.region().isExpanded() ? AllIcons.General.CollapseComponent : AllIcons.General.ExpandComponent;
            int width = icon.getIconWidth() + JBUI.scale(6);
            int x = tagPoint.x - width - JBUI.scale(2);
            int lineStart = editor.getDocument().getLineStartOffset(editor.getDocument().getLineNumber(target.tagOffset()));
            Rectangle visible = editor.getScrollingModel().getVisibleArea();
            if (x < Math.max(editor.offsetToXY(lineStart).x, visible.x)) {
                // With no spare indentation, the IDE's existing gutter control remains available.
                hideButton();
                return;
            }
            button.setIcon(icon);
            button.setToolTipText(target.region().isExpanded() ? "Collapse element" : "Expand element");
            button.setBounds(x, tagPoint.y, width, editor.getLineHeight());
            button.setVisible(true);
            button.repaint();
        }

        private Target findTarget(int line) {
            Document document = editor.getDocument();
            if (line < 0 || line >= document.getLineCount() || !editor.getFoldingModel().isFoldingEnabled()) return null;
            int start = document.getLineStartOffset(line);
            int lineEnd = document.getLineEndOffset(line);
            CharSequence text = document.getImmutableCharSequence();
            while (start < lineEnd && (text.charAt(start) == ' ' || text.charAt(start) == '\t')) start++;
            if (start >= lineEnd || text.charAt(start) != '<'
                    || editor.getFoldingModel().getCollapsedRegionAtOffset(start) != null) return null;

            PsiDocumentManager manager = PsiDocumentManager.getInstance(editor.getProject());
            if (!manager.isCommitted(document)) return null;
            PsiFile file = manager.getCachedPsiFile(document);
            if (file == null) return null;
            XmlTag tag = PsiTreeUtil.getParentOfType(file.findElementAt(start + 1), XmlTag.class, false);
            if (tag == null || tag.getTextRange().getStartOffset() != start
                    || !tag.getLanguage().isKindOf(HTMLLanguage.INSTANCE)) return null;
            FoldRegion best = null;
            for (FoldRegion region : editor.getFoldingModel().getAllFoldRegions()) {
                if (!region.isValid() || region.shouldNeverExpand() || !isElementFold(region, tag)) continue;
                if (best == null || region.getEndOffset() - region.getStartOffset() > best.getEndOffset() - best.getStartOffset()) {
                    best = region;
                }
            }
            return best == null ? null : new Target(best, start);
        }

        private void hideButton() {
            target = null;
            button.setVisible(false);
        }

        @Override
        public void mouseMoved(@NotNull EditorMouseEvent event) {
            if (disposed || editor.isDisposed() || editor.getProject().isDisposed()) return;
            refreshAt(event.getArea() == EditorMouseEventArea.EDITING_AREA ? event.getMouseEvent().getPoint() : null);
        }

        @Override
        public void mouseDragged(@NotNull EditorMouseEvent event) {
            hoveredVisualLine = -1;
            hideButton();
        }

        @Override
        public void mouseExited(@NotNull EditorMouseEvent event) {
            // Moving onto our child button is still hovering inside the editor.
            queueRefresh();
        }

        @Override
        public void dispose() {
            disposed = true;
            editor.putUserData(CONTROLLER, null);
            editor.removeEditorMouseListener(this);
            editor.removeEditorMouseMotionListener(this);
            Rectangle bounds = button.getBounds();
            editor.getContentComponent().remove(button);
            editor.getContentComponent().repaint(bounds);
        }
    }
}
