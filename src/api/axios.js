import axios from "axios";

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1",
  timeout: 10000, // Maximum time for a request after this axios will throw timeout error
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Interceptors let us run a code before a request or response is sent
// Here it is used to add token as Authorization: Bearer <token> and return new config
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);
// Here 
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      console.error("Unauthorized");
      // optional: redirect to login
      // window.location.href = "/login";
    }

    if (status === 403) {
      console.error("Forbidden");
    }

    if (status === 500) {
      console.error("Server error");
    }

    return Promise.reject(error);
  }
);

export default api;