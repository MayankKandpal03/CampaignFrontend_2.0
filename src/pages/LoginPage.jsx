import api from "../api/axios.js";
import useAuthStore from "../stores/useAuthStore.js";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
export default function Login() {
  // Import store and create instances
  const setUser = useAuthStore((state) => state.setUser);

  // Use State
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const navigate = useNavigate();
  // Handle input
  const handleInput = (e) => {
    setFormData((curr) => ({ ...curr, [e.target.name]: e.target.value }));
  };

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validators

    try {
      const response = await api.post("/login", formData);
      const { user } = response.data;
      setUser(user); // store user in zustand

      // Define routes for each user
      const routes = {
        ppc: "/ppc-dashboard",
        manager: "/manager-dashboard",
        "process manager": "/pm-dashboard",
        it: "/it-dashboard",
      };

      navigate(routes[user.role] || "/login");
    } catch (error) {
      console.error("Login failed:", error);
    }
  };
  return (
    <div className="Login">
        <form action="">
            <input className="border-2" type="text" name="email" id="email" value={formData.email} onChange={handleInput}/>
            <input className="border-2" type="password" name="password" id="password" value={formData.password} onChange={handleInput}/>
            <button type="submit" onSubmit={handleSubmit}>Submit</button>
        </form>
    </div>
  );
}
