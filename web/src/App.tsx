import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ApiInspector, InspectorFab } from "./components/ApiInspector";
import { StoreProvider } from "./lib/store";
import { Alerts } from "./screens/Alerts";
import { Discover } from "./screens/Discover";
import { Feed } from "./screens/Feed";
import { Meetups } from "./screens/Meetups";
import { Notifications } from "./screens/Notifications";
import { Pets } from "./screens/Pets";
import { Places } from "./screens/Places";

export default function App() {
  const [inspector, setInspector] = useState(false);

  return (
    <StoreProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/pets" element={<Pets />} />
            <Route path="/meetups" element={<Meetups />} />
            <Route path="/places" element={<Places />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/notifications" element={<Notifications />} />
          </Routes>
        </AppShell>

        <InspectorFab open={inspector} onClick={() => setInspector(true)} />
        <ApiInspector open={inspector} onClose={() => setInspector(false)} />
      </BrowserRouter>
    </StoreProvider>
  );
}
