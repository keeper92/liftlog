'use client';

import * as React from 'react';
import * as RechartsPrimitive from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<
  string,
  {
    label?: string;
    color?: string;
  }
>;

interface ChartContextValue {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChartConfig() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error('Chart components must be used within a <ChartContainer />');
  }
  return context.config;
}

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig;
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ className, children, config, style, ...props }, ref) => {
    const variableStyle = React.useMemo<React.CSSProperties>(() => {
      const nextStyle: React.CSSProperties = {};
      for (const [key, value] of Object.entries(config)) {
        if (value.color) {
          (nextStyle as Record<string, string>)[`--color-${key}`] = value.color;
        }
      }
      return nextStyle;
    }, [config]);

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={ref}
          className={cn(
            'w-full text-xs',
            '[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground',
            '[&_.recharts-cartesian-grid_line]:stroke-border/70',
            '[&_.recharts-tooltip-cursor]:stroke-border',
            className,
          )}
          style={{ ...variableStyle, ...style }}
          {...props}
        >
          <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    );
  },
);
ChartContainer.displayName = 'ChartContainer';

const ChartTooltip = RechartsPrimitive.Tooltip;

interface ChartTooltipPayloadItem {
  dataKey?: string | number;
  name?: string;
  value?: string | number;
  color?: string;
}

interface ChartTooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  label?: string;
  payload?: ChartTooltipPayloadItem[];
  indicator?: 'dot' | 'line';
  hideLabel?: boolean;
}

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  ({ active, payload, label, className, indicator = 'dot', hideLabel = false, ...props }, ref) => {
    const config = useChartConfig();

    if (!active || !payload || payload.length === 0) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn('rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-sm', className)}
        {...props}
      >
        {!hideLabel && label && (
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
        )}
        <div className="space-y-1">
          {payload.map((item, idx) => {
            const key = String(item.dataKey ?? item.name ?? idx);
            const itemConfig = config[key];
            const itemLabel = itemConfig?.label ?? item.name ?? key;
            const itemColor = item.color || itemConfig?.color || `var(--color-${key})`;

            return (
              <div key={`${key}-${idx}`} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {indicator === 'dot' ? (
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: itemColor }} />
                  ) : (
                    <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: itemColor }} />
                  )}
                  <span className="text-xs text-muted-foreground">{itemLabel}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = 'ChartTooltipContent';

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
};
