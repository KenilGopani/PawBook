/**
 * Safety — lost pets and community alerts.
 *
 * This is the screen where the push-notification work is visible:
 * create-lost-pet-alert and create-community-alert both fan out
 * via the users_within_radius PostGIS RPC, write notification
 * rows, and then push to every registered device through APNs.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  BellRing, Eye, Megaphone, Radio, ShieldAlert, Siren, TriangleAlert,
} from "lucide-react";
import * as api from "../lib/api";
import { SPECIES_EMOJI } from "../lib/mock";
import { cn, timeAgo, timeUntil } from "../lib/cn";
import { useStore } from "../lib/store";
import {
  ALERT_TYPES, type AlertType, type CommunityAlert, type LostPetAlert,
} from "../lib/types";
import {
  Avatar, Chip, EmptyState, Glass, GlassButton, GlassInput, GlassSelect,
  GlassTextarea, SectionTitle, Skeleton,
} from "../components/glass";
import { AnimatedGroup, BorderTrail } from "../components/motion";
import { Sheet } from "./Meetups";

const ALERT_META: Record<AlertType, { emoji: string; label: string }> = {
  DANGEROUS_DOG: { emoji: "🐕‍🦺", label: "Dangerous dog" },
  WILDLIFE: { emoji: "🦊", label: "Wildlife" },
  THEFT: { emoji: "🚨", label: "Theft" },
  LOST_ITEM: { emoji: "🎒", label: "Lost item" },
  OTHER: { emoji: "⚠️", label: "Other" },
};

export function Alerts() {
  const [tab, setTab] = useState<"lost" | "community">("lost");
  const [lost, setLost] = useState<LostPetAlert[]>([]);
  const [community, setCommunity] = useState<CommunityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState<"lost" | "community" | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [l, c] = await Promise.all([
        api.getLostPetsNearby(),
        api.getCommunityAlerts(),
      ]);
      setLost(l);
      setCommunity(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Safety"
        subtitle="Geofenced alerts. Anything posted here pushes to every device inside the radius."
        action={
          <GlassButton
            variant="danger"
            size="sm"
            onClick={() => setComposing(tab)}
            icon={<Siren size={15} />}
          >
            Report
          </GlassButton>
        }
      />

      <div className="flex gap-2">
        {([
          { k: "lost", label: "Lost pets", icon: Radio, n: lost.length },
          { k: "community", label: "Community", icon: Megaphone, n: community.length },
        ] as const).map(({ k, label, icon: Icon, n }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "relative rounded-full px-4 py-2 text-[13px] font-medium transition",
              tab === k ? "t1" : "t3 hover:t2",
            )}
          >
            {tab === k && (
              <motion.span
                layoutId="alert-tab"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="glass absolute inset-0 rounded-full"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon size={13} />
              {label}
              {n > 0 && (
                <span className="rounded-full bg-rose-400/25 px-1.5 text-[10px] font-semibold text-rose-500">
                  {n}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : tab === "lost" ? (
        lost.length === 0 ? (
          <Glass>
            <EmptyState
              icon={<ShieldAlert size={22} />}
              title="No lost pets nearby"
              hint="Good news. This list is empty when everyone's home."
            />
          </Glass>
        ) : (
          <AnimatedGroup preset="slide" className="space-y-3">
            {lost.map((a) => (
              <LostCard key={a.id} alert={a} onChanged={load} />
            ))}
          </AnimatedGroup>
        )
      ) : community.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<Megaphone size={22} />}
            title="Nothing reported nearby"
            hint="Community alerts expire automatically, so this clears itself."
          />
        </Glass>
      ) : (
        <AnimatedGroup preset="slide" className="space-y-3">
          {community.map((a) => (
            <CommunityCard key={a.id} alert={a} />
          ))}
        </AnimatedGroup>
      )}

      <AnimatePresence>
        {composing === "lost" && (
          <LostSheet
            onClose={() => setComposing(null)}
            onDone={async () => { setComposing(null); await load(); }}
          />
        )}
        {composing === "community" && (
          <CommunitySheet
            onClose={() => setComposing(null)}
            onDone={async () => { setComposing(null); await load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LostCard({
  alert: a, onChanged,
}: {
  alert: LostPetAlert;
  onChanged: () => void;
}) {
  const { toast } = useStore();
  const [sending, setSending] = useState(false);

  const sighting = async () => {
    setSending(true);
    try {
      await api.reportSighting(a.id, "Spotted nearby");
      toast("Sighting reported — owner notified", "success");
      onChanged();
    } catch {
      toast("Could not report", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <Glass className="relative overflow-hidden p-4">
      <BorderTrail className="bg-rose-400/70" size={80} duration={6} />

      <div className="flex items-start gap-3.5">
        <div className="relative shrink-0">
          <Avatar
            seed={a.pet_id}
            emoji={SPECIES_EMOJI[a.pet?.species ?? "dog"] ?? "🐾"}
            size={56}
          />
          <span className="pulse-ring absolute inset-0 rounded-full border-2 border-rose-400" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16.5px] font-semibold t1">
              {a.pet?.name ?? "A pet"} is missing
            </h3>
            <Chip tone="rose">
              <Radio size={11} /> active
            </Chip>
          </div>
          <p className="text-[12.5px] t3">
            {a.pet?.breed} · last seen {timeAgo(a.last_seen_at)} · {a.distance_label}
          </p>

          {a.description && (
            <p className="mt-2.5 text-[13.5px] leading-relaxed t2">{a.description}</p>
          )}

          <div className="mt-3 rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.16)] px-3 py-2">
            <p className="text-[11px] tracking-wide t3 uppercase">Contact</p>
            <p className="mt-0.5 text-[13px] font-medium t1">{a.contact_info}</p>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <GlassButton
              size="sm"
              variant="primary"
              onClick={sighting}
              loading={sending}
              icon={<Eye size={14} />}
            >
              I've seen them
            </GlassButton>
            {!!a.sighting_count && (
              <Chip tone="mint">{a.sighting_count} sightings</Chip>
            )}
          </div>
        </div>
      </div>
    </Glass>
  );
}

function CommunityCard({ alert: a }: { alert: CommunityAlert }) {
  const meta = ALERT_META[a.alert_type];
  return (
    <Glass className="p-4">
      <div className="flex items-start gap-3.5">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-rose-400/18 text-2xl">
          {meta.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15.5px] font-semibold t1">{meta.label}</h3>
            <Chip tone="rose">{a.radius_km}km radius</Chip>
          </div>
          <p className="text-[12px] t3">
            {timeAgo(a.created_at)} · expires {timeUntil(a.expires_at)} · {a.distance_label}
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed t2">{a.description}</p>
        </div>
      </div>
    </Glass>
  );
}

function LostSheet({
  onClose, onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { pets, activePet, toast } = useStore();
  const [petId, setPetId] = useState(activePet?.id ?? "");
  const [desc, setDesc] = useState("");
  const [contact, setContact] = useState("");
  const [radius, setRadius] = useState(3);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!petId || desc.trim().length < 10 || !contact.trim()) return;
    setSaving(true);
    try {
      await api.createLostPetAlert({
        pet_id: petId,
        description: desc.trim(),
        contact_info: contact.trim(),
        notify_radius_km: radius,
      });
      toast("Alert sent to everyone nearby", "success");
      onDone();
    } catch {
      toast("Could not send alert", "error");
      setSaving(false);
    }
  };

  return (
    <Sheet title="Report a lost pet" onClose={onClose}>
      <div className="space-y-3.5">
        <GlassSelect
          label="Which pet?"
          value={petId}
          onChange={(e) => setPetId(e.target.value)}
        >
          {pets.map((p) => (
            <option key={p.id} value={p.id}>
              {SPECIES_EMOJI[p.species]} {p.name}
            </option>
          ))}
        </GlassSelect>

        <GlassTextarea
          label="What happened?"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Slipped out the back gate during the storm. Very shy — will freeze rather than run."
          maxLength={500}
        />

        <GlassInput
          label="Contact info"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com · 555-0142"
          maxLength={200}
        />

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[13px] font-medium t2">Notify radius</span>
            <span className="text-[13px] font-semibold text-brand-500">{radius} km</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-[var(--color-brand-500)]"
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-[var(--radius-glass-sm)] bg-brand-400/12 p-3">
          <BellRing size={15} className="mt-0.5 shrink-0 text-brand-500" />
          <p className="text-[12px] leading-relaxed t2">
            This pushes an APNs notification to every PawBook device within{" "}
            {radius} km — not just an in-app badge. Use it when the pet is
            genuinely missing.
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <GlassButton variant="ghost" onClick={onClose} className="flex-1">
          Cancel
        </GlassButton>
        <GlassButton
          variant="danger"
          onClick={submit}
          loading={saving}
          disabled={!petId || desc.trim().length < 10 || !contact.trim()}
          className="flex-1"
        >
          Send alert
        </GlassButton>
      </div>
    </Sheet>
  );
}

function CommunitySheet({
  onClose, onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useStore();
  const [type, setType] = useState<AlertType>("DANGEROUS_DOG");
  const [desc, setDesc] = useState("");
  const [radius, setRadius] = useState(2);
  const [hours, setHours] = useState(4);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (desc.trim().length < 10) return;
    setSaving(true);
    try {
      await api.createCommunityAlert({
        alert_type: type,
        description: desc.trim(),
        radius_km: radius,
        expires_hours: hours,
      });
      toast("Alert broadcast to the area", "success");
      onDone();
    } catch {
      toast("Could not send alert", "error");
      setSaving(false);
    }
  };

  return (
    <Sheet title="Report a hazard" onClose={onClose}>
      <div className="space-y-3.5">
        <div>
          <span className="mb-2 block text-[13px] font-medium t2">Type</span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {ALERT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  "flex items-center gap-2 rounded-[var(--radius-glass-sm)] p-2.5 text-left transition",
                  type === t
                    ? "bg-rose-400/20 ring-1 ring-rose-400/50"
                    : "bg-[rgb(var(--glass-tint)/0.16)] hover:bg-[rgb(var(--glass-tint)/0.26)]",
                )}
              >
                <span className="text-lg">{ALERT_META[t].emoji}</span>
                <span className="truncate text-[12px] font-medium t1">
                  {ALERT_META[t].label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <GlassTextarea
          label="What should people know?"
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Off-leash dog showing aggression near the north gate. Owner not present."
          maxLength={300}
        />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[13px] font-medium t2">Radius</span>
              <span className="text-[13px] font-semibold text-brand-500">{radius}km</span>
            </div>
            <input
              type="range" min={1} max={10} value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-full accent-[var(--color-brand-500)]"
            />
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[13px] font-medium t2">Expires in</span>
              <span className="text-[13px] font-semibold text-brand-500">{hours}h</span>
            </div>
            <input
              type="range" min={1} max={48} value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full accent-[var(--color-brand-500)]"
            />
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.16)] p-3">
          <TriangleAlert size={15} className="mt-0.5 shrink-0 t3" />
          <p className="text-[12px] leading-relaxed t2">
            Limited to 3 community alerts per 24 hours. A pg_cron job
            deactivates this automatically once it expires.
          </p>
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <GlassButton variant="ghost" onClick={onClose} className="flex-1">
          Cancel
        </GlassButton>
        <GlassButton
          variant="danger"
          onClick={submit}
          loading={saving}
          disabled={desc.trim().length < 10}
          className="flex-1"
        >
          Broadcast
        </GlassButton>
      </div>
    </Sheet>
  );
}
