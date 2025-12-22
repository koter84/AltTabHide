/**
 * Alt-Tab Hide Extension for GNOME Shell 49
 * 
 * This extension allows users to hide specific applications from the Alt-Tab window switcher.
 * It uses InjectionManager to override the default alt-tab behavior.
 * 
 * GNOME 49 Alt-Tab architecture:
 * - AppSwitcherPopup: Main Alt+Tab (switch-applications) - shows apps with their windows
 * - WindowSwitcherPopup: Alt+Tab (switch-windows) - shows individual windows
 * - WindowCyclerPopup: Cycle windows mode
 * - GroupCyclerPopup: Cycle within app group
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
        this._settingsChangedId = null;
    }

    enable() {
        log('[AltTabHide] Extension enabling...');
        
        this._settings = this.getSettings();
        this._injectionManager = new InjectionManager();
        
        // Setup the alt-tab filtering
        this._setupAltTabFiltering();
        
        // Listen for settings changes
        this._settingsChangedId = this._settings.connect('changed::hidden-apps', () => {
            log('[AltTabHide] Settings changed, reloading hidden apps list');
            this._logHiddenApps();
        });
        
        this._logHiddenApps();
        log('[AltTabHide] Extension enabled successfully');
    }

    disable() {
        log('[AltTabHide] Extension disabling...');
        
        // Disconnect settings signal
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        
        // Clear all injections
        if (this._injectionManager) {
            this._injectionManager.clear();
            this._injectionManager = null;
        }
        
        if (this._settings) {
            this._settings.run_dispose();
            this._settings = null;
        }
        
        log('[AltTabHide] Extension disabled successfully');
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
     * Log the current list of hidden apps
     */
    _logHiddenApps() {
        const hiddenApps = this._getHiddenApps();
        log(`[AltTabHide] Currently hidden apps: ${JSON.stringify(hiddenApps)}`);
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
        
        if (shouldHide) {
            log(`[AltTabHide] Hiding app: ${appId}`);
        }
        
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
        
        if (shouldHide) {
            log(`[AltTabHide] Hiding window for app: ${appId}`);
        }
        
        return shouldHide;
    }

    /**
     * Setup the InjectionManager overrides for alt-tab filtering
     */
    _setupAltTabFiltering() {
        log('[AltTabHide] Setting up alt-tab filtering with InjectionManager');
        
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
                    log('[AltTabHide] AppSwitcherPopup._init called');
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
                        log(`[AltTabHide] Checking ${originalCount} apps against hidden list: ${JSON.stringify(hiddenApps)}`);
                        
                        // Find indices of items to remove (in reverse order to avoid index shifting)
                        const indicesToRemove = [];
                        for (let i = 0; i < this._items.length; i++) {
                            const appIcon = this._items[i];
                            if (appIcon && appIcon.app) {
                                const appId = appIcon.app.get_id();
                                if (hiddenApps.includes(appId)) {
                                    log(`[AltTabHide] Will remove app at index ${i}: ${appId}`);
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
                        
                        log(`[AltTabHide] Filtered ${indicesToRemove.length} apps from AppSwitcherPopup (${originalCount} -> ${this._items.length})`);
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
                    log('[AltTabHide] WindowSwitcherPopup._getWindowList called');
                    const windows = originalMethod.call(this, ...args);
                    const filteredWindows = windows.filter(window => !self._shouldHideWindow(window));
                    log(`[AltTabHide] Filtered ${windows.length - filteredWindows.length} windows from WindowSwitcherPopup`);
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
                    log('[AltTabHide] WindowCyclerPopup._getWindows called');
                    const windows = originalMethod.call(this, ...args);
                    const filteredWindows = windows.filter(window => !self._shouldHideWindow(window));
                    log(`[AltTabHide] Filtered ${windows.length - filteredWindows.length} windows from WindowCyclerPopup`);
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
                    log('[AltTabHide] GroupCyclerPopup._getWindows called');
                    const windows = originalMethod.call(this, ...args);
                    const filteredWindows = windows.filter(window => !self._shouldHideWindow(window));
                    log(`[AltTabHide] Filtered ${windows.length - filteredWindows.length} windows from GroupCyclerPopup`);
                    return filteredWindows;
                };
            }
        );

        log('[AltTabHide] Alt-tab filtering setup complete');
    }
}
