export const SITE = "https://groundwork.ke";
export const SOCIAL_CARD = `${SITE}/brand/groundwork-social-card.png`;

/** schema.org FAQPage for a list of questions: the page must show the same questions and answers. */
export const faqNode = (items: { q: string; a: string }[]) => ({
  "@type": "FAQPage",
  mainEntity: items.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

type PageHeadInput = {
  path: string;
  /** The page's name in the breadcrumb: Groundwork > crumb. */
  crumb: string;
  title: string;
  description: string;
  /** Further schema.org nodes for the page, such as its FAQPage. */
  nodes?: object[];
};

/** The head of a public page: title, description, canonical, share cards and its structured data. */
export function pageHead({ path, crumb, title, description, nodes = [] }: PageHeadInput) {
  const url = `${SITE}${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:site_name", content: "Groundwork" },
      { property: "og:locale", content: "en_KE" },
      { property: "og:image", content: SOCIAL_CARD },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Groundwork, the campaign OS" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: SOCIAL_CARD },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": `${url}#webpage`,
              url,
              name: title,
              description,
              inLanguage: "en",
              isPartOf: { "@id": `${SITE}/#website` },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Groundwork", item: `${SITE}/` },
                { "@type": "ListItem", position: 2, name: crumb, item: url },
              ],
            },
            ...nodes,
          ],
        },
      },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
