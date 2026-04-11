import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx"; // You might need to comment this out too if it's not being used yet
import Login from "./pages/LoginPage";
import PPCDashboard from "./pages/PPCDashboard";
import PMDashboard from "./pages/PMDashboard";
import ManagerDashboard from "./pages/ManagerDashboard";
import ITDashboard from "./pages/ITDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Commenting out the incomplete routes for now to test Login */}
        <Route path="/ppc-dashboard" element={
          <ProtectedRoute allowedRoles={["ppc"]}>
            <PPCDashboard />
          </ProtectedRoute>
        }/>
        <Route path="/pm-dashboard" element={
          <ProtectedRoute allowedRoles={["process manager"]}>
            <PMDashboard />
          </ProtectedRoute>
        }/>
        <Route path="/manager-dashboard" element={
          <ProtectedRoute allowedRoles={["manager"]}>
            <ManagerDashboard />
          </ProtectedRoute>
        }/>
        <Route path="/it-dashboard" element={
          <ProtectedRoute allowedRoles={["it"]}>
            <ITDashboard />
          </ProtectedRoute>
        }/> 
       

        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;