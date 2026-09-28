package escore.ide.ui;

import com.intellij.icons.AllIcons;
import com.intellij.openapi.Disposable;
import com.intellij.openapi.actionSystem.AnActionEvent;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.WriteIntentReadAction;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.fileEditor.FileEditorManager;
import com.intellij.openapi.project.DumbAware;
import com.intellij.openapi.project.DumbAwareAction;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Disposer;
import com.intellij.openapi.wm.ToolWindow;
import com.intellij.openapi.wm.ToolWindowFactory;
import com.intellij.openapi.wm.ToolWindowManager;
import com.intellij.openapi.wm.ToolWindowType;
import com.intellij.openapi.wm.WindowManager;
import com.intellij.ui.TitledSeparator;
import com.intellij.ui.components.JBCheckBox;
import com.intellij.ui.content.Content;
import com.intellij.util.ui.JBUI;
import escore.ide.folding.CollapsibleHtmlAria;
import escore.ide.folding.CollapsibleHtmlClasses;
import escore.ide.folding.CollapsibleHtmlElements;
import escore.ide.settings.EscoreSettings;
import org.jetbrains.annotations.NotNull;

import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JPanel;
import java.awt.BorderLayout;
import java.awt.CardLayout;
import java.awt.GridLayout;
import java.awt.Rectangle;
import java.util.List;
import java.util.function.Consumer;

public final class EscoreToolWindowFactory implements ToolWindowFactory, DumbAware {
    @Override
    public void init(@NotNull ToolWindow toolWindow) {
        ToolWindowManager.getInstance(toolWindow.getProject()).invokeLater(() -> {
            if (toolWindow.isDisposed() || toolWindow.getProject().isDisposed()) return;
            Rectangle bounds = new Rectangle(JBUI.size(320, 480));
            JFrame frame = WindowManager.getInstance().getFrame(toolWindow.getProject());
            if (frame != null) {
                bounds.setLocation(frame.getX() + Math.max(0, (frame.getWidth() - bounds.width) / 2),
                        frame.getY() + Math.max(0, (frame.getHeight() - bounds.height) / 2));
            }
            // Defaults only: the IDE retains the user's later size, position and docking choice.
            toolWindow.setDefaultState(null, ToolWindowType.FLOATING, bounds);
        });
    }

    @Override
    public void createToolWindowContent(@NotNull Project project, @NotNull ToolWindow toolWindow) {
        Disposable disposable = Disposer.newDisposable("Escore panel");
        Panel panel = new Panel(toolWindow, disposable);
        Content content = toolWindow.getContentManager().getFactory().createContent(panel, "", false);
        content.setDisposer(disposable);
        toolWindow.getContentManager().addContent(content);
        panel.updateHeader();
    }

    private static final class Panel extends JPanel {
        private final ToolWindow toolWindow;
        private final CardLayout pages = new CardLayout();
        private final JPanel body = new JPanel(pages);
        private final JBCheckBox collapsibleClasses;
        private final JBCheckBox collapsibleElements;
        private final JBCheckBox collapsibleAria;
        private boolean showingSettings;

        private Panel(ToolWindow toolWindow, Disposable disposable) {
            super(new BorderLayout());
            this.toolWindow = toolWindow;
            setBorder(JBUI.Borders.empty(12));
            setPreferredSize(JBUI.size(320, 480));
            setMinimumSize(JBUI.size(220, 120));

            EscoreSettings settings = EscoreSettings.getInstance();
            collapsibleClasses = new JBCheckBox("Collapsible HTML Classes", settings.isCollapsibleHtmlClasses());
            collapsibleClasses.addActionListener(event ->
                    settings.setCollapsibleHtmlClasses(collapsibleClasses.isSelected()));
            collapsibleElements = new JBCheckBox("Collapsible HTML Elements", settings.isCollapsibleHtmlElements());
            collapsibleElements.addActionListener(event ->
                    settings.setCollapsibleHtmlElements(collapsibleElements.isSelected()));
            collapsibleAria = new JBCheckBox("Collapsible HTML ARIA", settings.isCollapsibleHtmlAria());
            collapsibleAria.addActionListener(event ->
                    settings.setCollapsibleHtmlAria(collapsibleAria.isSelected()));
            ApplicationManager.getApplication().getMessageBus().connect(disposable)
                    .subscribe(EscoreSettings.CHANGED, () -> {
                        collapsibleClasses.setSelected(settings.isCollapsibleHtmlClasses());
                        collapsibleElements.setSelected(settings.isCollapsibleHtmlElements());
                        collapsibleAria.setSelected(settings.isCollapsibleHtmlAria());
                    });

            JPanel htmlOptions = new JPanel(new GridLayout(0, 1, 0, JBUI.scale(4)));
            htmlOptions.add(collapsibleClasses);
            htmlOptions.add(collapsibleElements);
            htmlOptions.add(collapsibleAria);
            JPanel htmlSection = new JPanel(new BorderLayout(0, JBUI.scale(8)));
            htmlSection.add(new TitledSeparator("HTML"), BorderLayout.NORTH);
            htmlSection.add(htmlOptions, BorderLayout.CENTER);

            JPanel settingsPage = new JPanel(new BorderLayout());
            settingsPage.add(htmlSection, BorderLayout.NORTH);
            JPanel htmlActions = new JPanel(new GridLayout(0, 2, JBUI.scale(8), JBUI.scale(8)));
            htmlActions.add(actionButton("Collapse All Elements", editor -> CollapsibleHtmlElements.setAllExpanded(editor, false)));
            htmlActions.add(actionButton("Expand All Elements", editor -> CollapsibleHtmlElements.setAllExpanded(editor, true)));
            htmlActions.add(actionButton("Collapse All Classes", editor -> CollapsibleHtmlClasses.setAllExpanded(editor, false)));
            htmlActions.add(actionButton("Expand All Classes", editor -> CollapsibleHtmlClasses.setAllExpanded(editor, true)));
            htmlActions.add(actionButton("Collapse All ARIA", editor -> CollapsibleHtmlAria.setAllExpanded(editor, false)));
            htmlActions.add(actionButton("Expand All ARIA", editor -> CollapsibleHtmlAria.setAllExpanded(editor, true)));
            JPanel homeHtmlSection = new JPanel(new BorderLayout(0, JBUI.scale(8)));
            homeHtmlSection.add(new TitledSeparator("HTML"), BorderLayout.NORTH);
            homeHtmlSection.add(htmlActions, BorderLayout.CENTER);
            JPanel homePage = new JPanel(new BorderLayout());
            homePage.add(homeHtmlSection, BorderLayout.NORTH);
            body.add(homePage, "main");
            body.add(settingsPage, "settings");
            add(body, BorderLayout.CENTER);
        }

        private JButton actionButton(String label, Consumer<Editor> action) {
            JButton button = new JButton(label);
            button.setMargin(JBUI.insets(6, 4));
            button.setToolTipText(label + " in the active editor");
            // Swing button callbacks do not acquire the editor-model lock automatically.
            button.addActionListener(event -> WriteIntentReadAction.run(() -> {
                Project project = toolWindow.getProject();
                if (project.isDisposed()) return;
                Editor editor = FileEditorManager.getInstance(project).getSelectedTextEditor();
                if (editor != null && !editor.isDisposed()) action.accept(editor);
            }));
            return button;
        }

        private void toggleSettings() {
            showingSettings = !showingSettings;
            pages.show(body, showingSettings ? "settings" : "main");
            updateHeader();
        }

        private void updateHeader() {
            toolWindow.setTitleActions(List.of(new HeaderAction()));
        }

        private final class HeaderAction extends DumbAwareAction {
            private HeaderAction() {
                super(showingSettings ? "Close settings" : "Settings", null,
                        showingSettings ? AllIcons.Actions.Close : AllIcons.General.Settings);
            }

            @Override
            public void actionPerformed(@NotNull AnActionEvent event) {
                toggleSettings();
            }
        }
    }
}
