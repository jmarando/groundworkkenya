// Putting a polling centre on the map: the pin is dragged on the map (or the map tapped) to
// where the centre stands, and saved here. The database says who may, and how far from the
// ward is too far.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import type { Centre } from "@/lib/centres";
import { placeCentre } from "@/lib/centres.functions";
import type { LngLat } from "@/lib/geo";

export function PlaceIt({
  centre,
  at,
  onDone,
  onCancel,
}: {
  centre: Centre;
  /** Where the pin is now, [longitude, latitude]. */
  at: LngLat;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const place = useServerFn(placeCentre);
  const save = useMutation({
    mutationFn: () => place({ data: { id: centre.id, lat: at[1], lng: at[0] } }),
    onSuccess: async () => {
      toast.success(`${centre.name} is on the map.`);
      await queryClient.invalidateQueries({ queryKey: ["centres"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="vhouse" aria-label={`Place ${centre.name}`}>
      <div className="card-head">
        <div>
          <span className="eyebrow">
            {centre.placed ? "Move it" : "Place it"} · {centre.code}
          </span>
          <h2>{centre.name}</h2>
        </div>
      </div>
      <p className="meta">
        Drag the pin to where the centre stands, or tap the map to put it there. Zoom in to be sure,
        then save.
      </p>
      <div className="vhouse-actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save this position"}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={save.isPending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
