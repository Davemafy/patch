import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

if (!convexUrl) {
  root.render(
    <StrictMode>
      <main className="setup-screen">
        <div className="brand">Patch<span>.</span></div>
        <div>
          <p className="eyebrow">Setup needed</p>
          <h1>This build isn't connected yet.</h1>
          <p>Add <code>VITE_CONVEX_URL</code> or deploy with <code>npm run deploy</code>.</p>
        </div>
      </main>
    </StrictMode>,
  );
} else {
  const client = new ConvexReactClient(convexUrl);
  root.render(
    <StrictMode>
      <ConvexProvider client={client}>
        <App />
      </ConvexProvider>
    </StrictMode>,
  );
}
