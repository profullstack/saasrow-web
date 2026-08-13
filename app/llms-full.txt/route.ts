import { getAllApproved, recordAiRead } from '@/lib/distribution'
import { llmsFullTxt } from '@/lib/markdownExport'
import { textResponse } from '@/lib/publicApi'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const submissions = await getAllApproved()

    void recordAiRead({
      userAgent: req.headers.get('user-agent'),
      channel: 'llms_txt',
      path: '/llms-full.txt',
    })

    return textResponse(llmsFullTxt(submissions), { cacheSeconds: 3600 })
  } catch (error) {
    console.error('[llms-full.txt]', error)
    return textResponse('# SaaSRow\n\n> Directory temporarily unavailable.\n', {
      status: 503,
    })
  }
}
