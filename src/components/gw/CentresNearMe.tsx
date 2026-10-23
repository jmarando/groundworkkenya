// "Polling centres near me" on the field page: the centres on the map within 2 km of the phone,
// nearest first, and the centres of the ward the phone is in that aren't on the map yet. "I'm
// here" sends the phone's position: the database makes it the centre's when it is good to 50 m
// and near the ward, and otherwise keeps it for an organiser. It needs signal, and the phone's
// position is watched only once it is asked for.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { WardsGeo } from "@/components/gw/voters/VotersCanvas";
import { useFix } from "@/hooks/useDoorPlace";
import { useOnline } from "@/hooks/useOnline";
import { centresNear, hereMessage, HERE_ACCURACY_M, NEAR_M, type Centre } from "@/lib/centres";
import { confirmCentreHere, getCentres } from "@/lib/centres.functions";
import { wardAt, wardShapes } from "@/lib/geo";
import { getJson } from "@/lib/geo-files";
import { getMapConfig } from "@/lib/map.functions";
import { mapAreaFor } from "@/lib/map-areas";
import { nf } from "@/lib/format";

export function CentresNearMe({ wards }: { wards: { id: string; slug: string; name: string }[] }) {
  const online = useOnline();
  const [asked, setAsked] = useState(false);
  if (!online) return <p className="f-note">This needs signal.</p>;
  if (!asked)
    return (
      <>
        <p className="meta">
          Standing at a polling centre? Say so, and the map learns where it is. Your phone's
          position is used only while this is open.
        </p>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setAsked(true)}>
          Find the centres near me
        </button>
      </>
    );
  return <Near wards={wards} />;
}

function Near({ wards }: { wards: { id: string; slug: string; name: string }[] }) {
  const geo = useFix();
  const queryClient = useQueryClient();
  const fetchCentres = useServerFn(getCentres);
  const fetchConfig = useServerFn(getMapConfig);
  const confirm = useServerFn(confirmCentreHere);
  const [note, setNote] = useState<{ name: string; text: string } | null>(null);

  const { data: centres } = useQuery({
    queryKey: ["centres"],
    queryFn: () => fetchCentres(),
    staleTime: 60_000,
  });
  const { data: config } = useQuery({
    queryKey: ["map-config"],
    queryFn: () => fetchConfig(),
    staleTime: Infinity,
  });
  const mapArea = mapAreaFor(config?.mapArea);
  // The ward the phone is in tells which centres not on the map yet are likely to be the one it is at.
  const { data: outlines } = useQuery({
    queryKey: ["geo", mapArea?.id, "wards"],
    queryFn: () => getJson<WardsGeo>(mapArea!.wards),
    enabled: Boolean(mapArea),
    staleTime: Infinity,
  });
  const shapes = useMemo(() => (outlines ? wardShapes(outlines) : []), [outlines]);

  const fix = geo.fix;
  const slug = fix ? (wardAt([fix.lng, fix.lat], shapes)?.slug ?? null) : null;
  const ward = slug ? (wards.find((w) => w.slug === slug) ?? null) : null;
  const found = useMemo(
    () => (fix && centres ? centresNear(centres, [fix.lng, fix.lat], ward?.id ?? null) : null),
    // The fix object changes with each reading; its position is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [centres, fix?.lng, fix?.lat, ward?.id],
  );

  const here = useMutation({
    mutationFn: (c: Centre) => {
      if (!fix) throw new Error("Still finding your position.");
      return confirm({ data: { id: c.id, lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracy } });
    },
    onSuccess: async (result, c) => {
      const text = hereMessage(result, fix?.accuracy ?? null);
      setNote({ name: c.name, text });
      if (result.moved) toast.success(`${c.name} is on the map.`);
      await queryClient.invalidateQueries({ queryKey: ["centres"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (geo.status === "off")
    return (
      <p className="f-note">
        The phone's location is off for this page. Allow it in the browser's settings to find the
        centres near you.
      </p>
    );
  if (geo.status === "none")
    return (
      <p className="f-note">This phone can't say where it is, so it can't find the centres.</p>
    );
  if (!fix)
    return (
      <p className="f-note">
        Finding your position…
        {geo.slow ? " This is taking a while: go outside, or near a window." : ""}
      </p>
    );
  if (centres === undefined) return <p className="f-note">Reading the polling centres…</p>;
  if (centres === null)
    return (
      <p className="f-note">
        The polling centres aren't in yet: they appear once the database update is applied.
      </p>
    );

  const row = (c: Centre, sub: string) => (
    <div className="vnext-row" key={c.id}>
      <div className="vnext-what">
        <b>{c.name}</b>
        <span className="meta">
          {sub} · {nf.format(c.voters)} registered {c.voters === 1 ? "voter" : "voters"}
          {c.placed?.by === "osm-close" ? " · position not confirmed yet" : ""}
        </span>
      </div>
      <button
        type="button"
        className="btn btn--primary btn--sm"
        disabled={here.isPending}
        onClick={() => here.mutate(c)}
      >
        {here.isPending && here.variables?.id === c.id ? "Sending…" : "I'm here"}
      </button>
    </div>
  );

  return (
    <>
      <p
        className={
          fix.accuracy !== null && fix.accuracy > HERE_ACCURACY_M ? "f-note f-err" : "f-note"
        }
      >
        {fix.accuracy === null
          ? "Your position was found, but the phone doesn't say how sure it is."
          : `Your position is good to ${Math.round(fix.accuracy)} m.`}
        {fix.accuracy !== null && fix.accuracy > HERE_ACCURACY_M
          ? ` A centre needs ${HERE_ACCURACY_M} m or better: move into the open and wait for a sharper one.`
          : ""}
      </p>
      {note ? (
        <p className="vhouse-note" role="status">
          <b>{note.name}</b> · {note.text}
        </p>
      ) : null}
      <div className="vcentres">
        {found?.near.length ? (
          found.near.map((n) => row(n.centre, `${nf.format(n.metres)} m away`))
        ) : (
          <p className="meta">
            No polling centres on the map within {nf.format(NEAR_M / 1000)} km of you yet.
          </p>
        )}
        {found?.waiting.length ? (
          <>
            <h3>{ward ? `In ${ward.name}, not on the map yet` : "Not on the map yet"}</h3>
            {found.waiting.map((c) => row(c, "Not on the map yet"))}
          </>
        ) : null}
      </div>
    </>
  );
}
