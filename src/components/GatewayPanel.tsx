import { GatewaySettings } from '../types';
import { Button } from './ui';
import { GatewayServicePanel } from './GatewayServicePanel';

interface GatewayPanelProps {
  onBack: () => void;
  gateway: GatewaySettings;
  onUpdateGateway: (updates: Partial<GatewaySettings>) => void;
}

export function GatewayPanel({ onBack, gateway, onUpdateGateway }: GatewayPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Button>
        <h2 className="text-lg font-bold text-gradient">Gateway</h2>
        <div className="w-[70px]" />
      </div>
      <GatewayServicePanel gateway={gateway} onUpdateGateway={onUpdateGateway} />
    </div>
  );
}

