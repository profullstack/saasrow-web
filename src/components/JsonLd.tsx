// Emits a schema.org JSON-LD block.
//
// The payload is built server-side from our own database, never from user
// input rendered as markup, and `JSON.stringify` output is escaped below so a
// product name containing "</script>" can't break out of the tag.

export default function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
