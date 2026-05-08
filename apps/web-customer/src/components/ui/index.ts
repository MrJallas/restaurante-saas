/**
 * Barrel UI primitives — Phase 3 (C1).
 *
 * Os callsites antigos importam direto do path do arquivo
 * (`../../../../components/ui/PillButton`) e continuam funcionando — este
 * barrel é aditivo, não substituiu nada. Permite imports mais limpos no
 * código novo de C2/C3:
 *
 *   import { AssistantBlock, SuggestionChip, ToolCallIndicator } from '@/components/ui';
 *
 * Mantemos a ordem alfabética pra que o diff de adicionar primitivo
 * novo seja mínimo (1 linha, posição estável).
 */

// Existing primitives — re-exportados pra que o barrel seja completo
// e nada force callsites a misturar import direto + barrel.
export { Avatar } from './Avatar';
export { AvatarStack } from './AvatarStack';
export { BlinkingCursor } from './BlinkingCursor';
export { BottomSheet } from './BottomSheet';
export { Bubble } from './Bubble';
export { CountdownCircle } from './CountdownCircle';
export { FoodPlaceholder } from './FoodPlaceholder';
export { MenuDrawer } from './MenuDrawer';
export { MenuItemRow } from './MenuItemRow';
export { PillButton } from './PillButton';
export { PlayIcon } from './PlayIcon';
export { QRPattern } from './QRPattern';
export { Row } from './Row';
export { SoftInput } from './SoftInput';

// New primitives — Phase 3 (C1).
export { AssistantBlock, AssistantText, SuggestionChipRow } from './AssistantBlock';
export { ContextualInputExpand } from './ContextualInputExpand';
export { ContinuationHome } from './ContinuationHome';
export { ManagerBubble } from './ManagerBubble';
export { OverlaySalonMap } from './OverlaySalonMap';
export type { SalonTable, SalonTableStatus, SalonZone } from './OverlaySalonMap';
export { SuggestionChip } from './SuggestionChip';
export { ToolCallIndicator } from './ToolCallIndicator';
export type { ToolCallCategory } from './ToolCallIndicator';
