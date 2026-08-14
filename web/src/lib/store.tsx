/**
 * App-wide state: theme, the pet you're currently acting as, and
 * toasts.
 *
 * "Acting as a pet" is core to PawBook's model rather than a UI
 * nicety — the backend treats the *pet* as the social actor, so
 * posts, friend requests and RSVPs all need a pet_id, not just a
 * user id. The shell keeps one selected at all times.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import { getMyPets } from "./api";
import type { Pet } from "./types";

export type Theme = "light" | "dark";

interface Toast {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

interface Store {
  theme: Theme;
  toggleTheme: () => void;

  pets: Pet[];
  activePet: Pet | null;
  setActivePetId: (id: string) => void;
  refreshPets: () => Promise<void>;
  petsLoading: boolean;

  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("pawbook-theme") as Theme) ?? "dark",
  );
  const [pets, setPets] = useState<Pet[]>([]);
  const [petsLoading, setPetsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pawbook-theme", theme);
  }, [theme]);

  const refreshPets = useCallback(async () => {
    setPetsLoading(true);
    try {
      const p = await getMyPets();
      setPets(p);
      setActiveId((cur) => cur ?? p[0]?.id ?? null);
    } finally {
      setPetsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshPets(); }, [refreshPets]);

  const toast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const value = useMemo<Store>(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
      pets,
      petsLoading,
      activePet: pets.find((p) => p.id === activeId) ?? pets[0] ?? null,
      setActivePetId: setActiveId,
      refreshPets,
      toasts,
      toast,
    }),
    [theme, pets, petsLoading, activeId, refreshPets, toasts, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  return c;
}
