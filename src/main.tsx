import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import { applyPixelUi } from "./scene/pixel/pixel-settings";
import "./index.css";

applyPixelUi();
createRoot(document.getElementById("root")!).render(<App />);
