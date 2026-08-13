import { vocabularyManifest } from '@/lib/vocab'
import { jsonResponse, corsPreflight } from '@/lib/publicApi'

// Static by nature — the vocabulary only changes when we ship a new build.
export const dynamic = 'force-static'

export function OPTIONS() {
  return corsPreflight()
}

export function GET() {
  return jsonResponse(
    {
      data: vocabularyManifest(),
      description:
        'Closed vocabularies accepted by the use_case, audience, platform and pricing_model filters on /api/v1/products.',
    },
    { cacheSeconds: 86400 },
  )
}
