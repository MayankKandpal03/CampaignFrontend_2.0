import useCampaignStore from "../stores/useCampaignStore.js";
import useAuthStore from "../stores/useAuthStore.js";
import { useEffect, useState } from "react";

export default function PPCDashboard() {
    // Zustand state
    const campaigns = useCampaignStore(state => state.campaigns);
    const getCampaign = useCampaignStore(state => state.getCampaign);
    const createCampaign = useCampaignStore(state => state.createCampaign);
    const updateCampaign = useCampaignStore(state => state.updateCampaign);

    const logout = useAuthStore(state => state.logout);

    // Modal & Form State
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [formData, setFormData] = useState({ message: '', status: '', requestedAt: '' });

    useEffect(() => {
        getCampaign().catch((error) => {
            console.error("Failed to load campaigns on mount:", error);
        });
    }, [getCampaign]); 

    const handleLogout = (e) => {
        e.preventDefault();
        logout();
    };

    // Open popup and pre-fill with initial values
    const handleOpenPopup = (campaign) => {
        setSelectedCampaign(campaign);
        setFormData({
            message: campaign.message || '',
            status: campaign.status || 'transfer', // default or existing status
            // Use requestedAt (from your backend schema) or fallback to requestedDate from your table mapping
            requestedAt: campaign.requestedAt || campaign.requestedDate || '' 
        });
        setIsPopupOpen(true);
    };

    const handleClosePopup = () => {
        setIsPopupOpen(false);
        setSelectedCampaign(null);
    };

    // Handle the update submission
    const handleUpdateSubmit = async (e) => {
        e.preventDefault();
        if (!selectedCampaign) return;

        try {
            // Update values in backend & frontend via Zustand store
            await updateCampaign(selectedCampaign._id, formData);
            handleClosePopup(); // Close modal on success
        } catch (error) {
            console.error("Failed to update campaign", error);
            alert("Failed to update. Please check console.");
        }
    };

    return (
        <div className="ppcDashboard" style={{ position: 'relative' }}>
            <button onClick={handleLogout} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', cursor: 'pointer' }}>
                Logout
            </button>

            <table border="1" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ padding: '0.5rem' }}>Message</th>
                        <th style={{ padding: '0.5rem' }}>Status</th>
                        <th style={{ padding: '0.5rem' }}>Requested Date</th>
                        <th style={{ padding: '0.5rem' }}>Schedule Time</th>
                        <th style={{ padding: '0.5rem' }}>Action</th>
                    </tr>
                </thead>

                <tbody>
                    {Array.isArray(campaigns) && campaigns.length > 0 ? (
                        campaigns.map((campaign) => (
                            <tr key={campaign._id}>
                                <td style={{ padding: '0.5rem' }}>{campaign.message}</td>
                                <td style={{ padding: '0.5rem', color: campaign.status === 'cancel' ? 'red' : 'green' }}>
                                    {campaign.status}
                                </td>
                                {/* Depending on your exact data, you might render requestedAt instead of requestedDate */}
                                <td style={{ padding: '0.5rem' }}>{campaign.requestedDate || campaign.requestedAt}</td>
                                <td style={{ padding: '0.5rem' }}>{campaign.scheduleTime || campaign.scheduleAt}</td>
                                <td style={{ padding: '0.5rem' }}>
                                    <button 
                                        onClick={() => handleOpenPopup(campaign)}
                                        className="border hover:bg-amber-300"
                                        style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                                    >
                                        Update
                                    </button>
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '1rem' }}>No campaigns found.</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* --- UPDATE POPUP MODAL --- */}
            {isPopupOpen && selectedCampaign && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'white', padding: '2rem', borderRadius: '8px', width: '400px', maxWidth: '90%'
                    }}>
                        <h2 style={{ marginTop: 0 }}>Update Campaign</h2>
                        
                        <form onSubmit={handleUpdateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Status Selection */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <label style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Status</label>
                                <select 
                                    value={formData.status} 
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    style={{ padding: '0.5rem' }}
                                >
                                    <option value="transfer">Transfer</option>
                                    <option value="cancel">Cancel</option>
                                </select>
                            </div>

                            {/* Show details ONLY if status is 'transfer' */}
                            {formData.status === 'transfer' && (
                                <>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Message</label>
                                        <input 
                                            type="text" 
                                            value={formData.message} 
                                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                            style={{ padding: '0.5rem' }}
                                            required
                                        />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <label style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Requested Time/Date</label>
                                        <input 
                                            type="text" 
                                            value={formData.requestedAt} 
                                            onChange={(e) => setFormData({ ...formData, requestedAt: e.target.value })}
                                            style={{ padding: '0.5rem' }}
                                            placeholder="YYYY-MM-DD HH:MM"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                                <button type="button" onClick={handleClosePopup} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
                                    Close
                                </button>
                                <button type="submit" style={{ padding: '0.5rem 1rem', backgroundColor: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer', borderRadius: '4px' }}>
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}