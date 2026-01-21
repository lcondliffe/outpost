import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export default function Card({ children, className = '', title, action }: CardProps) {
  return (
    <div className={cn('glass rounded-xl overflow-hidden', className)}>
      {(title || action) && (
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          {title && (
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {title}
            </h3>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
