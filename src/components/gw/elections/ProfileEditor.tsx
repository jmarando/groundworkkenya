import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  LANGUAGES,
  PROFILE_LIMITS,
  SETTLEMENTS,
  type AreaProfile,
  type Language,
  type Settlement,
} from "@/lib/area-profile";
import { saveProfile } from "@/lib/atlas.functions";
import type { AtlasArea } from "@/lib/atlas-view";

/** The team's profile of a place, edited: a refusal shows here, in the form. */
export function ProfileEditor({
  area,
  profile,
  onDone,
}: {
  area: AtlasArea;
  profile: AreaProfile | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveProfile);
  const [settlement, setSettlement] = useState<Settlement | "">(profile?.settlement ?? "");
  const [languages, setLanguages] = useState<Language[]>(profile?.languages ?? []);
  const [communities, setCommunities] = useState(profile?.communities ?? "");
  const [institutions, setInstitutions] = useState(profile?.institutions ?? "");
  const [issues, setIssues] = useState(profile?.issues ?? "");
  const saving = useMutation({
    mutationFn: () =>
      save({
        data: {
          area: area.key,
          settlement: settlement || null,
          languages,
          communities,
          institutions,
          issues,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["atlas"] });
      toast.success("Profile saved.");
      onDone();
    },
  });
  const box = (
    id: keyof typeof PROFILE_LIMITS,
    label: string,
    value: string,
    set: (v: string) => void,
  ) => (
    <label className="place-box" htmlFor={`place-${id}`}>
      <span>{label}</span>
      <textarea
        id={`place-${id}`}
        rows={3}
        maxLength={PROFILE_LIMITS[id]}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      <span className="place-count">
        {value.length} / {PROFILE_LIMITS[id].toLocaleString("en-KE")}
      </span>
    </label>
  );
  return (
    <form
      className="place-edit"
      onSubmit={(e) => {
        e.preventDefault();
        saving.mutate();
      }}
    >
      <p className="f-note">About the place, never about a person. Don't record anyone's tribe.</p>
      <label className="place-box" htmlFor="place-settlement">
        <span>Settlement type</span>
        <select
          id="place-settlement"
          value={settlement}
          onChange={(e) => setSettlement(e.target.value as Settlement | "")}
        >
          <option value="">Not set</option>
          {SETTLEMENTS.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="place-langs">
        <legend>Languages commonly used</legend>
        {LANGUAGES.map(([id, name]) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={languages.includes(id)}
              onChange={(e) =>
                setLanguages(
                  e.target.checked ? [...languages, id] : languages.filter((l) => l !== id),
                )
              }
            />{" "}
            {name}
          </label>
        ))}
      </fieldset>
      {box("communities", "Communities in the area", communities, setCommunities)}
      {box("institutions", "Institutions and influencers", institutions, setInstitutions)}
      {box("issues", "Local issues", issues, setIssues)}
      {saving.error ? (
        <p className="place-error" role="alert">
          {(saving.error as Error).message}
        </p>
      ) : null}
      <div className="mb-actions">
        <button type="submit" className="btn btn--primary btn--sm" disabled={saving.isPending}>
          {saving.isPending ? "Saving…" : "Save profile"}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
