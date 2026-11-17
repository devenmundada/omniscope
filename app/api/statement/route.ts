import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import { AI_NOT_CONFIGURED_MESSAGE, aiErrorStatus, describeAiError, FALLBACK_MODEL_ID, isAiConfigured } from '@/lib/ai/model';
import { extractStatement } from '@/lib/ai/statement-reader';
import { logger } from '@/lib/logger';
import { burstLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ['pdf', 'application/pdf'],
  ['csv', 'text/csv'],
  ['txt', 'text/plain'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
]);

/**
 * AI Statement Reader: extracts holdings from an uploaded statement with Gemini and maps them to
 * the verified catalogue. Nothing is saved here; the user reviews rows and imports them through
 * the existing validated, transactional CSV import.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Authentication is not configured.' }, { status: 503 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 });
  if (burstLimit(`statement:${user.id}`, 6, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many statements in a few minutes. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': '600' } });
  }
  if (!isAiConfigured()) return NextResponse.json({ error: AI_NOT_CONFIGURED_MESSAGE }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Attach a statement file.' }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be between 1 byte and 4 MB.' }, { status: 400 });
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mediaType = ALLOWED.get(ext);
  if (!mediaType) return NextResponse.json({ error: 'Supported formats: PDF, CSV, TXT, PNG, JPG.' }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (mediaType === 'application/pdf' && new TextDecoder('latin1').decode(bytes.slice(0, 4096)).includes('/Encrypt')) {
    return NextResponse.json(
      { error: 'This PDF is password-protected. Open it, use "Print → Save as PDF" to save an unlocked copy, and upload that.' },
      { status: 400 }
    );
  }

  try {
    const result = await extractStatement({ bytes, mediaType, filename: file.name });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Statement extraction failed:', msg);
    // API failures (quota, overload, key) get Google's status; anything else means the document itself was unreadable.
    const friendly =
      aiErrorStatus(err) != null || /quota|exhausted/i.test(msg)
        ? describeAiError(err, FALLBACK_MODEL_ID)
        : 'The AI could not read this statement. Try a clearer PDF or a CSV export.';
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
