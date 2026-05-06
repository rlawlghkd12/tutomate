import type { ChatMessage, SmartCard } from '@tutomate/core';
import { MappingErrorCard } from './SmartCard/MappingErrorCard';
import { ImportPreviewCard } from './SmartCard/ImportPreviewCard';
import { ImportResultCard } from './SmartCard/ImportResultCard';
import { SourceLinkCard } from './SmartCard/SourceLinkCard';

export type DisplayMessage = ChatMessage & { cards?: SmartCard[] };

interface Props {
  message: DisplayMessage;
  onConfirmPreview: (card: Extract<SmartCard, { type: 'importPreview' }>) => void;
  onCancelPreview: () => void;
}

function renderCard(
  c: SmartCard,
  onConfirm: Props['onConfirmPreview'],
  onCancel: Props['onCancelPreview'],
) {
  switch (c.type) {
    case 'mappingError':
      return <MappingErrorCard {...c} />;
    case 'importPreview':
      return (
        <ImportPreviewCard
          {...c}
          onConfirm={() => onConfirm(c)}
          onCancel={onCancel}
        />
      );
    case 'importResult':
      return <ImportResultCard {...c} />;
    case 'sourceLink':
      return <SourceLinkCard {...c} />;
  }
}

export function MessageBubble({ message, onConfirmPreview, onCancelPreview }: Props) {
  const isUser = message.role === 'user';
  return (
    <div className={`max-w-2xl ${isUser ? 'ml-auto' : ''}`}>
      {message.content && (
        <div
          className={`rounded-2xl px-5 py-3 text-lg whitespace-pre-wrap ${
            isUser ? 'bg-blue-600 text-white' : 'bg-gray-100'
          }`}
        >
          {message.content}
        </div>
      )}
      {message.attachments?.map((a, i) => (
        <div key={i} className="text-sm text-gray-500 mt-1">
          📎 {a.name}
        </div>
      ))}
      {message.cards?.map((c, i) => (
        <div key={i} className="mt-2">
          {renderCard(c, onConfirmPreview, onCancelPreview)}
        </div>
      ))}
    </div>
  );
}
