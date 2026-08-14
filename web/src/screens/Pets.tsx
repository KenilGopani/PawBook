/**
 * My pets — create-pet / update-pet / delete-pet.
 *
 * The pet is PawBook's primary identity, so this screen is closer
 * to "manage your accounts" than "manage your things".
 */

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { PawPrint, Pencil, Plus, Syringe, Trash2, X } from "lucide-react";
import * as api from "../lib/api";
import { SPECIES_EMOJI } from "../lib/mock";
import { cn, petAge } from "../lib/cn";
import { useStore } from "../lib/store";
import {
  SIZE_LIST, SPECIES_LIST, TEMPERAMENTS,
  type Pet, type PetSize, type Species, type Temperament,
} from "../lib/types";
import {
  Avatar, Chip, EmptyState, Glass, GlassButton, GlassInput, GlassSelect,
  GlassTextarea, SectionTitle, Skeleton,
} from "../components/glass";
import { AnimatedGroup, Tilt } from "../components/motion";

export function Pets() {
  const { pets, petsLoading, refreshPets, activePet, setActivePetId, toast } = useStore();
  const [editing, setEditing] = useState<Pet | "new" | null>(null);

  const remove = async (p: Pet) => {
    try {
      await api.deletePet(p.id);
      await refreshPets();
      toast(`${p.name} archived`, "success");
    } catch {
      toast("Could not delete", "error");
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="My pets"
        subtitle="Each pet is its own social identity — posts, friends and RSVPs all belong to a pet, not to you."
        action={
          <GlassButton
            variant="primary"
            size="sm"
            onClick={() => setEditing("new")}
            icon={<Plus size={15} />}
          >
            Add pet
          </GlassButton>
        }
      />

      {petsLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => <Skeleton key={i} className="h-52" />)}
        </div>
      ) : pets.length === 0 ? (
        <Glass>
          <EmptyState
            icon={<PawPrint size={22} />}
            title="No pets yet"
            hint="Add your first pet to start using PawBook."
          />
        </Glass>
      ) : (
        <AnimatedGroup preset="scale" itemClassName="h-full" className="grid gap-3 sm:grid-cols-2">
          {pets.map((p) => (
            <Tilt key={p.id} max={5} className="h-full">
              <Glass
                chroma={p.id === activePet?.id}
                className={cn(
                  "h-full p-4 transition",
                  p.id === activePet?.id && "ring-1 ring-brand-400/45",
                )}
              >
                <div className="flex items-start gap-3.5">
                  <Avatar
                    seed={p.id}
                    emoji={SPECIES_EMOJI[p.species] ?? "🐾"}
                    size={58}
                    ring={p.id === activePet?.id}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[17px] font-semibold t1">{p.name}</h3>
                      {p.id === activePet?.id && (
                        <Chip tone="brand" className="!py-0 !text-[10px]">active</Chip>
                      )}
                    </div>
                    <p className="text-[12.5px] t3">
                      {[p.breed, petAge(p.dob), p.size].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {p.is_vaccinated ? (
                        <Chip tone="mint"><Syringe size={11} /> Vaccinated</Chip>
                      ) : (
                        <Chip tone="rose"><Syringe size={11} /> No records</Chip>
                      )}
                    </div>
                  </div>
                </div>

                {p.bio && (
                  <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed t2">
                    {p.bio}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.temperament.map((t) => (
                    <Chip key={t} tone="grape">{t}</Chip>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  {p.id !== activePet?.id && (
                    <GlassButton
                      size="sm"
                      variant="glass"
                      className="flex-1"
                      onClick={() => setActivePetId(p.id)}
                    >
                      Post as {p.name}
                    </GlassButton>
                  )}
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(p)}
                    aria-label={`Edit ${p.name}`}
                  >
                    <Pencil size={14} />
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(p)}
                    aria-label={`Delete ${p.name}`}
                    className="!text-rose-500"
                  >
                    <Trash2 size={14} />
                  </GlassButton>
                </div>
              </Glass>
            </Tilt>
          ))}
        </AnimatedGroup>
      )}

      <AnimatePresence>
        {editing && (
          <PetSheet
            pet={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await refreshPets();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PetSheet({
  pet, onClose, onSaved,
}: {
  pet: Pet | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useStore();
  const [name, setName] = useState(pet?.name ?? "");
  const [species, setSpecies] = useState<Species>(pet?.species ?? "dog");
  const [breed, setBreed] = useState(pet?.breed ?? "");
  const [dob, setDob] = useState(pet?.dob ?? "");
  const [size, setSize] = useState<PetSize>(pet?.size ?? "medium");
  const [bio, setBio] = useState(pet?.bio ?? "");
  const [vax, setVax] = useState(pet?.is_vaccinated ?? false);
  const [temps, setTemps] = useState<Temperament[]>(pet?.temperament ?? []);
  const [saving, setSaving] = useState(false);

  const toggleTemp = (t: Temperament) =>
    setTemps((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const body = {
      name: name.trim(), species, breed: breed || null,
      dob: dob || null, size, bio: bio || null,
      is_vaccinated: vax, temperament: temps,
    };
    try {
      if (pet) await api.updatePet(pet.id, body);
      else await api.createPet(body);
      toast(pet ? "Pet updated" : `${name} added`, "success");
      onSaved();
    } catch {
      toast("Could not save", "error");
      setSaving(false);
    }
  };

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
        className="glass glass-specular glass-raised max-h-[92vh] w-full overflow-y-auto rounded-t-[26px] p-5 sm:max-w-[520px] sm:rounded-[var(--radius-glass)]"
      >
        <div className="mb-4 flex items-center gap-3">
          <Avatar seed={name || "new"} emoji={SPECIES_EMOJI[species]} size={44} />
          <h2 className="flex-1 text-[19px] font-semibold t1">
            {pet ? `Edit ${pet.name}` : "Add a pet"}
          </h2>
          <button onClick={onClose} className="t3 hover:t1" aria-label="Close">
            <X size={19} />
          </button>
        </div>

        <div className="space-y-3.5">
          <GlassInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mochi"
            maxLength={50}
          />

          <div className="grid grid-cols-2 gap-3">
            <GlassSelect
              label="Species"
              value={species}
              onChange={(e) => setSpecies(e.target.value as Species)}
            >
              {SPECIES_LIST.map((s) => (
                <option key={s} value={s}>
                  {SPECIES_EMOJI[s]} {s}
                </option>
              ))}
            </GlassSelect>
            <GlassSelect
              label="Size"
              value={size}
              onChange={(e) => setSize(e.target.value as PetSize)}
            >
              {SIZE_LIST.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </GlassSelect>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <GlassInput
              label="Breed"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              placeholder="Shiba Inu"
            />
            <GlassInput
              label="Date of birth"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
            />
          </div>

          <GlassTextarea
            label="Bio"
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Professional zoomie athlete…"
            maxLength={300}
          />

          <div>
            <span className="mb-2 block text-[13px] font-medium t2">Temperament</span>
            <div className="flex flex-wrap gap-1.5">
              {TEMPERAMENTS.map((t) => (
                <Chip
                  key={t}
                  active={temps.includes(t)}
                  onClick={() => toggleTemp(t)}
                >
                  {t}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] t3">
              Feeds the compatibility score used by discover-compatible.
            </p>
          </div>

          <button
            onClick={() => setVax((v) => !v)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-glass-sm)] bg-[rgb(var(--glass-tint)/0.18)] p-3 text-left"
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-full transition",
                vax ? "bg-mint-400/25 text-mint-500" : "bg-[rgb(var(--glass-tint)/0.2)] t3",
              )}
            >
              <Syringe size={16} />
            </span>
            <span className="flex-1">
              <span className="block text-[13.5px] font-medium t1">
                Vaccination records on file
              </span>
              <span className="block text-[12px] t3">
                Required by some meetups and places.
              </span>
            </span>
            <span
              className={cn(
                "relative h-6 w-11 rounded-full transition",
                vax ? "bg-mint-400" : "bg-[rgb(var(--glass-tint)/0.34)]",
              )}
            >
              <motion.span
                animate={{ x: vax ? 22 : 3 }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                className="absolute top-0.5 size-5 rounded-full bg-white shadow"
              />
            </span>
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <GlassButton variant="ghost" onClick={onClose} className="flex-1">
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={save}
            loading={saving}
            disabled={!name.trim()}
            className="flex-1"
          >
            {pet ? "Save changes" : "Add pet"}
          </GlassButton>
        </div>
      </motion.div>
    </motion.div>
  );
}
