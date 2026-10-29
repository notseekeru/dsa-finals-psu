import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class ErrorBoundary extends Component<Props, State> {
    state: State = { failed: false };

    static getDerivedStateFromError(): State {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("[boundary]", error, info.componentStack);
    }

    render() {
        if (this.state.failed) {
            return (
                <main>
                    <h1>Something broke</h1>
                    <p>Reload the page.</p>
                </main>
            );
        }
        return this.props.children;
    }
}
