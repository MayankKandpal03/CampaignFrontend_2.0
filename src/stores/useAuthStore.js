import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "../api/axios.js";

// Store definition
const authStore = (set) => ({
  // State
  user: null,
  role: null,
  isAuth: false,

  // Action -> Set user and logout
  // It will be a function containg some value that will call set()
  setUser: (userData) =>
    set((state) => ({
      user: userData.username,
      role: userData?.role ?? null,
      isAuth: Boolean(userData),
    })),

  logout: async () => {
    try {
      await api.post("/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      set({ user: null, role: null, isAuth: false });
    }
  },
  clearAuth: () => {
    set({ user: null, role: null, isAuth: false });
  },
});

const useAuthStore = create(persist(authStore, {name:"auth-storage",
    partialize:(state)=>({
        user: state.user,
        role: state.role,
        isAuth: state.isAuth
    })
}))

export default useAuthStore;