'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * `useTableMerge` — bridges LLM tool calls of `request_table_merge` to the
 * `OverlaySalonMap` UX described in `docs/features/customer-host-model.md`.
 *
 * The LLM emits `request_table_merge` with no `targetTable` when it detects
 * intent ("quero juntar com a mesa do lado") but doesn't know which table.
 * The chat handler routes the call through this hook:
 *
 *   1. `handleToolCall(call)` is invoked with the raw tool envelope
 *   2. If the call already has `targetTable`, it's passed through unchanged
 *   3. Otherwise the hook opens the salon-map overlay and returns a Promise
 *      that resolves when the customer taps a table — the resolved value is
 *      the SAME tool envelope re-emitted with `targetTable` filled in
 *
 * The chat handler awaits the promise, then dispatches the resolved call
 * back to the AI service (which is now able to actually create the merge
 * request). Net effect: the customer sees `··· USANDO request_table_merge ···`
 * → overlay opens → tap mesa → overlay closes → confirmation bubble.
 *
 * State machine (single in-flight slot — re-entrancy is rare in practice
 * because the overlay blocks the chat):
 *
 *   idle               · overlayOpen=false, pendingResolveRef=null
 *   awaiting_target    · overlayOpen=true,  pendingResolveRef=fn
 *   selected → idle    · resolve called, refs cleared
 *
 * Important: `selectTable(num)` must be called by `OverlaySalonMap.onSelect`
 * (or whatever the salon-map exposes); the hook does NOT subscribe to the
 * overlay's events — caller wires them.
 */

interface ToolCallEnvelope {
  name: string;
  arguments: { targetTable?: number;[key: string]: unknown } | undefined;
}

export function useTableMerge() {
  const [overlayOpen, setOverlayOpen] = useState(false);
  // Holds the promise resolver while the overlay is open. Refs (not state)
  // because we don't want to re-render every time it flips, AND we need the
  // identity stable across renders so the awaiting promise resolves.
  const pendingResolveRef = useRef<
    ((call: ToolCallEnvelope) => void) | null
  >(null);
  // Holds the original call so we can re-emit it with `targetTable` filled.
  const pendingCallRef = useRef<ToolCallEnvelope | null>(null);

  /**
   * Inspect a tool call. Returns:
   *  - `null` if the call isn't `request_table_merge` (caller should dispatch
   *    normally)
   *  - the original envelope (sync) if `targetTable` is already set (just
   *    pass through to the AI service)
   *  - a Promise resolving to the enriched envelope when the customer picks
   *    a table from the overlay
   */
  const handleToolCall = useCallback(
    (
      call: ToolCallEnvelope,
    ): ToolCallEnvelope | Promise<ToolCallEnvelope> | null => {
      if (call.name !== 'request_table_merge') return null;
      if (call.arguments?.targetTable) return call; // already targeted
      pendingCallRef.current = call;
      return new Promise<ToolCallEnvelope>((resolve) => {
        pendingResolveRef.current = (next) => {
          resolve(next);
          setOverlayOpen(false);
        };
        setOverlayOpen(true);
      });
    },
    [],
  );

  /**
   * Called by the overlay when the customer taps a table. Resolves the
   * pending promise from `handleToolCall` with the enriched envelope and
   * closes the overlay.
   */
  const selectTable = useCallback((targetTable: number) => {
    const original = pendingCallRef.current;
    const resolve = pendingResolveRef.current;
    if (!original || !resolve) return;
    resolve({
      name: 'request_table_merge',
      arguments: { ...(original.arguments ?? {}), targetTable },
    });
    pendingCallRef.current = null;
    pendingResolveRef.current = null;
  }, []);

  /**
   * Customer dismissed the overlay without picking. Resolve the pending
   * promise with the original (untargeted) call so the chat handler knows
   * the user cancelled — it can choose to drop the dispatch or surface an
   * AI bubble like "tá bom, deixei pra outra hora".
   */
  const cancelOverlay = useCallback(() => {
    const resolve = pendingResolveRef.current;
    const original = pendingCallRef.current;
    if (resolve && original) {
      resolve(original);
    }
    pendingCallRef.current = null;
    pendingResolveRef.current = null;
    setOverlayOpen(false);
  }, []);

  return {
    overlayOpen,
    setOverlayOpen,
    handleToolCall,
    selectTable,
    cancelOverlay,
  };
}
