/**
 * Places — places-nearby / search-places / create-place /
 * review-place / place-social-proof.
 *
 * "Social proof" is the Neo4j bit: how many of *your* friends
 * have actually VISITED a place, which is a stronger signal than
 * a global star rating.
 */

import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { MapPin, Plus, Search, Star, TrendingUp, Users } from "lucide-react";
import * as api from "../lib/api";
import { SPECIES_EMOJI } from "../lib/mock";
import { cn } from "../lib/cn";
import { useStore } from "../lib/store";
import { PLACE_TAGS, PLACE_TYPES, type Pet, type Place } from "../lib/types";
import {
  Avatar, Chip, EmptyState, Glass, GlassButton, GlassInput, GlassSelect,
  GlassTextarea, SectionTitle, Skeleton,
} from "../components/glass";
import { AnimatedGroup, Tilt } from "../components/motion";
import { Sheet } from "./Meetups";

const TYPE_EMOJI: Record<string, string> = {
  park: "🌳", cafe: "☕️", trail: "🥾", beach: "🏖", vet: "🩺",
  groomer: "✂️", other: "📍",
};

export function Places() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<Place | null>(null);
  const [detail, setDetail] = useState<Place | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setPlaces(await api.getPlacesNearby());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(async () => {
      setPlaces(await api.searchPlaces(q.trim()));
    }, 320);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Places"
        subtitle="Parks, cafés and trails — ranked by how many of your friends actually go."
        action={
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => setCreating(true)}
            icon={<Plus size={15} />}
          >
            Add place
          </GlassButton>
        }
      />

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 t3"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search places…"
          className="glass w-full rounded-full py-3 pr-4 pl-11 text-sm t1 outline-none placeholder:text-[var(--text-3)] focus:ring-2 focus:ring-brand-400/30"
        />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : places.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<MapPin size={22} />}
            title="No places found"
            hint="Try a different search, or add one yourself."
          />
        </Glass>
      ) : (
        <AnimatedGroup preset="scale" itemClassName="h-full" className="grid gap-3 sm:grid-cols-2">
          {places.map((p) => (
            <Tilt key={p.id} max={5} className="h-full">
              <Glass className="h-full p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[rgb(var(--glass-tint)/0.22)] text-2xl">
                    {TYPE_EMOJI[p.type] ?? "📍"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-[15.5px] font-semibold t1">{p.name}</h3>
                      {p.is_verified && (
                        <span className="text-[11px] text-sky-500" title="Verified">✓</span>
                      )}
                    </div>
                    <p className="truncate text-[12px] t3">{p.address}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[12px]">
                      <span className="inline-flex items-center gap-1 font-medium text-brand-500">
                        <Star size={11} fill="currentColor" />
                        {p.avg_rating.toFixed(1)}
                        <span className="font-normal t3">({p.review_count})</span>
                      </span>
                      {p.distance_label && (
                        <span className="inline-flex items-center gap-1 t3">
                          <MapPin size={11} />
                          {p.distance_label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.tags.slice(0, 4).map((t) => (
                    <Chip key={t} tone="mint">{t}</Chip>
                  ))}
                </div>

                {/* Neo4j social proof */}
                <div className="mt-3 flex items-center gap-3 rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.14)] px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-[12px] t2">
                    <Users size={12} className="text-grape-500" />
                    <strong className="font-semibold t1">{p.friends_visited ?? 0}</strong>
                    friends visited
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] t2">
                    <TrendingUp size={12} className="text-mint-500" />
                    <strong className="font-semibold t1">{p.checkins_today ?? 0}</strong>
                    today
                  </span>
                </div>

                <div className="mt-3.5 flex gap-2">
                  <GlassButton
                    size="sm"
                    variant="glass"
                    className="flex-1"
                    onClick={() => setDetail(p)}
                  >
                    Who's here
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setReviewing(p)}
                    icon={<Star size={14} />}
                  >
                    Review
                  </GlassButton>
                </div>
              </Glass>
            </Tilt>
          ))}
        </AnimatedGroup>
      )}

      <AnimatePresence>
        {creating && (
          <CreatePlaceSheet
            onClose={() => setCreating(false)}
            onCreated={async () => { setCreating(false); await load(); }}
          />
        )}
        {reviewing && (
          <ReviewPlaceSheet
            place={reviewing}
            onClose={() => setReviewing(null)}
            onDone={async () => { setReviewing(null); await load(); }}
          />
        )}
        {detail && (
          <SocialProofSheet place={detail} onClose={() => setDetail(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function SocialProofSheet({
  place, onClose,
}: {
  place: Place;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<Pet[]>([]);
  const [checkins, setCheckins] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.getPlaceSocialProof(place.id).then((r) => {
      setFriends(r.friends);
      setCheckins(r.checkins_today);
      setLoading(false);
    });
  }, [place.id]);

  return (
    <Sheet title={place.name} onClose={onClose}>
      <p className="text-[13px] leading-relaxed t2">
        Pulled from Neo4j — which of your pets' friends have a{" "}
        <code className="font-mono text-[12px] t1">VISITED</code> edge to this place.
      </p>
      <div className="mt-4 space-y-2">
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)
        ) : friends.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title="No friends here yet" />
        ) : (
          friends.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.16)] p-2.5"
            >
              <Avatar seed={f.id} emoji={SPECIES_EMOJI[f.species]} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium t1">{f.name}</p>
                <p className="truncate text-[11.5px] t3">{f.breed}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-4 rounded-[var(--radius-glass-sm)] bg-mint-400/15 px-3.5 py-2.5 text-[12.5px] text-mint-500">
        <strong className="font-semibold">{checkins}</strong> check-ins today
      </div>
    </Sheet>
  );
}

function CreatePlaceSheet({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useStore();
  const [name, setName] = useState("");
  const [type, setType] = useState("park");
  const [address, setAddress] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.createPlace({ name: name.trim(), type, address, tags });
      toast("Place added", "success");
      onCreated();
    } catch {
      toast("Could not add place", "error");
      setSaving(false);
    }
  };

  return (
    <Sheet title="Add a place" onClose={onClose}>
      <div className="space-y-3.5">
        <GlassInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alamo Square Dog Run"
        />
        <div className="grid grid-cols-2 gap-3">
          <GlassSelect
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {PLACE_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_EMOJI[t]} {t}</option>
            ))}
          </GlassSelect>
          <GlassInput
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Steiner St"
          />
        </div>
        <div>
          <span className="mb-2 block text-[13px] font-medium t2">Amenities</span>
          <div className="flex flex-wrap gap-1.5">
            {PLACE_TAGS.map((t) => (
              <Chip
                key={t}
                active={tags.includes(t)}
                onClick={() =>
                  setTags((c) =>
                    c.includes(t) ? c.filter((x) => x !== t) : [...c, t],
                  )
                }
              >
                {t}
              </Chip>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <GlassButton variant="ghost" onClick={onClose} className="flex-1">
          Cancel
        </GlassButton>
        <GlassButton
          variant="primary"
          onClick={create}
          loading={saving}
          disabled={!name.trim()}
          className="flex-1"
        >
          Add place
        </GlassButton>
      </div>
    </Sheet>
  );
}

function ReviewPlaceSheet({
  place, onClose, onDone,
}: {
  place: Place;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useStore();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.reviewPlace(place.id, rating, body);
      toast("Review posted", "success");
      onDone();
    } catch {
      toast("Could not post review", "error");
      setSaving(false);
    }
  };

  return (
    <Sheet title={`Review ${place.name}`} onClose={onClose}>
      <div className="flex justify-center gap-2 py-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}>
            <Star
              size={30}
              className={cn("transition", n <= rating ? "text-brand-400" : "t3")}
              fill={n <= rating ? "currentColor" : "none"}
            />
          </button>
        ))}
      </div>
      <GlassTextarea
        label="Your review"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Great fencing, plenty of shade, water fountain works."
      />
      <div className="mt-5 flex gap-2">
        <GlassButton variant="ghost" onClick={onClose} className="flex-1">
          Cancel
        </GlassButton>
        <GlassButton
          variant="primary"
          onClick={submit}
          loading={saving}
          className="flex-1"
        >
          Post review
        </GlassButton>
      </div>
    </Sheet>
  );
}
