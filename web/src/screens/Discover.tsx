/**
 * Discover — the Neo4j-backed half of the product.
 *
 * Three lenses on the same graph:
 *   nearby     → discover-nearby      (geo + graph)
 *   suggested  → discover-suggested   (friend-of-friend)
 *   compatible → discover-compatible  (computeCompatibility scoring)
 *
 * Plus the inbound friend-request queue, which is where
 * accept/decline-friend-request get exercised.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  Check, MapPin, Radar, Sparkles, UserPlus, Users, X,
} from "lucide-react";
import * as api from "../lib/api";
import { SPECIES_EMOJI } from "../lib/mock";
import { cn, petAge } from "../lib/cn";
import { useStore } from "../lib/store";
import type { Pet, PetRelationship } from "../lib/types";
import {
  Avatar, Chip, EmptyState, Glass, GlassButton, SectionTitle, Skeleton,
} from "../components/glass";
import { AnimatedGroup, Tilt } from "../components/motion";

type Lens = "compatible" | "nearby" | "suggested";

const LENSES: { key: Lens; label: string; icon: typeof Radar; hint: string }[] = [
  { key: "compatible", label: "Best match", icon: Sparkles, hint: "Scored on temperament, size, species and vaccination status." },
  { key: "nearby", label: "Nearby", icon: Radar, hint: "Pets within range of your last shared location." },
  { key: "suggested", label: "Friends of friends", icon: Users, hint: "Reached through pets your pets already know." },
];

export function Discover() {
  const { activePet, toast } = useStore();
  const [lens, setLens] = useState<Lens>("compatible");
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<PetRelationship[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const load = async (l: Lens) => {
    setLoading(true);
    try {
      const fn =
        l === "nearby" ? api.discoverNearby
        : l === "suggested" ? api.discoverSuggested
        : api.discoverCompatible;
      setPets(await fn());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(lens); }, [lens]);

  useEffect(() => {
    void api
      .getRelationships()
      .then((r) => setRequests(r.filter((x) => x.rel_type === "FRIEND_REQ" && x.from_pet)));
  }, []);

  const request = async (pet: Pet) => {
    if (!activePet) return;
    setSent((s) => new Set(s).add(pet.id));
    try {
      await api.sendFriendRequest(activePet.id, pet.id);
      toast(`Request sent to ${pet.name}`, "success");
    } catch {
      setSent((s) => { const n = new Set(s); n.delete(pet.id); return n; });
      toast("Request failed", "error");
    }
  };

  const respond = async (rel: PetRelationship, accept: boolean) => {
    setRequests((r) => r.filter((x) => x.id !== rel.id));
    try {
      if (accept) {
        await api.acceptFriendRequest(rel.id);
        toast(`${rel.from_pet?.name} is now a friend`, "success");
      } else {
        await api.declineFriendRequest(rel.id);
        toast("Request declined");
      }
    } catch {
      toast("Something went wrong", "error");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[27px] font-semibold tracking-[-0.025em] t1">Discover</h1>
        <p className="mt-1 text-sm t3">
          {LENSES.find((l) => l.key === lens)!.hint}
        </p>
      </div>

      {/* Inbound requests */}
      <AnimatePresence>
        {requests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <SectionTitle
              title="Friend requests"
              subtitle={`${requests.length} waiting on you`}
            />
            <div className="space-y-2">
              {requests.map((r) => (
                <Glass key={r.id} chroma className="flex items-center gap-3 p-3.5">
                  <Avatar
                    seed={r.from_pet_id}
                    emoji={SPECIES_EMOJI[r.from_pet?.species ?? "dog"] ?? "🐾"}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold t1">
                      {r.from_pet?.name}
                    </p>
                    <p className="truncate text-[12.5px] t3">
                      {r.from_pet?.breed} · {r.from_pet?.owner?.display_name}
                    </p>
                  </div>
                  <GlassButton
                    size="sm"
                    variant="success"
                    onClick={() => respond(r, true)}
                    icon={<Check size={14} />}
                  >
                    Accept
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={() => respond(r, false)}
                    aria-label="Decline"
                  >
                    <X size={15} />
                  </GlassButton>
                </Glass>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lens switcher */}
      <div className="flex flex-wrap gap-2">
        {LENSES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setLens(key)}
            className={cn(
              "relative rounded-full px-4 py-2 text-[13px] font-medium transition",
              lens === key ? "t1" : "t3 hover:t2",
            )}
          >
            {lens === key && (
              <motion.span
                layoutId="lens-pill"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="glass absolute inset-0 rounded-full"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon size={13} />
              {label}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : pets.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<Radar size={22} />}
            title="Nobody here yet"
            hint="Share your location to widen the search radius."
          />
        </Glass>
      ) : (
        <AnimatedGroup
          preset="scale"
          itemClassName="h-full"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {pets.map((p) => (
            <PetMatchCard
              key={p.id}
              pet={p}
              sent={sent.has(p.id)}
              onRequest={() => request(p)}
              showScore={lens === "compatible"}
            />
          ))}
        </AnimatedGroup>
      )}
    </div>
  );
}

function PetMatchCard({
  pet, sent, onRequest, showScore,
}: {
  pet: Pet;
  sent: boolean;
  onRequest: () => void;
  showScore: boolean;
}) {
  const score = pet.compatibility_score ?? 0;
  const tone =
    score >= 80 ? "text-mint-500" : score >= 55 ? "text-brand-500" : "t3";

  return (
    <Tilt max={6} className="h-full">
      <Glass chroma className="h-full p-4">
        <div className="flex items-start gap-3">
          <Avatar
            seed={pet.id}
            emoji={SPECIES_EMOJI[pet.species] ?? "🐾"}
            size={52}
            ring
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-[16px] font-semibold t1">{pet.name}</h3>
              {pet.is_vaccinated && (
                <span className="text-[11px] text-mint-500" title="Vaccinated">✓</span>
              )}
            </div>
            <p className="truncate text-[12.5px] t3">
              {[pet.breed, petAge(pet.dob)].filter(Boolean).join(" · ")}
            </p>
            {pet.distance_label && (
              <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-sky-500">
                <MapPin size={11} />
                {pet.distance_label}
              </p>
            )}
          </div>

          {showScore && (
            <div className="shrink-0 text-right">
              <div className={cn("text-[21px] font-semibold tabular-nums", tone)}>
                {score}
              </div>
              <div className="text-[10px] tracking-wide t3 uppercase">match</div>
            </div>
          )}
        </div>

        {pet.bio && (
          <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed t2">
            {pet.bio}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {pet.temperament.slice(0, 3).map((t) => (
            <Chip key={t} tone="grape">{t}</Chip>
          ))}
        </div>

        {showScore && !!pet.match_reasons?.length && (
          <ul className="mt-3 space-y-1 rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.14)] p-2.5">
            {pet.match_reasons.map((r) => (
              <li key={r} className="flex gap-1.5 text-[11.5px] leading-snug t2">
                <Sparkles size={11} className="mt-0.5 shrink-0 text-brand-400" />
                {r}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          <GlassButton
            size="sm"
            variant={sent ? "glass" : "primary"}
            onClick={onRequest}
            disabled={sent}
            className="flex-1"
            icon={sent ? <Check size={14} /> : <UserPlus size={14} />}
          >
            {sent ? "Requested" : "Add friend"}
          </GlassButton>
          {!!pet.mutual_friend_count && (
            <Chip tone="mint">
              <Users size={11} /> {pet.mutual_friend_count}
            </Chip>
          )}
        </div>
      </Glass>
    </Tilt>
  );
}
