// A Google Alerts feed as Google sends it (Atom, HTML inside escaped once and
// quotes twice, links through Google's redirect), with one entry whose link is
// not a web page. Shared by the feed and sweep checks.

export const ALERT_XML = `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Google Alert - Nairobi water</title>
<entry><id>tag:google.com,2013:googlealerts/feed:1</id><title type="html">&lt;b&gt;Nairobi water&lt;/b&gt; rationing extended in Eastlands</title>
<link href="https://www.google.com/url?rct=j&amp;sa=t&amp;url=https://www.the-star.co.ke/news/2026-09-29-water/&amp;ct=ga&amp;cd=CAIyGjA&amp;usg=AOvVaw"></link>
<published>2026-09-29T08:00:00Z</published><content type="html">Residents of &lt;b&gt;Nairobi&lt;/b&gt; will wait &amp;quot;three more weeks&amp;quot;.</content></entry>
<entry><title type="html">A bad link</title><link href="javascript:alert(1)"></link><published>2026-09-29T09:00:00Z</published></entry>
</feed>`;
