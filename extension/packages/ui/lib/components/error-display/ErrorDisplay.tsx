import { ErrorHeader } from './ErrorHeader.js';
import { ErrorResetButton } from './ErrorResetButton.js';
import { ErrorStackTraceList } from './ErrorStackTraceList.js';

type ErrorDisplayProps = {
  error: unknown;
  resetErrorBoundary: (...args: unknown[]) => void;
};

export const ErrorDisplay = ({ error, resetErrorBoundary }: ErrorDisplayProps) => (
  <div className="flex items-center justify-center bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
    <div className="w-full max-w-md space-y-8">
      <ErrorHeader />
      <ErrorStackTraceList error={error instanceof Error ? error : undefined} />
      <ErrorResetButton resetErrorBoundary={resetErrorBoundary} />
    </div>
  </div>
);
