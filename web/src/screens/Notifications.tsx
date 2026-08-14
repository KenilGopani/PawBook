/**
 * Activity — the notifications table, which is written by almost
 * every other Edge Function (friend requests, RSVPs, comments,
 * alerts) and streamed to the client over Supabase Realtime.
 *
 * The device-registration card at the top is the web stand-in for
 * what iOS does on launch: hand APNs a device token via
 * register-device-token so pushes can actually be delivered.
 */

import { useEffect, useState } from "react";
import {
  Bell, BellRing, CalendarHeart, Check, MessageCircle, ShieldAlert,
  Smartphone, UserPlus,
} from "lucide-react";
import * as api from "../lib/api";
import { cn, timeAgo } from "../lib/cn";
import { useStore } from "../lib/store";
import type { AppNotification } from "../lib/types";
import {
  Chip, EmptyState, Glass, GlassButton, SectionTitle, Skeleton,
} from "../components/glass";
import { AnimatedGroup } from "../components/motion";

const META: Record<
  string,
  { icon: typeof Bell; tone: string; title: (p: Record<string, unknown>) => string }
> = {
  FRIEND_REQUEST: {
    icon: UserPlus, tone: "bg-grape-400/20 text-grape-500",
    title: (p) => `${p.from_pet_name ?? "A pet"} wants to be friends`,
  },
  MEETUP_REQUEST: {
    icon: CalendarHeart, tone: "bg-mint-400/20 text-mint-500",
    title: (p) => `Invited to "${p.meetup_title ?? "a meetup"}"`,
  },
  MEETUP_RSVP: {
    icon: CalendarHeart, tone: "bg-mint-400/20 text-mint-500",
    title: (p) => `${p.pet_name ?? "Someone"} is coming to "${p.meetup_title ?? "your meetup"}"`,
  },
  COMMENT: {
    icon: MessageCircle, tone: "bg-sky-400/20 text-sky-500",
    title: (p) => `${p.pet_name ?? "Someone"} commented on your post`,
  },
  LOST_PET_NEARBY: {
    icon: ShieldAlert, tone: "bg-rose-400/20 text-rose-500",
    title: (p) => `${p.pet_name ?? "A pet"} is missing nearby`,
  },
  COMMUNITY_ALERT: {
    icon: ShieldAlert, tone: "bg-rose-400/20 text-rose-500",
    title: (p) => String(p.description ?? "Safety alert nearby"),
  },
};

const FALLBACK = {
  icon: Bell, tone: "bg-[rgb(var(--glass-tint)/0.22)] t2",
  title: () => "New activity",
};

export function Notifications() {
  const { toast } = useStore();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    void api.getNotifications().then((n) => {
      setItems(n);
      setLoading(false);
    });
  }, []);

  const register = async () => {
    setRegistering(true);
    try {
      // A real iOS client hands over the APNs-issued token here; on
      // web we mint a placeholder so the round-trip is exercisable.
      await api.registerDeviceToken(crypto.randomUUID().replace(/-/g, ""));
      setRegistered(true);
      toast("Device registered for push", "success");
    } catch {
      toast("Could not register device", "error");
    } finally {
      setRegistering(false);
    }
  };

  const markRead = (id: string) =>
    setItems((n) => n.map((x) => (x.id === id ? { ...x, is_read: true } : x)));

  const unread = items.filter((i) => !i.is_read).length;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Activity"
        subtitle={
          unread ? `${unread} unread` : "Everything from the notifications table."
        }
        action={
          unread > 0 ? (
            <GlassButton
              size="sm"
              variant="ghost"
              onClick={() => setItems((n) => n.map((x) => ({ ...x, is_read: true })))}
              icon={<Check size={14} />}
            >
              Mark all read
            </GlassButton>
          ) : undefined
        }
      />

      {/* Push registration */}
      <Glass chroma className="flex items-center gap-3.5 p-4">
        <div
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-2xl transition",
            registered ? "bg-mint-400/20 text-mint-500" : "bg-brand-400/20 text-brand-500",
          )}
        >
          {registered ? <BellRing size={19} /> : <Smartphone size={19} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold t1">
            {registered ? "Push notifications on" : "Enable push notifications"}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed t3">
            {registered
              ? "This device is in device_push_tokens — lost-pet and safety alerts will reach it."
              : "Registers this device via register-device-token so APNs can deliver safety alerts."}
          </p>
        </div>
        {!registered && (
          <GlassButton
            size="sm"
            variant="primary"
            onClick={register}
            loading={registering}
          >
            Enable
          </GlassButton>
        )}
      </Glass>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : items.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<Bell size={22} />}
            title="Nothing yet"
            hint="Friend requests, RSVPs and alerts all land here."
          />
        </Glass>
      ) : (
        <AnimatedGroup preset="slide" className="space-y-2">
          {items.map((n) => {
            const meta = META[n.type] ?? FALLBACK;
            const Icon = meta.icon;
            return (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className="block w-full text-left"
              >
                <Glass
                  className={cn(
                    "flex items-center gap-3 p-3.5 transition",
                    !n.is_read && "ring-1 ring-brand-400/35",
                  )}
                >
                  <div
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      meta.tone,
                    )}
                  >
                    <Icon size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-[13.5px]",
                        n.is_read ? "t2" : "font-medium t1",
                      )}
                    >
                      {meta.title(n.payload)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11.5px] t3">
                      <span>{timeAgo(n.created_at)}</span>
                      <Chip tone="neutral" className="!py-0 !text-[9.5px]">
                        {n.type}
                      </Chip>
                    </p>
                  </div>
                  {!n.is_read && (
                    <span className="size-2 shrink-0 rounded-full bg-brand-500" />
                  )}
                </Glass>
              </button>
            );
          })}
        </AnimatedGroup>
      )}
    </div>
  );
}
