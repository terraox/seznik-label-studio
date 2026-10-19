import { corsPreflight } from '@/lib/cors';
import { appLibrary } from '@/lib/library-app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS() {
  return corsPreflight();
}

export function GET(request: Request) {
  return appLibrary(request, 'template');
}
