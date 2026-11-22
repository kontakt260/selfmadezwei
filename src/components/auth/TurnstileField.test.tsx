import { act, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reset = vi.fn();
type WidgetProps = {
  onSuccess?: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  onUnsupported?: () => void;
  onBeforeInteractive?: () => void;
  onAfterInteractive?: () => void;
  options?: { size?: string };
};
const widgetRender = vi.fn<(props: WidgetProps) => void>();
const widget = (): WidgetProps => widgetRender.mock.lastCall?.[0] ?? {};
const windowWidth = window.innerWidth;

vi.mock("@marsidev/react-turnstile", () => ({
  DEFAULT_SCRIPT_ID: "cf-turnstile-script",
  Turnstile: forwardRef(function MockTurnstile(props: WidgetProps, ref: Ref<unknown>) {
    widgetRender(props);
    useImperativeHandle(ref, () => ({ reset }));
    return <div data-testid="turnstile" />;
  }),
}));

async function loadField(siteKey: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
  return import("./TurnstileField");
}

beforeEach(() => {
  reset.mockClear();
  widgetRender.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete window.turnstile;
  document.getElementById("cf-turnstile-script")?.remove();
  window.innerWidth = windowWidth;
});

describe("TurnstileField", () => {
  it("renders nothing without a site key", async () => {
    const { TurnstileField, TURNSTILE_ENABLED } = await loadField("");
    const { container } = render(<TurnstileField onReadyChange={vi.fn()} />);
    expect(TURNSTILE_ENABLED).toBe(false);
    expect(container).toBeEmptyDOMElement();
  });

  it("reports ready after a successful check and not ready when it expires", async () => {
    const { TurnstileField } = await loadField("site-key");
    const onReady = vi.fn();
    render(<TurnstileField onReadyChange={onReady} />);

    act(() => widget().onSuccess?.("token"));
    expect(onReady).toHaveBeenLastCalledWith(true);

    act(() => widget().onExpire?.());
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  it("requests a new token after every server answer", async () => {
    const { TurnstileField } = await loadField("site-key");
    const onReady = vi.fn();
    const { rerender } = render(<TurnstileField onReadyChange={onReady} resetSignal={{ a: 1 }} />);
    act(() => widget().onSuccess?.("token"));
    expect(reset).not.toHaveBeenCalled();

    rerender(<TurnstileField onReadyChange={onReady} resetSignal={{ a: 2 }} />);

    expect(reset).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  it("explains a failed check and offers a retry", async () => {
    const { TurnstileField } = await loadField("site-key");
    const onReady = vi.fn();
    window.turnstile = {} as NonNullable<typeof window.turnstile>;
    render(<TurnstileField onReadyChange={onReady} />);

    act(() => widget().onError?.());
    expect(screen.getByRole("alert")).toHaveTextContent("konnte nicht geladen werden");
    expect(onReady).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the retry when the script never answers", async () => {
    const { TurnstileField } = await loadField("site-key");
    vi.useFakeTimers();
    const onReady = vi.fn();
    render(<TurnstileField onReadyChange={onReady} />);

    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("konnte nicht geladen werden");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  it("clears the hint when a late token still arrives", async () => {
    const { TurnstileField } = await loadField("site-key");
    vi.useFakeTimers();
    const onReady = vi.fn();
    render(<TurnstileField onReadyChange={onReady} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    act(() => widget().onSuccess?.("token"));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(onReady).toHaveBeenLastCalledWith(true);
  });

  it("does not time out while the person answers a challenge", async () => {
    const { TurnstileField } = await loadField("site-key");
    vi.useFakeTimers();
    render(<TurnstileField onReadyChange={vi.fn()} />);

    act(() => widget().onBeforeInteractive?.());
    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loads a blocked script again on retry", async () => {
    const { TurnstileField } = await loadField("site-key");
    vi.useFakeTimers();
    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    document.head.appendChild(script);
    render(<TurnstileField onReadyChange={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(document.getElementById("cf-turnstile-script")).toBeNull();
    expect(reset).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains an unsupported browser without a pointless retry", async () => {
    const { TurnstileField } = await loadField("site-key");
    const onReady = vi.fn();
    render(<TurnstileField onReadyChange={onReady} />);

    act(() => widget().onUnsupported?.());

    expect(screen.getByRole("alert")).toHaveTextContent("Ihr Browser unterstützt");
    expect(screen.queryByRole("button", { name: "Erneut versuchen" })).toBeNull();
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  it("uses the compact widget on phones and the wide one above", async () => {
    const { TurnstileField } = await loadField("site-key");
    window.innerWidth = 375;
    const phone = render(<TurnstileField onReadyChange={vi.fn()} />);
    expect(widget().options?.size).toBe("compact");
    phone.unmount();

    window.innerWidth = 1024;
    render(<TurnstileField onReadyChange={vi.fn()} />);
    expect(widget().options?.size).toBe("flexible");
  });

  it("explains the wait when the check takes longer", async () => {
    const { TurnstileField } = await loadField("site-key");
    vi.useFakeTimers();
    render(<TurnstileField onReadyChange={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Sicherheitsprüfung läuft");
  });

  it("shows no waiting hint while the person has to answer a challenge", async () => {
    const { TurnstileField } = await loadField("site-key");
    vi.useFakeTimers();
    render(<TurnstileField onReadyChange={vi.fn()} />);

    act(() => widget().onBeforeInteractive?.());
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("takes up space only while a visible challenge is shown", async () => {
    const { TurnstileField } = await loadField("site-key");
    render(<TurnstileField onReadyChange={vi.fn()} />);
    const wrapper = screen.getByTestId("turnstile").parentElement as HTMLElement;
    expect(wrapper.className).toContain("absolute");

    act(() => widget().onBeforeInteractive?.());
    expect(wrapper.className).not.toContain("absolute");

    act(() => widget().onAfterInteractive?.());
    expect(wrapper.className).toContain("absolute");
  });
});
