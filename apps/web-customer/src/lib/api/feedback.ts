import { apiPost, apiGet } from '../api';
import type {
  ComplaintCreateDto,
  ComplaintProblemType,
  OrderRatingSubmitDto,
  LgpdRequestKind,
  LgpdConsentMethod,
  LgpdRequestProtocolDto,
} from '@restaurant/shared-types';

// === Order rating ===

/** Server shape of `POST /:slug/order-ratings` (matches OrderRatingsService.submit). */
export interface OrderRatingSubmitResponse {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  savedAt: string;
  alreadyRated: boolean;
  /**
   * If non-null, FE should navigate the customer to the complaint composer.
   * `complaintId` is set only when the BE auto-created a complaint from a
   * <=2 rating with a non-empty comment.
   */
  redirectTo: string | null;
  complaintId: string | null;
}

/**
 * Submits the post-delivery rating (1-5 stars + optional comment).
 *
 * Idempotent at the BE (UNIQUE on order_id) — if already rated, returns
 * `alreadyRated=true` so the FE can show a friendly empty-state instead of
 * a 409 error.
 */
export function submitOrderRating(
  slug: string,
  body: OrderRatingSubmitDto & {
    orderId: string;
    customerId: string;
    visitId?: string;
  },
): Promise<OrderRatingSubmitResponse> {
  return apiPost<OrderRatingSubmitResponse>(`/${slug}/order-ratings`, body);
}

/** Read-only fetch of an existing rating (used when returning to the screen). */
export function getOrderRating(slug: string, orderId: string) {
  return apiGet<OrderRatingSubmitResponse>(`/${slug}/order-ratings/${orderId}`);
}

// === Complaints ===

/**
 * Server shape returned by `POST /:slug/complaints`. Mirrors
 * `ComplaintsService.create` row mapping.
 */
export interface ComplaintRecord {
  id: string;
  orderId: string | null;
  orderRatingId: string | null;
  customerId: string | null;
  visitId: string | null;
  rating: number | null;
  text: string;
  attachedImageUrl: string | null;
  status: 'created' | 'responded' | 'resolved' | 'pending_review' | 'in_progress' | 'closed';
  rawStatus?: string;
  assignedManagerId: string | null;
  responseText: string | null;
  responseAt: string | null;
  submittedAt: string;
  closedAt: string | null;
}

/**
 * Customer composer payload — superset of `ComplaintCreateDto` with the
 * extra session-derived fields the BE controller accepts. The `description`
 * field from the spec DTO is mirrored onto `text` (BE field name), and
 * `problemType` is optional here because the FE composer hasn't yet picked
 * a chip on first render.
 */
export type ComplaintComposeDto = Omit<
  ComplaintCreateDto,
  'problemType'
> & {
  orderId?: string;
  orderRatingId?: string;
  customerId?: string;
  visitId?: string;
  rating?: number;
  /** Maps to the BE field `text`; `description` is the canonical name in the spec DTO. */
  text: string;
  attachedImageUrl?: string;
  /** FE-only field: chip type the user picked. Forwarded as a prefix in `text`. */
  problemType?: ComplaintProblemType;
};

/**
 * Server-side body for the BE controller (note: BE field is `text`, not
 * `description`). The shared-type `ComplaintCreateDto` calls it `description`
 * but the controller validates `text` — we send what the BE expects.
 */
interface ComplaintCreateBody {
  orderId?: string;
  orderRatingId?: string;
  customerId?: string;
  visitId?: string;
  rating?: number;
  text: string;
  attachedImageUrl?: string;
}

export function createComplaint(
  slug: string,
  body: ComplaintComposeDto,
): Promise<ComplaintRecord> {
  // Combine the chip label + free text into the persisted `text`. The chip
  // type is informational (the manager sees it) — at the BE we don't have a
  // dedicated `problemType` column today, so we prefix it on the text.
  const prefixed = body.problemType
    ? `[${body.problemType}] ${body.text}`
    : body.text;
  const payload: ComplaintCreateBody = {
    orderId: body.orderId,
    orderRatingId: body.orderRatingId,
    customerId: body.customerId,
    visitId: body.visitId,
    rating: body.rating,
    text: prefixed,
    attachedImageUrl: body.attachedImageUrl,
  };
  return apiPost<ComplaintRecord>(`/${slug}/complaints`, payload);
}

/**
 * Fetch de uma reclamação por id — `GET /:slug/complaints/:id` é real e
 * SessionGuard-ed no BE (complaints.controller.ts), então deep link e hard
 * reload funcionam sem depender de cache local. (O comentário antigo dizia
 * que o BE não expunha o endpoint — defasado. Decisão Caleb 2026-06-10:
 * GET/list definitivos são o caminho canônico.)
 */
export function getComplaint(slug: string, id: string): Promise<ComplaintRecord> {
  return apiGet<ComplaintRecord>(`/${slug}/complaints/${id}`);
}

/**
 * Lista as reclamações do cliente da sessão — `GET /:slug/complaints/mine`
 * (SessionGuard). Usado pela tela Reclamações no mount, então o histórico
 * sobrevive a hard reload e vem do BE, não do sessionStorage.
 */
export function listMyComplaints(
  slug: string,
  _customerId: string,
): Promise<ComplaintRecord[]> {
  return apiGet<ComplaintRecord[]>(`/${slug}/complaints/mine`);
}

// === SessionStorage cache for in-flight complaints ===
// Fallback de UX: mantém a reclamação recém-criada disponível offline-ish
// enquanto o GET real resolve (os endpoints customer GET :id/mine existem;
// o cache é só primeira-pintura, não fonte de verdade).

const COMPLAINT_CACHE_PREFIX = 'complaint:cache:';

export function cacheComplaint(record: ComplaintRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      `${COMPLAINT_CACHE_PREFIX}${record.id}`,
      JSON.stringify(record),
    );
  } catch {
    /* storage blocked — degrade silently */
  }
}

export function readCachedComplaint(id: string): ComplaintRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(
      `${COMPLAINT_CACHE_PREFIX}${id}`,
    );
    return raw ? (JSON.parse(raw) as ComplaintRecord) : null;
  } catch {
    return null;
  }
}

export function clearCachedComplaint(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(`${COMPLAINT_CACHE_PREFIX}${id}`);
  } catch {
    /* ignore */
  }
}

// === LGPD ===

/**
 * Body of `POST /:slug/lgpd-requests`. The BE controller accepts `kind`
 * (instead of the shared-type `type`) plus optional ID fields; the consent
 * audit metadata (`consentMethod`, `consentChipLabel`, `consentOriginalMessage`)
 * is forwarded as `notes` until the BE adds a typed column.
 */
export interface LgpdCreateBody {
  kind: LgpdRequestKind;
  customerId?: string;
  customerCpf?: string;
  customerEmail?: string;
  notes?: string;
  consentMethod?: LgpdConsentMethod;
  consentChipLabel?: string;
  consentOriginalMessage?: string;
}

/**
 * Triggers the LGPD erasure path. For `kind='erasure'` the BE deletes the
 * customer's NoSQL chat data synchronously and returns the protocol number.
 */
export function createLgpdRequest(
  slug: string,
  body: LgpdCreateBody,
): Promise<LgpdRequestProtocolDto> {
  // Audit fields go into `notes` for now — the LGPD controller currently
  // accepts only `notes` text. When the BE adds typed audit columns, this
  // shim can be removed and the fields sent directly.
  const auditNote =
    body.consentMethod || body.consentChipLabel || body.consentOriginalMessage
      ? ` · consent: ${body.consentMethod ?? 'unknown'}${
          body.consentChipLabel ? ' · chip="' + body.consentChipLabel + '"' : ''
        }${
          body.consentOriginalMessage
            ? ' · text="' +
              body.consentOriginalMessage.replace(/"/g, "'") +
              '"'
            : ''
        }`
      : '';
  const payload = {
    kind: body.kind,
    customerId: body.customerId,
    customerCpf: body.customerCpf,
    customerEmail: body.customerEmail,
    notes: (body.notes ?? '') + auditNote || undefined,
  };
  return apiPost<LgpdRequestProtocolDto>(`/${slug}/lgpd-requests`, payload);
}
