import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface OfflineTransaction {
  id: string;
  blob: Blob; // The audio blob
  timestamp: number;
}

interface AppState {
  offlineQueue: OfflineTransaction[];
  addToQueue: (tx: OfflineTransaction) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      offlineQueue: [],
      addToQueue: (tx) => set((state) => ({ offlineQueue: [...state.offlineQueue, tx] })),
      removeFromQueue: (id) => set((state) => ({ offlineQueue: state.offlineQueue.filter(q => q.id !== id) })),
      clearQueue: () => set({ offlineQueue: [] })
    }),
    {
      name: 'invoiced-offline-storage',
      // Note: Blob objects don't serialize well in localStorage out of the box.
      // For a true offline app with audio, we'd use IndexedDB (localForage).
      // For this MVP, we will only cache the basic app state, and skip Blob serialization 
      // by using a custom storage mechanism if needed, or dropping offline audio.
      // We'll partially persist it.
      partialize: (state) => ({ offlineQueue: [] }), // We don't persist blobs in localStorage for now
    }
  )
);
