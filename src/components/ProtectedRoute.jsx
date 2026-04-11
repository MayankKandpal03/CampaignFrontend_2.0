import { Navigate } from "react-router-dom";
import useAuthStore from "../stores/useAuthStore";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuth, role } = useAuthStore();
  
  if (!isAuth) return <Navigate to="/login" />;
  if (!allowedRoles.includes(role)) return <Navigate to="/login" />;
  
  return children;
};

export default ProtectedRoute; 