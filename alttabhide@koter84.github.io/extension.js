/**
 * Alt-Tab Hide Extension for GNOME Shell
 *
 * This extension allows users to hide specific applications from the Alt-Tab window switcher.
 */

import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as altTab from 'resource:///org/gnome/shell/ui/altTab.js';
import {
    Extension,
    InjectionManager,
} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class AltTabHideExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this._injectionManager = null;
    }

    enable() {
        this._settings = this.getSettings();
        this._injectionManager = new InjectionManager();

        // Setup the alt-tab filtering
        this._setupAltTabFiltering();
    }

    disable() {
		// Clear all injections
        if (this._injectionManager) {
            this._injectionManager.clear();
            this._injectionManager = null;
        }

        // Unset settings
        if (this._settings) {
            this._settings = null;
        }
    }

    /**
     * Get the list of hidden app IDs from settings
     * @returns {string[]} Array of app IDs to hide
     */
    _getHiddenApps() {
        if (!this._settings) {
            return [];
        }
        return this._settings.get_strv('hidden-apps');
    }

    /**
     * Check if an app should be hidden
     * @param {Shell.App} app - The app to check
     * @returns {boolean} True if the app should be hidden
     */
    _shouldHideApp(app) {
        const hiddenApps = this._getHiddenApps();

        if (hiddenApps.length === 0 || !app) {
            return false;
        }

        const appId = app.get_id();
        const shouldHide = hiddenApps.includes(appId);

        return shouldHide;
    }

    /**
     * Check if a window belongs to a hidden application
     * @param {Meta.Window} window - The window to check
     * @returns {boolean} True if the window should be hidden
     */
    _shouldHideWindow(window) {
        const hiddenApps = this._getHiddenApps();

        if (hiddenApps.length === 0) {
            return false;
        }

        // Get the app associated with this window
        const tracker = Shell.WindowTracker.get_default();
        const app = tracker.get_window_app(window);

        if (!app) {
            return false;
        }

        const appId = app.get_id();
        const shouldHide = hiddenApps.includes(appId);

        return shouldHide;
    }

    /**
     * Setup the InjectionManager overrides for alt-tab filtering
     */
    _setupAltTabFiltering() {
        const self = this;

        // =====================================================
        // Override AppSwitcherPopup._init (main Alt+Tab popup)
        // This is the default switch-applications binding
        // =====================================================
        this._injectionManager.overrideMethod(
            altTab.AppSwitcherPopup.prototype,
            '_init',
            (originalMethod) => {
                return function (...args) {
                    // Call original _init first
                    originalMethod.call(this, ...args);

                    // Now filter out hidden apps from the items list
                    // The original _init creates this._switcherList with icons
                    // and sets this._items = this._switcherList.icons
                    if (this._items && this._items.length > 0) {
                        const originalCount = this._items.length;

                        // Filter the icons array to remove hidden apps
                        // We need to also remove them from the switcherList
                        const hiddenApps = self._getHiddenApps();

                        // Find indices of items to remove (in reverse order to avoid index shifting)
                        const indicesToRemove = [];
                        for (let i = 0; i < this._items.length; i++) {
                            const appIcon = this._items[i];
                            if (appIcon && appIcon.app) {
                                const appId = appIcon.app.get_id();
                                if (hiddenApps.includes(appId)) {
                                    indicesToRemove.push(i);
                                }
                            }
                        }

                        // Remove items from the switcherList (in reverse order)
                        for (let i = indicesToRemove.length - 1; i >= 0; i--) {
                            const idx = indicesToRemove[i];
                            // The AppSwitcher has a removeItem method inherited from SwitcherList
                            if (this._switcherList && typeof this._switcherList.removeItem === 'function') {
                                this._switcherList.icons.splice(idx, 1);
                                this._switcherList.removeItem(idx);
                            }
                        }

                        // Update the items reference
                        this._items = this._switcherList.icons;
                    }
                };
            }
        );

        // =====================================================
        // Override WindowSwitcherPopup._getWindowList
        // This is for switch-windows binding
        // =====================================================
        this._injectionManager.overrideMethod(
            altTab.WindowSwitcherPopup.prototype,
            '_getWindowList',
            (originalMethod) => {
                return function (...args) {
                    const windows = originalMethod.call(this, ...args);
                    const filteredWindows = windows.filter(window => !self._shouldHideWindow(window));
                    return filteredWindows;
                };
            }
        );

        // =====================================================
        // Override WindowCyclerPopup._getWindows
        // This is for cycle-windows binding
        // =====================================================
        this._injectionManager.overrideMethod(
            altTab.WindowCyclerPopup.prototype,
            '_getWindows',
            (originalMethod) => {
                return function (...args) {
                    const windows = originalMethod.call(this, ...args);
                    const filteredWindows = windows.filter(window => !self._shouldHideWindow(window));
                    return filteredWindows;
                };
            }
        );

        // =====================================================
        // Override GroupCyclerPopup._getWindows
        // This is for cycle-group binding (Alt+` style)
        // =====================================================
        this._injectionManager.overrideMethod(
            altTab.GroupCyclerPopup.prototype,
            '_getWindows',
            (originalMethod) => {
                return function (...args) {
                    const windows = originalMethod.call(this, ...args);
                    const filteredWindows = windows.filter(window => !self._shouldHideWindow(window));
                    return filteredWindows;
                };
            }
        );
    }
}
