import { act, render } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback, type ReactElement, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useElementSize } from "./useElementSize";

/**
 * jsdom has no `ResizeObserver`. A fake that records every instance and lets
 * a test fire a `contentRect` report directly, standing in for the browser
 * actually resizing the observed element.
 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly callback: ResizeObserverCallback;
  target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.target = target;
  }

  unobserve(): void {
    this.target = null;
  }

  disconnect(): void {
    this.target = null;
  }

  report(width: number, height: number): void {
    const entry = { contentRect: { width, height } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

let original: typeof ResizeObserver | undefined;

beforeEach(() => {
  original = globalThis.ResizeObserver;
  FakeResizeObserver.instances = [];
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  if (original) (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = original;
  else Reflect.deleteProperty(globalThis, "ResizeObserver");
});

function Probe({ onRender }: { onRender: (size: { width: number; height: number } | null) => void }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  onRender(size);
  return <div ref={ref} />;
}

describe("useElementSize", () => {
  it("returns null until the first observation", () => {
    const seen: Array<{ width: number; height: number } | null> = [];
    render(<Probe onRender={(s) => seen.push(s)} />);
    expect(seen[seen.length - 1]).toBeNull();
    expect(FakeResizeObserver.instances).toHaveLength(1);
  });

  it("returns the size from the first reported contentRect", () => {
    const seen: Array<{ width: number; height: number } | null> = [];
    render(<Probe onRender={(s) => seen.push(s)} />);
    const observer = FakeResizeObserver.instances[0];
    if (!observer) throw new Error("expected a ResizeObserver instance");
    act(() => {
      observer.report(400, 300);
    });
    expect(seen[seen.length - 1]).toEqual({ width: 400, height: 300 });
  });

  it("updates on a later report of a different size", () => {
    const seen: Array<{ width: number; height: number } | null> = [];
    render(<Probe onRender={(s) => seen.push(s)} />);
    const observer = FakeResizeObserver.instances[0];
    if (!observer) throw new Error("expected a ResizeObserver instance");
    act(() => {
      observer.report(400, 300);
    });
    act(() => {
      observer.report(1000, 700);
    });
    expect(seen[seen.length - 1]).toEqual({ width: 1000, height: 700 });
  });

  it("ignores a report equal to the current size and never commits for it", () => {
    // Counting commits via Profiler (CorpusMap's own frame-coalescing test
    // technique, metric 13) rather than a render-body counter: a functional
    // `setState` update that returns the same reference as the current state
    // is only an optimization in React, not a guarantee of zero renders for
    // every call site — measured empirically while building this hook, a
    // second, separate same-value dispatch (after a real value had already
    // committed) still produced one commit. The hook itself is written to
    // never call `setSize` at all for an unchanged report (see its own
    // comment), which is what actually earns a real zero here.
    let commits = 0;
    const onRenderProfile: ProfilerOnRenderCallback = () => {
      commits += 1;
    };
    render(
      <Profiler id="probe" onRender={onRenderProfile}>
        <Probe onRender={() => {}} />
      </Profiler>,
    );
    const observer = FakeResizeObserver.instances[0];
    if (!observer) throw new Error("expected a ResizeObserver instance");
    act(() => {
      observer.report(400, 300);
    });
    commits = 0;
    act(() => {
      observer.report(400, 300);
    });
    expect(commits).toBe(0);
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(<Probe onRender={() => {}} />);
    const observer = FakeResizeObserver.instances[0];
    if (!observer) throw new Error("expected a ResizeObserver instance");
    expect(observer.target).not.toBeNull();
    unmount();
    expect(observer.target).toBeNull();
  });
});
