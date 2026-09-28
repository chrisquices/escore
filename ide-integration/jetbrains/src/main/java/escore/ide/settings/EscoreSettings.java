package escore.ide.settings;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.components.PersistentStateComponent;
import com.intellij.openapi.components.RoamingType;
import com.intellij.openapi.components.Service;
import com.intellij.openapi.components.State;
import com.intellij.openapi.components.Storage;
import com.intellij.util.messages.Topic;
import org.jetbrains.annotations.NotNull;

@Service(Service.Level.APP)
@State(name = "EscoreIdeSettings", storages = @Storage(
        value = "escore-ide-integration.xml", roamingType = RoamingType.DISABLED))
public final class EscoreSettings implements PersistentStateComponent<EscoreSettings.SettingsState> {
    public static final Topic<Runnable> CHANGED = Topic.create("Escore settings changed", Runnable.class);

    private volatile boolean collapsibleHtmlClasses = true;
    private volatile boolean collapsibleHtmlElements = true;
    private volatile boolean collapsibleHtmlAria = true;

    public static EscoreSettings getInstance() {
        return ApplicationManager.getApplication().getService(EscoreSettings.class);
    }

    public boolean isCollapsibleHtmlClasses() {
        return collapsibleHtmlClasses;
    }

    public void setCollapsibleHtmlClasses(boolean enabled) {
        if (collapsibleHtmlClasses == enabled) return;
        collapsibleHtmlClasses = enabled;
        notifyChanged();
    }

    public boolean isCollapsibleHtmlElements() {
        return collapsibleHtmlElements;
    }

    public void setCollapsibleHtmlElements(boolean enabled) {
        if (collapsibleHtmlElements == enabled) return;
        collapsibleHtmlElements = enabled;
        notifyChanged();
    }

    public boolean isCollapsibleHtmlAria() {
        return collapsibleHtmlAria;
    }

    public void setCollapsibleHtmlAria(boolean enabled) {
        if (collapsibleHtmlAria == enabled) return;
        collapsibleHtmlAria = enabled;
        notifyChanged();
    }

    private void notifyChanged() {
        // Refresh existing editors as well as any other open Escore panels.
        var application = ApplicationManager.getApplication();
        application.invokeLater(() -> {
            if (application.isDisposed()) return;
            application.getMessageBus().syncPublisher(CHANGED).run();
        });
    }

    @Override
    public @NotNull SettingsState getState() {
        SettingsState state = new SettingsState();
        state.collapseHtmlClasses = collapsibleHtmlClasses;
        state.collapsibleHtmlElements = collapsibleHtmlElements;
        state.collapsibleHtmlAria = collapsibleHtmlAria;
        return state;
    }

    @Override
    public void loadState(@NotNull SettingsState state) {
        setCollapsibleHtmlClasses(state.collapseHtmlClasses);
        setCollapsibleHtmlElements(state.collapsibleHtmlElements);
        setCollapsibleHtmlAria(state.collapsibleHtmlAria);
    }

    public static final class SettingsState {
        // Keep the existing storage key so renaming the label preserves saved preferences.
        public boolean collapseHtmlClasses = true;
        public boolean collapsibleHtmlElements = true;
        public boolean collapsibleHtmlAria = true;
    }
}
