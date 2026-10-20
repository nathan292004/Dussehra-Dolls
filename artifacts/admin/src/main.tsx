import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installAdminFetch } from "./lib/admin-session";

installAdminFetch();

createRoot(document.getElementById("root")!).render(<App />);
