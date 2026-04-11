import { create } from "zustand";

const useNotifStore = create((set) => ({
  // State
  notifications: [],
  unread: 0,

  // Actions
  addNotification: (message) => {
    set((state) => ({
      notifications: [
        { id: Date.now(), message, read: false, time: new Date() },
        ...state.notifications,
      ],
      unread: state.unread + 1,
    }));
  },

  markRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unread: 0,
    }));
  },

  clearNotifs: () => set({ notifications: [], unread: 0 }),
}));

export default useNotifStore;