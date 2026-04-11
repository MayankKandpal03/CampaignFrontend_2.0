import { create } from "zustand";
import api from "../api/axios.js";
const campaignStore = (set) => ({
  // States
  campaigns: [],

  // Actions  -> get, create, update
  getCampaign: async () => {
    try {
      const response = await api.get("/campaign/get");
      const campaigns = response.data?.data ?? [];
      set({ campaigns });
      return campaigns;
    } catch (error) {
      console.error("Error while fetching campaigns:", error);
      throw error;
    }
  },

  createCampaign: async (campaign) => {
    try {
      const response = await api.post("/campaign/create", { ...campaign });
      const newCampaign = response.data.data;
      set((state) => ({
        campaigns: [newCampaign, ...state.campaigns],
      }));
    } catch (error) {
      console.error("Create failed:", error);
      throw error;
    }
  },
  updateCampaign: async (campaignId, updateData) => {
    try {
      const response = await api.post("/campaign/update", {
        campaignId,
        ...updateData, // message, status, action, pmMessage, etc.
      });

      const updatedCampaign = response.data.data;

      set((state) => ({
        campaigns: state.campaigns.map((c) =>
          c._id === updatedCampaign._id ? updatedCampaign : c,
        ),
      }));
    } catch (error) {
      console.error("Update failed:", error);
    }
  },
});

const useCampaignStore = create(campaignStore)

export default useCampaignStore;