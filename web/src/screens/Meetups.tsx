/**
 * Meetups — the lifecycle the whole product exists to serve.
 *
 *   create-meetup → invite → rsvp-meetup → schedule-meetup
 *     → complete-meetup (or pg_cron auto-completes 2h after start)
 *     → submit-meetup-review
 *
 * complete-meetup is the interesting one: it writes VISITED /
 * MET_AT edges into Neo4j, which is how the graph learns which
 * pets have actually met — feeding discover-compatible later.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  CalendarHeart, CalendarPlus, Check, CircleCheck, Clock, MapPin,
  Star, Users, X,
} from "lucide-react";
import * as api from "../lib/api";
import { SPECIES_EMOJI, mockOtherPets, mockPlaces } from "../lib/mock";
import { cn, timeUntil } from "../lib/cn";
import { useStore } from "../lib/store";
import type { Meetup, MeetupStatus } from "../lib/types";
import {
  Avatar, Chip, EmptyState, Glass, GlassButton, GlassInput, GlassSelect,
  GlassTextarea, SectionTitle, Skeleton,
} from "../components/glass";
import { AnimatedGroup } from "../components/motion";

const STATUS_STYLE: Record<MeetupStatus, { tone: string; label: string }> = {
  PENDING:   { tone: "bg-brand-400/20 text-brand-600 dark:text-brand-200", label: "Awaiting RSVPs" },
  ACCEPTED:  { tone: "bg-sky-400/20 text-sky-500", label: "Accepted" },
  SCHEDULED: { tone: "bg-mint-400/20 text-mint-500", label: "Scheduled" },
  COMPLETED: { tone: "bg-grape-400/20 text-grape-500", label: "Completed" },
  CANCELLED: { tone: "bg-rose-400/20 text-rose-500", label: "Cancelled" },
};

const LIFECYCLE: MeetupStatus[] = ["PENDING", "ACCEPTED", "SCHEDULED", "COMPLETED"];

export function Meetups() {
  const { activePet, toast } = useStore();
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [reviewing, setReviewing] = useState<Meetup | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setMeetups(await api.getMeetups());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const rsvp = async (m: Meetup, status: "ACCEPTED" | "DECLINED") => {
    if (!activePet) return;
    const mine = m.participants?.find((p) =>
      p.pet_id === activePet.id ? true : false,
    );
    const petId = mine?.pet_id ?? activePet.id;
    try {
      await api.rsvpMeetup(m.id, petId, status);
      toast(status === "ACCEPTED" ? "You're in" : "Declined", "success");
      await load();
    } catch {
      toast("RSVP failed", "error");
    }
  };

  const complete = async (m: Meetup) => {
    try {
      await api.completeMeetup(m.id);
      toast("Marked complete — graph updated", "success");
      await load();
    } catch {
      toast("Could not complete", "error");
    }
  };

  const cancel = async (m: Meetup) => {
    try {
      await api.cancelMeetup(m.id);
      toast("Meetup cancelled");
      await load();
    } catch {
      toast("Could not cancel", "error");
    }
  };

  const upcoming = meetups.filter(
    (m) => m.status !== "COMPLETED" && m.status !== "CANCELLED",
  );
  const past = meetups.filter(
    (m) => m.status === "COMPLETED" || m.status === "CANCELLED",
  );

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Meetups"
        subtitle="Real-world playdates. Everything else in PawBook exists to get you here."
        action={
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => setComposing(true)}
            icon={<CalendarPlus size={15} />}
          >
            Plan one
          </GlassButton>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : meetups.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<CalendarHeart size={22} />}
            title="No meetups yet"
            hint="Find a compatible pet in Discover, then plan a park run."
          />
        </Glass>
      ) : (
        <>
          {upcoming.length > 0 && (
            <AnimatedGroup preset="slide" className="space-y-3">
              {upcoming.map((m) => (
                <MeetupCard
                  key={m.id}
                  meetup={m}
                  onRsvp={rsvp}
                  onComplete={complete}
                  onCancel={cancel}
                  onReview={setReviewing}
                />
              ))}
            </AnimatedGroup>
          )}

          {past.length > 0 && (
            <>
              <SectionTitle title="Past" />
              <AnimatedGroup preset="fade" className="space-y-3">
                {past.map((m) => (
                  <MeetupCard
                    key={m.id}
                    meetup={m}
                    onRsvp={rsvp}
                    onComplete={complete}
                    onCancel={cancel}
                    onReview={setReviewing}
                  />
                ))}
              </AnimatedGroup>
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {composing && (
          <MeetupSheet
            onClose={() => setComposing(false)}
            onCreated={async () => { setComposing(false); await load(); }}
          />
        )}
        {reviewing && (
          <ReviewSheet
            meetup={reviewing}
            onClose={() => setReviewing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MeetupCard({
  meetup: m, onRsvp, onComplete, onCancel, onReview,
}: {
  meetup: Meetup;
  onRsvp: (m: Meetup, s: "ACCEPTED" | "DECLINED") => void;
  onComplete: (m: Meetup) => void;
  onCancel: (m: Meetup) => void;
  onReview: (m: Meetup) => void;
}) {
  const { activePet } = useStore();
  const style = STATUS_STYLE[m.status];
  const stageIdx = LIFECYCLE.indexOf(m.status);
  const accepted = m.participants?.filter((p) => p.rsvp_status === "ACCEPTED") ?? [];
  const myInvite = m.participants?.find(
    (p) => p.pet_id === activePet?.id && p.rsvp_status === "INVITED",
  );

  return (
    <Glass chroma={m.status === "SCHEDULED"} className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16.5px] font-semibold t1">{m.title}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                style.tone,
              )}
            >
              {style.label}
            </span>
            {m.is_group && <Chip tone="sky">group</Chip>}
          </div>

          {m.description && (
            <p className="mt-1.5 text-[13.5px] leading-relaxed t2">{m.description}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12.5px] t3">
            {m.place && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} className="text-sky-500" />
                {m.place.name}
              </span>
            )}
            {m.scheduled_at && (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} />
                {new Date(m.scheduled_at).toLocaleDateString(undefined, {
                  weekday: "short", month: "short", day: "numeric",
                })}
                {" · "}
                {timeUntil(m.scheduled_at)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users size={12} />
              {accepted.length}/{m.max_pets}
            </span>
          </div>
        </div>
      </div>

      {/* Lifecycle rail — makes the backend state machine legible */}
      {m.status !== "CANCELLED" && (
        <div className="mt-4 flex items-center gap-1.5">
          {LIFECYCLE.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-1.5">
              <div
                className={cn(
                  "h-1 flex-1 rounded-full transition",
                  i <= stageIdx
                    ? "bg-gradient-to-r from-brand-400 to-brand-500"
                    : "bg-[rgb(var(--glass-tint)/0.24)]",
                )}
              />
              {i === LIFECYCLE.length - 1 && i <= stageIdx && (
                <CircleCheck size={13} className="shrink-0 text-mint-500" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Participants */}
      {!!m.participants?.length && (
        <div className="mt-3.5 flex items-center gap-2">
          <div className="flex -space-x-2.5">
            {m.participants.slice(0, 6).map((p) => (
              <div
                key={p.id}
                title={`${p.pet?.name} · ${p.rsvp_status.toLowerCase()}`}
                className={cn(
                  "rounded-full ring-2",
                  p.rsvp_status === "ACCEPTED"
                    ? "ring-mint-400/70"
                    : p.rsvp_status === "DECLINED"
                      ? "opacity-40 ring-transparent"
                      : "ring-brand-400/50",
                )}
              >
                <Avatar
                  seed={p.pet_id}
                  emoji={SPECIES_EMOJI[p.pet?.species ?? "dog"] ?? "🐾"}
                  size={30}
                />
              </div>
            ))}
          </div>
          <span className="text-[12px] t3">
            {accepted.map((p) => p.pet?.name).filter(Boolean).join(", ") || "No RSVPs yet"}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        {myInvite && (
          <>
            <GlassButton
              size="sm"
              variant="success"
              onClick={() => onRsvp(m, "ACCEPTED")}
              icon={<Check size={14} />}
            >
              Accept
            </GlassButton>
            <GlassButton
              size="sm"
              variant="ghost"
              onClick={() => onRsvp(m, "DECLINED")}
            >
              Can't make it
            </GlassButton>
          </>
        )}
        {m.status === "SCHEDULED" && (
          <GlassButton
            size="sm"
            variant="glass"
            onClick={() => onComplete(m)}
            icon={<CircleCheck size={14} />}
          >
            Mark complete
          </GlassButton>
        )}
        {m.status === "COMPLETED" && (
          <GlassButton
            size="sm"
            variant="glass"
            onClick={() => onReview(m)}
            icon={<Star size={14} />}
          >
            Leave a review
          </GlassButton>
        )}
        {(m.status === "PENDING" || m.status === "ACCEPTED" || m.status === "SCHEDULED") && (
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() => onCancel(m)}
            className="!text-rose-500"
          >
            Cancel
          </GlassButton>
        )}
      </div>
    </Glass>
  );
}

function MeetupSheet({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { activePet, toast } = useStore();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [placeId, setPlaceId] = useState(mockPlaces[0]?.id ?? "");
  const [when, setWhen] = useState("");
  const [invited, setInvited] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setInvited((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const create = async () => {
    if (!title.trim() || !activePet || invited.length === 0) return;
    setSaving(true);
    try {
      await api.createMeetup({
        title: title.trim(),
        description: desc.trim(),
        organizer_pet_id: activePet.id,
        invited_pet_ids: invited,
        place_id: placeId || null,
        scheduled_at: when ? new Date(when).toISOString() : null,
        is_group: invited.length > 1,
        max_pets: 10,
      });
      toast("Meetup created — invites sent", "success");
      onCreated();
    } catch {
      toast("Could not create meetup", "error");
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="Plan a meetup">
      <div className="space-y-3.5">
        <GlassInput
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Saturday morning zoomies"
          maxLength={100}
        />
        <GlassTextarea
          label="Description"
          rows={2}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Usual crew, coffee after."
          maxLength={500}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <GlassSelect
            label="Place"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
          >
            <option value="">Custom location</option>
            {mockPlaces.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </GlassSelect>
          <GlassInput
            label="When"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>

        <div>
          <span className="mb-2 block text-[13px] font-medium t2">
            Invite pets {invited.length > 0 && `(${invited.length})`}
          </span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {mockOtherPets.map((p) => {
              const on = invited.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--radius-glass-sm)] p-2 text-left transition",
                    on
                      ? "bg-brand-400/20 ring-1 ring-brand-400/50"
                      : "bg-[rgb(var(--glass-tint)/0.16)] hover:bg-[rgb(var(--glass-tint)/0.26)]",
                  )}
                >
                  <Avatar seed={p.id} emoji={SPECIES_EMOJI[p.species]} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium t1">{p.name}</p>
                    <p className="truncate text-[11px] t3">{p.breed}</p>
                  </div>
                  {on && <Check size={15} className="shrink-0 text-brand-500" />}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11.5px] t3">
            One invitee makes a 1-on-1 meetup; two or more makes it a group.
          </p>
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
          disabled={!title.trim() || invited.length === 0}
          className="flex-1"
        >
          Send invites
        </GlassButton>
      </div>
    </Sheet>
  );
}

function ReviewSheet({
  meetup, onClose,
}: {
  meetup: Meetup;
  onClose: () => void;
}) {
  const { toast } = useStore();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.submitMeetupReview(meetup.id, rating, body);
      toast("Review submitted — compatibility updated", "success");
      onClose();
    } catch {
      toast("Could not submit", "error");
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} title={`How was "${meetup.title}"?`}>
      <div className="flex justify-center gap-2 py-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <motion.button
            key={n}
            onClick={() => setRating(n)}
            whileTap={{ scale: 0.85 }}
            aria-label={`${n} stars`}
          >
            <Star
              size={32}
              className={cn(
                "transition",
                n <= rating ? "text-brand-400" : "t3",
              )}
              fill={n <= rating ? "currentColor" : "none"}
            />
          </motion.button>
        ))}
      </div>
      <GlassTextarea
        label="Notes"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Great energy match, would meet again."
      />
      <p className="mt-2 text-[11.5px] leading-relaxed t3">
        Reviews feed back into the Neo4j <code className="font-mono">FRIENDS_WITH.compatibility</code>{" "}
        score, so future matches get better.
      </p>
      <div className="mt-5 flex gap-2">
        <GlassButton variant="ghost" onClick={onClose} className="flex-1">
          Skip
        </GlassButton>
        <GlassButton
          variant="primary"
          onClick={submit}
          loading={saving}
          className="flex-1"
        >
          Submit
        </GlassButton>
      </div>
    </Sheet>
  );
}

/** Shared bottom-sheet / modal shell. */
export function Sheet({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-end bg-black/35 backdrop-blur-sm sm:place-items-center"
    >
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="glass glass-specular glass-raised max-h-[92vh] w-full overflow-y-auto rounded-t-[26px] p-5 sm:max-w-[540px] sm:rounded-[var(--radius-glass)]"
      >
        <div className="mb-4 flex items-center gap-3">
          <h2 className="flex-1 text-[19px] font-semibold t1">{title}</h2>
          <button onClick={onClose} className="t3 hover:t1" aria-label="Close">
            <X size={19} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
