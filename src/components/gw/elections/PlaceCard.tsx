import { useState } from "react";

import { ProfileEditor } from "@/components/gw/elections/ProfileEditor";
import { placeRows } from "@/lib/area-indicators";
import { isEmptyProfile, languageNames, settlementName } from "@/lib/area-profile";
import type { AtlasArea, AtlasData } from "@/lib/atlas-view";

/** How a place lives: what was measured, and what the team knows about it. */
export function PlaceCard({
  d,
  area,
  canEdit,
}: {
  d: AtlasData;
  area: AtlasArea;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { mapped, rows, tag } = placeRows(d, area.key);
  const profile = d.profiles[area.key] ?? null;
  const empty = isEmptyProfile(profile);
  return (
    <section className="card" aria-labelledby="place-h">
      <div className="card-head">
        <h2 id="place-h">About this place</h2>
        {tag ? <span className="mono">{tag}</span> : null}
      </div>
      {mapped ? (
        <div className="f-rows">
          {rows.map((r) => (
            <div className="f-row" key={r.id}>
              <span>{r.label}</span>
              <b>
                {r.text ?? "not measured yet"}
                {r.vs ? <span className="place-vs">{r.vs}</span> : null}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <p className="f-note">There's no ward map for this place yet, so nothing is measured.</p>
      )}
      <div className="place-profile">
        <h3>Your team's profile</h3>
        {editing ? (
          <ProfileEditor area={area} profile={profile} onDone={() => setEditing(false)} />
        ) : empty ? (
          <p className="f-note">
            Not filled in yet. Your team knows this place: add how it lives, who lives here and who
            it listens to.
          </p>
        ) : (
          <dl className="place-dl">
            {profile?.settlement ? (
              <>
                <dt>Settlement</dt>
                <dd>{settlementName(profile.settlement)}</dd>
              </>
            ) : null}
            {profile?.communities ? (
              <>
                <dt>Communities</dt>
                <dd>{profile.communities}</dd>
              </>
            ) : null}
            {profile?.languages.length ? (
              <>
                <dt>Languages</dt>
                <dd>{languageNames(profile.languages)}</dd>
              </>
            ) : null}
            {profile?.institutions ? (
              <>
                <dt>Institutions and influencers</dt>
                <dd>{profile.institutions}</dd>
              </>
            ) : null}
            {profile?.issues ? (
              <>
                <dt>Local issues</dt>
                <dd>{profile.issues}</dd>
              </>
            ) : null}
          </dl>
        )}
        {!editing && profile?.updatedAt ? (
          <p className="meta">
            Updated{" "}
            {new Date(profile.updatedAt).toLocaleDateString("en-KE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {profile.updatedBy ? ` by ${profile.updatedBy}` : ""}
          </p>
        ) : null}
        {!editing && canEdit ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            {empty ? "Add a profile" : "Edit the profile"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
