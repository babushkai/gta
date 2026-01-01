import { SaveData } from '@/types';

const SAVE_KEY_PREFIX = 'gta_browser_save_';
const AUTO_SAVE_KEY = 'gta_browser_autosave';
const SETTINGS_KEY = 'gta_browser_settings';

export class SaveManager {
  private maxSlots: number = 10;

  async save(slot: number, data: SaveData): Promise<boolean> {
    try {
      const key = `${SAVE_KEY_PREFIX}${slot}`;
      const serialized = JSON.stringify(data);
      localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.error('Failed to save game:', error);
      return false;
    }
  }

  async load(slot: number): Promise<SaveData | null> {
    try {
      const key = `${SAVE_KEY_PREFIX}${slot}`;
      const serialized = localStorage.getItem(key);
      if (!serialized) return null;
      return JSON.parse(serialized) as SaveData;
    } catch (error) {
      console.error('Failed to load game:', error);
      return null;
    }
  }

  async autoSave(data: SaveData): Promise<boolean> {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(AUTO_SAVE_KEY, serialized);
      return true;
    } catch (error) {
      console.error('Failed to auto-save:', error);
      return false;
    }
  }

  async loadAutoSave(): Promise<SaveData | null> {
    try {
      const serialized = localStorage.getItem(AUTO_SAVE_KEY);
      if (!serialized) return null;
      return JSON.parse(serialized) as SaveData;
    } catch (error) {
      console.error('Failed to load auto-save:', error);
      return null;
    }
  }

  async deleteSave(slot: number): Promise<boolean> {
    try {
      const key = `${SAVE_KEY_PREFIX}${slot}`;
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Failed to delete save:', error);
      return false;
    }
  }

  async getSaveSlots(): Promise<Array<{ slot: number; data: SaveData | null }>> {
    const slots: Array<{ slot: number; data: SaveData | null }> = [];

    for (let i = 0; i < this.maxSlots; i++) {
      const data = await this.load(i);
      slots.push({ slot: i, data });
    }

    return slots;
  }

  hasSave(slot: number): boolean {
    const key = `${SAVE_KEY_PREFIX}${slot}`;
    return localStorage.getItem(key) !== null;
  }

  hasAutoSave(): boolean {
    return localStorage.getItem(AUTO_SAVE_KEY) !== null;
  }

  saveSettings(settings: Record<string, unknown>): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  loadSettings(): Record<string, unknown> | null {
    try {
      const serialized = localStorage.getItem(SETTINGS_KEY);
      if (!serialized) return null;
      return JSON.parse(serialized);
    } catch (error) {
      console.error('Failed to load settings:', error);
      return null;
    }
  }

  clearAllSaves(): void {
    for (let i = 0; i < this.maxSlots; i++) {
      const key = `${SAVE_KEY_PREFIX}${i}`;
      localStorage.removeItem(key);
    }
    localStorage.removeItem(AUTO_SAVE_KEY);
  }

  getStorageUsage(): { used: number; total: number } {
    let used = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('gta_browser_')) {
        const value = localStorage.getItem(key);
        if (value) {
          used += key.length + value.length;
        }
      }
    }

    return {
      used: used * 2,
      total: 5 * 1024 * 1024
    };
  }

  exportSave(slot: number): string | null {
    const key = `${SAVE_KEY_PREFIX}${slot}`;
    const data = localStorage.getItem(key);
    if (!data) return null;

    return btoa(data);
  }

  importSave(slot: number, encodedData: string): boolean {
    try {
      const data = atob(encodedData);
      const parsed = JSON.parse(data) as SaveData;

      if (!parsed.version || !parsed.timestamp || !parsed.player) {
        throw new Error('Invalid save data format');
      }

      const key = `${SAVE_KEY_PREFIX}${slot}`;
      localStorage.setItem(key, data);
      return true;
    } catch (error) {
      console.error('Failed to import save:', error);
      return false;
    }
  }
}
