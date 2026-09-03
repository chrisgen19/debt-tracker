"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type SummaryItem = { key: string; label: string; node: ReactNode; className?: string };
/** Chromium fires this when the scroller settles on a new snap target. */
type SnapEvent = Event & { snapTargetInline: Element | null };

type Props = {
  items: SummaryItem[];
  /** Labels the dot group for screen readers. */
  label?: string;
  /** How the rail lays out from `sm` up, where it stops being a carousel. */
  railClassName?: string;
  /** Applied to every slide from `sm` up. */
  slideClassName?: string;
};

/**
 * Summary tiles as a swipeable, snapping rail on phones and a plain grid from `sm` up.
 * Scrolling is native (touch, trackpad, keyboard); the dots only mirror and drive it.
 */
export function SummaryCarousel({
  items,
  label = "Summary cards",
  railClassName = "sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4",
  slideClassName = "sm:w-auto",
}: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const slides = Array.from(rail.children);
    const select = (slide: Element | null) => {
      const index = slide ? slides.indexOf(slide) : -1;
      if (index >= 0) setActive(index);
    };

    if ("onscrollsnapchange" in rail) {
      const onSnap = (event: Event) => select((event as SnapEvent).snapTargetInline);
      rail.addEventListener("scrollsnapchange", onSnap);
      return () => rail.removeEventListener("scrollsnapchange", onSnap);
    }
    // Safari and Firefox: whichever slide covers the middle of the rail is the active one.
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && select(entry.target)),
      { root: rail, rootMargin: "0px -49%" },
    );
    slides.forEach((slide) => observer.observe(slide));
    return () => observer.disconnect();
  }, [items.length]);

  function goTo(index: number) {
    const slide = railRef.current?.children[index];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    slide?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest", inline: "start" });
    setActive(index);
  }

  return (
    <div>
      <div
        ref={railRef}
        className={`snap-rail -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-1 ${railClassName}`}
      >
        {items.map((item) => (
          <div key={item.key} className={`w-[84%] shrink-0 snap-start ${slideClassName} ${item.className ?? ""}`}>{item.node}</div>
        ))}
      </div>
      {items.length > 1 && (
        <div role="group" aria-label={label} className="mt-4 flex items-center justify-center gap-2 sm:hidden">
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => goTo(index)}
              aria-label={item.label}
              aria-current={index === active}
              className={`h-2 rounded-full transition-[width,background-color] duration-300 ${index === active ? "w-6 bg-primary" : "w-2 bg-border"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
