import { motion } from 'framer-motion';
import { getProgressColorState, getBgColorClass, getTextColorClass } from '../../utils/progress';

export interface LinearProgressProps {
  value: number;
  label?: string;
  subLabel?: string;
  className?: string;
}

export function LinearProgress({ value, label, subLabel, className = '' }: LinearProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  const displayValue = Math.round(clampedValue);
  const colorState = getProgressColorState(clampedValue);
  const bgColorClass = getBgColorClass(colorState);
  const textColorClass = getTextColorClass(colorState);

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-medium">
        <span className="text-slate-500">{label}</span>
        <span className={textColorClass}>{displayValue}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-800/50 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${bgColorClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      {subLabel && (
        <div className="text-[11px] text-slate-400 font-medium mt-0.5">
          {subLabel}
        </div>
      )}
    </div>
  );
}

export default LinearProgress;
