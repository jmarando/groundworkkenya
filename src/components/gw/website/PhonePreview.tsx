// The site as a visitor's phone shows it, drawn by the same renderer as the
// public page. The frame runs no scripts, and it keeps its scroll position as
// the page is redrawn, so typing in the editor does not throw the preview
// back to the top.

import { useEffect, useRef, useState } from "react";

export function PhonePreview({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef(0);
  // Redraw a moment after typing stops, not on every key.
  const [shown, setShown] = useState(html);
  useEffect(() => {
    const t = setTimeout(() => {
      scroll.current = frame.current?.contentWindow?.scrollY ?? scroll.current;
      setShown(html);
    }, 250);
    return () => clearTimeout(t);
  }, [html]);

  return (
    <div className="ws-phone">
      <iframe
        ref={frame}
        title="Phone preview of the website"
        // Same origin only so the scroll position can be kept; scripts stay off.
        sandbox="allow-same-origin"
        srcDoc={shown}
        onLoad={() => frame.current?.contentWindow?.scrollTo(0, scroll.current)}
      />
    </div>
  );
}
