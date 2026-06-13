'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ScreenHostApproveParticipant } from '../../../../../screens/customer-host-flows/ScreenHostApproveParticipant';
import { useSession } from '../../../../../hooks/useSession';
import { getSessionToken } from '../../../../../lib/storage';

/**
 * `/[slug]/host/approve/participant` · the host's full-screen view to
 * approve another customer's join request (System A · `session_participants`).
 *
 * Round 19 — built per user ask. Two ways to land here:
 *   1. Tap on the in-app banner ("X pessoa quer entrar") on the mesa home
 *   2. Tap on a push/system notification (cold open) — `?cold=1` skips the
 *      typewriter accent so the host doesn't watch animations after a
 *      conscious gesture.
 *
 * Auth gate: requires session token. The screen itself verifies the caller
 * is the host of the table; non-hosts get redirected back home.
 */
export default function HostApproveParticipantPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const slug = params?.slug ?? '';
  const skipTypewriter = search?.get('cold') === '1';
  const { sessionId } = useSession();

  useEffect(() => {
    if (!getSessionToken() && !sessionId) {
      router.replace(`/${slug}`);
    }
  }, [slug, sessionId, router]);

  return <ScreenHostApproveParticipant slug={slug} skipTypewriter={skipTypewriter} />;
}
