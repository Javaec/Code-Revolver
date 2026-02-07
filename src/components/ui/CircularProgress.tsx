import { motion } from 'framer-motion';
import { getProgressColorState, getStrokeColorClass, getTextColorClass, ProgressColorState } from '../../utils/progress';

export interface CircularProgressProps {
  /** Used percentage 0-100 */
  value: number;
  /** Circular size */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Label text */
  label?: string;
  /** Whether to show percentage */
  showPercentage?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Get glow filter based on color state
 */
function getGlowFilter(state: ProgressColorState): string {
  switch (state) {
    case 'danger':
      return 'drop-shadow(0 0 6px rgba(244, 63, 94, 0.5))';
    case 'warning':
      return 'drop-shadow(0 0 6px rgba(245, 158, 11, 0.5))';
    case 'success':
      return 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.5))';
  }
}

/**
 * Circular Progress Indicator Component
 */
export function CircularProgress({
  value,
  size = 80,
  strokeWidth = 8,
  label,
  showPercentage = true,
  className = '',
}: CircularProgressProps) {
  // Ensure value is within 0-100 range
  const clampedValue = Math.max(0, Math.min(100, value));
  const remaining = Math.round(100 - clampedValue);
  
  const colorState = getProgressColorState(clampedValue);
  const strokeColorClass = getStrokeColorClass(colorState);
  const textColorClass = getTextColorClass(colorState);
  const glowFilter = getGlowFilter(colorState);
  
  // SVG calculations
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;
  const center = size / 2;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        style={{ filter: glowFilter }}
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-700/50"
        />
        
        {/* Progress circle */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className={strokeColorClass}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showPercentage && (
          <span className={`text-sm font-bold ${textColorClass}`}>
            {remaining}%
          </span>
        )}
        {label && (
          <span className="text-[8px] text-slate-500 uppercase tracking-wider">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export default CircularProgress;
