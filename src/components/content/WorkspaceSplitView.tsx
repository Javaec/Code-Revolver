import type { ReactNode } from 'react';
import { Card } from '../ui';

interface WorkspaceSplitViewProps {
  listHeader: ReactNode;
  listBody: ReactNode;
  detailHeader: ReactNode;
  detailBody: ReactNode;
}

export function WorkspaceSplitView({
  listHeader,
  listBody,
  detailHeader,
  detailBody,
}: WorkspaceSplitViewProps) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 lg:flex-row">
      <div className="flex max-h-72 flex-col border-b border-white/10 lg:max-h-none lg:w-72 lg:flex-shrink-0 lg:border-b-0 lg:border-r">
        <div className="border-b border-white/10 bg-white/[0.03] p-3">
          {listHeader}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {listBody}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
          {detailHeader}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar">
          {detailBody}
        </div>
      </div>
    </Card>
  );
}
