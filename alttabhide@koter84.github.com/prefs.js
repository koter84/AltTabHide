/**
 * Alt-Tab Hide Extension Preferences for GNOME Shell 49
 *
 * Settings UI to select which applications to hide from Alt-Tab
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class AltTabHidePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Create a preferences page
        const page = new Adw.PreferencesPage({
            title: _('Alt-Tab Hide Settings'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        // Create the main preferences widget
        const prefsWidget = new AltTabHidePrefsWidget(settings);
        page.add(prefsWidget);
    }
}

const AltTabHidePrefsWidget = GObject.registerClass(
class AltTabHidePrefsWidget extends Adw.PreferencesGroup {
    _init(settings) {
        super._init({
            title: _('Hidden Applications'),
            description: _('Select applications to hide from the Alt-Tab window switcher'),
        });

        this._settings = settings;
        this._checkboxes = new Map();
        this._hiddenAppRows = [];

        this._buildUI();
    }

    _buildUI() {
        // Get current hidden apps
        const hiddenApps = this._settings.get_strv('hidden-apps');

        // Add hidden apps directly to this group
        this._updateHiddenAppsList();

        // Available apps section with search
        const availableGroup = new Adw.PreferencesGroup({
            title: _('Available Applications'),
            description: _('Search and check to hide from Alt-Tab'),
			margin_top: 20,
        });
        this._availableAppsGroup = availableGroup;
        this.add(availableGroup);

        // Create a search entry for filtering
        const searchRow = new Adw.ActionRow({
            title: _('Search Applications'),
        });

        const searchEntry = new Gtk.SearchEntry({
            placeholder_text: _('Type to filter...'),
            valign: Gtk.Align.CENTER,
        });
        searchEntry.connect('search-changed', () => {
            this._filterApps(searchEntry.get_text().toLowerCase());
        });
        searchRow.add_suffix(searchEntry);
        this._availableAppsGroup.add(searchRow);

        // Get all installed applications
        this._loadInstalledApps(hiddenApps);

        // Listen for settings changes
        this._settings.connect('changed::hidden-apps', () => {
            this._updateHiddenAppsList();
        });
    }

    _loadInstalledApps(hiddenApps) {
        // Get all installed applications using Gio.AppInfo (works in prefs context)
        const apps = Gio.AppInfo.get_all();

        // Filter to only show apps that should be visible
        const visibleApps = apps.filter(app => app.should_show());

        // Sort apps by name
        visibleApps.sort((a, b) => {
            const nameA = a.get_display_name() || '';
            const nameB = b.get_display_name() || '';
            return nameA.localeCompare(nameB);
        });

        this._appRows = [];

        for (const app of visibleApps) {
            const appId = app.get_id();
            const appName = app.get_display_name();

            if (!appName || !appId) continue;

            const row = new Adw.ActionRow({
                title: appName,
                subtitle: appId,
            });

            // Create checkbox
            const checkbox = new Gtk.CheckButton({
                valign: Gtk.Align.CENTER,
            });
            checkbox.set_active(hiddenApps.includes(appId));

            checkbox.connect('toggled', () => {
                this._onAppToggled(appId, checkbox.get_active());
            });

            this._checkboxes.set(appId, checkbox);
            row.add_prefix(checkbox);
            row.set_activatable_widget(checkbox);

            // Store row for filtering
            row._appName = appName.toLowerCase();
            row._appId = appId.toLowerCase();
            this._appRows.push(row);

            this._availableAppsGroup.add(row);
        }
    }

    _filterApps(searchText) {
        for (const row of this._appRows) {
            const visible = !searchText ||
                row._appName.includes(searchText) ||
                row._appId.includes(searchText);
            row.visible = visible;
        }
    }

    _onAppToggled(appId, isActive) {
        let hiddenApps = this._settings.get_strv('hidden-apps');

        if (isActive && !hiddenApps.includes(appId)) {
            hiddenApps.push(appId);
        } else if (!isActive && hiddenApps.includes(appId)) {
            hiddenApps = hiddenApps.filter(id => id !== appId);
        }

        this._settings.set_strv('hidden-apps', hiddenApps);
    }

    _updateHiddenAppsList() {
        // Remove existing hidden app rows
        for (const row of this._hiddenAppRows) {
            this.remove(row);
        }
        this._hiddenAppRows = [];

        // Get current hidden apps
        const hiddenApps = this._settings.get_strv('hidden-apps');

        if (hiddenApps.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: _('No hidden apps'),
                subtitle: _('Use the search below to find and hide apps from Alt-Tab'),
            });
            this._hiddenAppRows.push(emptyRow);
            this.add(emptyRow);
            return;
        }

        // Add rows for each hidden app
        for (const appId of hiddenApps) {
            // Try to get app info using GioUnix.DesktopAppInfo
            const app = GioUnix.DesktopAppInfo.new(appId);
            const appName = app ? app.get_display_name() : appId;

            const row = new Adw.ActionRow({
                title: appName,
                subtitle: appId,
            });

            // Add remove button
            const removeButton = new Gtk.Button({
                icon_name: 'list-remove-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat', 'error'],
            });
            removeButton.connect('clicked', () => {
                this._removeHiddenApp(appId);
            });

            row.add_suffix(removeButton);
            this._hiddenAppRows.push(row);
            this.add(row);
        }
    }

    _removeHiddenApp(appId) {
        let hiddenApps = this._settings.get_strv('hidden-apps');
        hiddenApps = hiddenApps.filter(id => id !== appId);
        this._settings.set_strv('hidden-apps', hiddenApps);

        // Update checkbox if it exists
        const checkbox = this._checkboxes.get(appId);
        if (checkbox) {
            checkbox.set_active(false);
        }
    }
});
