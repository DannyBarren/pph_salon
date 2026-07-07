"use client";

import React from "react";
import { AlertOctagon } from "lucide-react";
import { Card, CardBody, Button } from "@/components/ui/primitives";

interface Props {
  children: React.ReactNode;
  /** Label used in the fallback message, e.g. "stylist list". */
  section?: string;
  /** Optional custom fallback renderer. */
  fallback?: (reset: () => void) => React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Section-level error boundary so one bad record can't take down the whole
 * dashboard. Wrap the KPIs, list, and modal independently.
 */
export class SectionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== "undefined") {
      console.error(`[TeamDashboard] error in ${this.props.section ?? "section"}:`, error, info);
    }
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);

    return (
      <Card role="alert">
        <CardBody className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-[var(--color-danger)]">
            <AlertOctagon size={24} aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold">Something went wrong</h3>
            <p className="mt-1 text-sm text-[var(--color-ink-faint)]">
              The {this.props.section ?? "section"} couldn&apos;t be displayed. The rest of the dashboard is unaffected.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.reset}>
            Try again
          </Button>
        </CardBody>
      </Card>
    );
  }
}
