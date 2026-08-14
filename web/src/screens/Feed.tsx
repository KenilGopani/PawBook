/**
 * Feed — get-feed (friends' posts) and get-explore (popular).
 * Composer hits create-post; reactions hit react-to-post.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  Bone, Heart, ImagePlus, MapPin, MessageCircle, PawPrint, Send, Sparkles,
} from "lucide-react";
import * as api from "../lib/api";
import { SPECIES_EMOJI } from "../lib/mock";
import { cn, timeAgo } from "../lib/cn";
import { useStore } from "../lib/store";
import type { Comment, Post, ReactionType } from "../lib/types";
import {
  Avatar, Chip, EmptyState, Glass, GlassButton, GlassTextarea, Skeleton,
} from "../components/glass";
import { AnimatedGroup, TextEffect } from "../components/motion";

const REACTIONS: { type: ReactionType; icon: typeof Heart; label: string }[] = [
  { type: "PAW", icon: PawPrint, label: "Paw" },
  { type: "BONE", icon: Bone, label: "Bone" },
  { type: "HEART", icon: Heart, label: "Heart" },
];

export function Feed() {
  const { activePet, toast } = useStore();
  const [tab, setTab] = useState<"feed" | "explore">("feed");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = async (which: "feed" | "explore") => {
    setLoading(true);
    try {
      setPosts(which === "feed" ? await api.getFeed() : await api.getExplore());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(tab); }, [tab]);

  const submit = async () => {
    if (!draft.trim() || !activePet) return;
    setPosting(true);
    try {
      const post = await api.createPost({
        pet_id: activePet.id,
        caption: draft.trim(),
        tags: [],
      });
      setPosts((p) => [post, ...p]);
      setDraft("");
      toast("Posted", "success");
    } catch {
      toast("Could not post", "error");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[27px] font-semibold tracking-[-0.025em] t1">
          <TextEffect>Good to see you</TextEffect>
        </h1>
        <p className="mt-1 text-sm t3">
          {tab === "feed"
            ? "Posts from pets your pets are friends with."
            : "What's popular across PawBook right now."}
        </p>
      </div>

      {/* Composer */}
      {activePet && (
        <Glass chroma className="p-4">
          <div className="flex gap-3">
            <Avatar
              seed={activePet.id}
              emoji={SPECIES_EMOJI[activePet.species] ?? "🐾"}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <GlassTextarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`What's ${activePet.name} up to?`}
                maxLength={500}
              />
              <div className="mt-2.5 flex items-center gap-2">
                <Chip tone="neutral">
                  <ImagePlus size={12} /> Media
                </Chip>
                <Chip tone="neutral">
                  <MapPin size={12} /> Place
                </Chip>
                <span className="flex-1" />
                <span className="text-[11px] t3">{draft.length}/500</span>
                <GlassButton
                  size="sm"
                  variant="primary"
                  onClick={submit}
                  loading={posting}
                  disabled={!draft.trim()}
                  icon={<Send size={14} />}
                >
                  Post
                </GlassButton>
              </div>
            </div>
          </div>
        </Glass>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {(["feed", "explore"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative rounded-full px-4 py-2 text-[13px] font-medium transition",
              tab === t ? "t1" : "t3 hover:t2",
            )}
          >
            {tab === t && (
              <motion.span
                layoutId="feed-tab"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="glass absolute inset-0 rounded-full"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {t === "explore" && <Sparkles size={13} />}
              {t === "feed" ? "Following" : "Explore"}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Glass key={i} className="p-4">
              <div className="flex gap-3">
                <Skeleton className="size-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            </Glass>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Glass className="p-2">
          <EmptyState
            icon={<PawPrint size={22} />}
            title="No posts yet"
            hint="Make some pet friends and their posts will land here."
          />
        </Glass>
      ) : (
        <AnimatedGroup preset="blur" className="space-y-3">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </AnimatedGroup>
      )}
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  const { activePet, toast } = useStore();
  const [p, setP] = useState(post);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [loadingC, setLoadingC] = useState(false);

  const react = async (type: ReactionType) => {
    // Optimistic — the DB trigger is the source of truth, but the
    // UI shouldn't wait a round-trip to acknowledge a tap.
    setP((cur) => {
      const same = cur.my_reaction === type;
      return {
        ...cur,
        my_reaction: same ? null : type,
        like_count: same
          ? Math.max(0, cur.like_count - 1)
          : cur.my_reaction
            ? cur.like_count
            : cur.like_count + 1,
      };
    });
    try {
      await api.reactToPost(p.id, type);
    } catch {
      toast("Reaction failed", "error");
    }
  };

  const openComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      setLoadingC(true);
      try {
        setComments(await api.getComments(p.id));
      } finally {
        setLoadingC(false);
      }
    }
  };

  const sendComment = async () => {
    if (!draft.trim() || !activePet) return;
    const body = draft.trim();
    setDraft("");
    try {
      const c = await api.addComment(p.id, activePet.id, body);
      setComments((cs) => [...cs, c]);
      setP((cur) => ({ ...cur, comment_count: cur.comment_count + 1 }));
    } catch {
      toast("Could not comment", "error");
    }
  };

  return (
    <Glass className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar
            seed={p.pet_id}
            emoji={SPECIES_EMOJI[p.pet?.species ?? "dog"] ?? "🐾"}
            size={42}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14.5px] font-semibold t1">
                {p.pet?.name ?? "Unknown"}
              </span>
              {p.pet?.is_vaccinated && (
                <span
                  className="text-[11px] text-mint-500"
                  title="Vaccination records on file"
                >
                  ✓
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[12px] t3">
              <span>{p.pet?.breed ?? p.pet?.species}</span>
              <span>·</span>
              <span>{timeAgo(p.created_at)}</span>
              {p.place_name && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-sky-500">
                    <MapPin size={10} />
                    {p.place_name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {p.caption && (
          <p className="mt-3 text-[14.5px] leading-relaxed t1">{p.caption}</p>
        )}

        {!!p.tags.length && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {p.tags.map((t) => (
              <Chip key={t} tone="sky">#{t}</Chip>
            ))}
          </div>
        )}

        <div className="mt-3.5 flex items-center gap-1">
          {REACTIONS.map(({ type, icon: Icon, label }) => {
            const on = p.my_reaction === type;
            return (
              <motion.button
                key={type}
                onClick={() => react(type)}
                whileTap={{ scale: 0.85 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                aria-label={label}
                className={cn(
                  "grid size-9 place-items-center rounded-full transition",
                  on
                    ? "bg-brand-400/25 text-brand-500"
                    : "t3 hover:bg-[rgb(var(--glass-tint)/0.2)] hover:t1",
                )}
              >
                <Icon size={16} fill={on ? "currentColor" : "none"} />
              </motion.button>
            );
          })}
          <span className="ml-1 text-[13px] font-medium t2">{p.like_count}</span>

          <button
            onClick={openComments}
            className="ml-3 flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] t3 transition hover:t1"
          >
            <MessageCircle size={15} />
            {p.comment_count}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t bg-[rgb(var(--glass-tint)/0.1)]"
          >
            <div className="space-y-3 p-4">
              {loadingC ? (
                <Skeleton className="h-10 w-full" />
              ) : comments.length === 0 ? (
                <p className="text-[13px] t3">No comments yet — say something.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <Avatar
                      seed={c.pet_id}
                      emoji={SPECIES_EMOJI[c.pet?.species ?? "dog"] ?? "🐾"}
                      size={28}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold t1">
                          {c.pet?.name}
                        </span>
                        <span className="text-[11px] t3">{timeAgo(c.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed t2">{c.body}</p>
                    </div>
                  </div>
                ))
              )}

              {activePet && (
                <div className="flex items-center gap-2 pt-1">
                  <Avatar
                    seed={activePet.id}
                    emoji={SPECIES_EMOJI[activePet.species] ?? "🐾"}
                    size={28}
                  />
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendComment()}
                    placeholder={`Reply as ${activePet.name}…`}
                    className="flex-1 rounded-full border bg-[rgb(var(--glass-tint)/0.2)] px-3.5 py-2 text-[13px] t1 outline-none placeholder:text-[var(--text-3)] focus:border-brand-400/60"
                  />
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={sendComment}
                    disabled={!draft.trim()}
                    aria-label="Send comment"
                  >
                    <Send size={14} />
                  </GlassButton>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Glass>
  );
}
